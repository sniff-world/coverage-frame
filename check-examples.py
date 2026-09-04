#!/usr/bin/env python3
"""Every key in every example must be declared by the schema family.

WHY THIS EXISTS. `linkml-lint` and `gen-json-schema` prove the schemas are
well-formed. Neither opens `examples/`, so a shipped artifact could carry a key
no schema declares and CI would stay green. That is not hypothetical: on
2026-08-24, hours before this repository was first published, the mouse demo was
found carrying `positive_controls` on the frame instead of on the SearchProtocol,
with keys `symbol` / `expected` / `observed` / `result` where PositiveControl
declares `subject` / `expected_status` / `observed_status` / `basis`. The
production artifact conformed; the demo, the one example never previously on a
public surface, did not.

A schema whose own examples do not conform to it is worse than no examples, and
this repository's entire argument is that a claim should be checkable.

WHY A KEY CHECK RATHER THAN `linkml-validate`. The release documents are
envelopes: a `_meta` block plus one or more instances. There is deliberately no
bundle or root class (see the README), so validating a whole file as one LinkML
instance cannot work. Validating each inner object against its own class is the
right deep check and needs a class-per-path map that would itself drift. This
check is shallower and cannot drift: every key, anywhere, must be a slot,
attribute, or enum value the family declares.

THE ENVELOPE ALLOWLIST IS EXPLICIT ON PURPOSE. A silent escape hatch would let
the next undeclared key hide inside it. Adding a name here is a deliberate act,
visible in a diff.

Exit 0 = every key is accounted for. Exit 1 = an undeclared key ships.
"""
import glob
import json
import sys

import yaml

# Document-envelope keys. These are the wrapper around the instances, not the
# instances, and the README states there is no root class to declare them.
ENVELOPE = {
    '_meta', 'doc', 'schema', 'generated',   # provenance header on the document
    'frame', 'frames', 'delta',              # instance containers
    'populations', 'protocols', 'cells',     # instance containers
    'cell_index', 'cell_index_sha256',       # the cell index and its receipt
    'schema_provenance',                     # which schema versions produced it
    'schema_version', 'schema_provenance_version',  # the pinned versions of those schemas
    'assay',                                 # names the controls set this example binds to
}


def declared_names():
    names = set()
    for path in sorted(glob.glob('schema/*.yaml')):
        with open(path, encoding='utf-8') as fh:
            doc = yaml.safe_load(fh)
        for slot in (doc.get('slots') or {}):
            names.add(slot)
        for _, cls in (doc.get('classes') or {}).items():
            for slot in (cls.get('slots') or []):
                names.add(slot)
            for attr in (cls.get('attributes') or {}):
                names.add(attr)
            for attr in (cls.get('slot_usage') or {}):
                names.add(attr)
        for _, enum in (doc.get('enums') or {}).items():
            for value in (enum.get('permissible_values') or {}):
                names.add(value)
    return names


def keys_of(obj, acc=None):
    acc = set() if acc is None else acc
    if isinstance(obj, dict):
        for key, value in obj.items():
            acc.add(key)
            keys_of(value, acc)
    elif isinstance(obj, list):
        for value in obj:
            keys_of(value, acc)
    return acc


def frames_in(doc):
    """Every object that looks like a frame: has expected_cardinality or dark_count."""
    if isinstance(doc, dict):
        if 'dark_count' in doc or 'expected_cardinality' in doc:
            yield doc
        for v in doc.values():
            yield from frames_in(v)
    elif isinstance(doc, list):
        for v in doc:
            yield from frames_in(v)


def arithmetic_failures(doc):
    """The tallies a frame publishes must add up, or the frame is a shrug with digits.

    answered + dark == expected_cardinality. A frame that assigns causes has tallies
    that sum to dark_count. An intersection frame (it names constituents) carries no
    cause tallies at all: causes stay on the constituent frames, and an empty
    dark_by_cause there is the rule, not a gap. A cell whose cause is `absent` has
    status `negated`: absent is an evidenced no, never a darkness.
    """
    out = []
    for f in frames_in(doc):
        fid = f.get('id', '<frame without id>')
        a, d, e = f.get('answered_count'), f.get('dark_count'), f.get('expected_cardinality')
        if all(isinstance(x, int) for x in (a, d, e)) and a + d != e:
            out.append(f'{fid}: answered {a} + dark {d} != expected_cardinality {e}')
        causes = f.get('dark_by_cause')
        is_intersection = bool(f.get('constituents'))
        if is_intersection:
            if causes:
                out.append(f'{fid}: an intersection frame must not assign cause tallies; causes stay on its constituents')
        elif isinstance(causes, dict) and isinstance(d, int):
            total = sum(v for v in causes.values() if isinstance(v, int))
            if total != d:
                out.append(f'{fid}: dark_by_cause sums to {total}, expected dark_count {d}')
        for cell in f.get('cells', []) or []:
            if isinstance(cell, dict) and cell.get('dark_cause') == 'absent' and cell.get('status') != 'negated':
                out.append(f"{fid}: cell {cell.get('subject')} has cause absent with status {cell.get('status')}; absent is negated, not dark")
    return out


def darkness_failures(doc):
    """Every cause a frame's tallies claim is demonstrated on a darkness control.

    A positive control proves the instrument finds what exists. A darkness control
    proves it names why it does not: a cell known dark for a specific cause
    independently of the pipeline, asserted to receive that cause. A frame that
    assigns a cause it has never demonstrated on a known case has proven nothing
    about the cells that are the product. Intersection frames assign no cause.
    """
    out = []
    protocols = {}
    def collect(o):
        if isinstance(o, dict):
            if 'cause_precedence' in o or 'positive_controls' in o:
                protocols[o.get('id')] = o
            for v in o.values():
                collect(v)
        elif isinstance(o, list):
            for v in o:
                collect(v)
    collect(doc)
    for f in frames_in(doc):
        if f.get('constituents'):
            continue
        fid = f.get('id', '<frame without id>')
        proto = protocols.get(f.get('search_protocol'))
        if proto is None:
            continue
        claimed = [c for c, n in (f.get('dark_by_cause') or {}).items() if isinstance(n, int) and n > 0]
        controls = proto.get('darkness_controls') or []
        if claimed and not controls:
            out.append(f'{fid}: assigns {", ".join(claimed)} and its protocol carries no darkness control')
        for cause in claimed:
            if not any(c.get('expected_cause') == cause for c in controls):
                out.append(f'{fid}: no darkness control for "{cause}"')
        for c in controls:
            held = c.get('observed_status') == 'dark' and c.get('observed_cause') == c.get('expected_cause')
            outcome = c.get('outcome')
            if outcome == 'failed' or (outcome == 'held' and not held) or outcome not in ('held', 'world_moved'):
                out.append(f"{fid}: darkness control {c.get('subject')} outcome {outcome}: expected {c.get('expected_cause')}, observed {c.get('observed_status')}/{c.get('observed_cause')}")
            if outcome == 'world_moved' and (c.get('basis_kind') != 'same_source_hand_verified' or not c.get('receipt_as_of')):
                out.append(f"{fid}: darkness control {c.get('subject')} claims world_moved without a same-source dated receipt")
            if not c.get('basis'):
                out.append(f"{fid}: darkness control {c.get('subject')} has no basis")
            if c.get('basis_kind') not in ('independent_literature', 'independent_source', 'same_source_hand_verified'):
                out.append(f"{fid}: darkness control {c.get('subject')} does not say what kind of evidence its basis is")
        for cause in claimed:
            if any(c.get('expected_cause') == cause for c in controls) and not any(c.get('expected_cause') == cause and c.get('outcome') == 'held' for c in controls):
                out.append(f'{fid}: every "{cause}" control moved with the world; re-plant one that holds')
    return out


def main():
    declared = declared_names()
    if not declared:
        print('check-examples: no schemas found; refusing to pass vacuously', file=sys.stderr)
        return 1

    examples = sorted(glob.glob('examples/*.json'))
    if not examples:
        print('check-examples: no examples found; refusing to pass vacuously', file=sys.stderr)
        return 1

    failures = 0
    for path in examples:
        with open(path, encoding='utf-8') as fh:
            doc = json.load(fh)
        for msg in arithmetic_failures(doc) + darkness_failures(doc):
            failures += 1
            print(f'  FAIL {path}: {msg}', file=sys.stderr)
        undeclared = sorted(k for k in keys_of(doc) if k not in declared and k not in ENVELOPE)
        if undeclared:
            failures += len(undeclared)
            print(f'  FAIL {path}: {len(undeclared)} undeclared key(s): {", ".join(undeclared)}',
                  file=sys.stderr)
        else:
            print(f'  ok   {path}')

    if failures:
        print(f'\ncheck-examples: {failures} undeclared key(s) across {len(examples)} example(s).',
              file=sys.stderr)
        print('An example carrying a key no schema declares is a promise the schema '
              'never made. Declare the slot, or fix the example.', file=sys.stderr)
        return 1

    print(f'\ncheck-examples: {len(examples)} example(s) conform. '
          f'Every key is a declared slot, attribute, or enum value, '
          f'or a named document-envelope key.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
