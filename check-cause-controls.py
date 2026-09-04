#!/usr/bin/env python3
"""The pipeline may not invent absence.

WHY THIS EXISTS. `check-examples.py` proves every key is declared. It passed a
file that was factually wrong, because shape-valid launders content-invalid: the
mouse demo typed OR2J3 as `unreachable` ("no ortholog or entity exists for the
assay to observe") while Alliance returns a stringent mouse ortholog for it. The
cell failed the match criteria on the disease-annotation half, which is
`unstudied`. Every key was declared. Every count reconciled. The claim was false.

POSITIVE CONTROLS PROVE WE FIND WHAT EXISTS. This proves we do not invent
absence, and for an instrument whose entire product is typed absence that is the
more important direction. A frame that under-reports darkness is merely
conservative; a frame that over-reports it is manufacturing ignorance and calling
it measurement.

Controls live in `cause-controls.json`, each with a query receipt. A control
asserted from memory is not a control, which is exactly how the failure this
guards against happened: a cause was called "biologically sensible" with no query
behind it.

Exit 0 = no example claims a forbidden cause for a control gene.
Exit 1 = the pipeline invented absence.
"""
import glob
import json
import sys

CONTROLS = 'cause-controls.json'

# A CONTROL IS SCOPED TO ITS ASSAY. Learned on the web-side gate's first run:
# matching on bare symbol flagged DAZ3 in the canine delta while quoting a MOUSE
# ortholog (MGI:1342328), against a frame whose question is "Is there a
# documented canine model for this human disease gene?" A mouse ortholog is no
# evidence at all about a dog ortholog, and asserting one against the other is
# the same error the controls exist to catch, committed by the catcher. So every
# example declares the assay its cells are about, and a control binds only
# inside its own.
ASSAY_OF = {
    'examples/mouse-model-frame.json': 'mouse',
    'examples/coverage-frames.json': 'canine',
    'examples/coverage-frame-delta.json': 'canine',
}


def forbidden_of(control):
    """A control forbids one cause (`forbidden_cause`) or several (`forbidden_causes`)."""
    if 'forbidden_causes' in control:
        return list(control['forbidden_causes'])
    return [control['forbidden_cause']]


def cells_of(doc):
    """Every cell-like object anywhere in an example, without assuming a shape."""
    found = []

    def walk(node):
        if isinstance(node, dict):
            if 'subject' in node and ('dark_cause' in node or 'status' in node):
                found.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(doc)
    return found


def main():
    try:
        with open(CONTROLS, encoding='utf-8') as fh:
            controls = json.load(fh)['controls']
    except (OSError, KeyError, ValueError) as exc:
        print(f'check-cause-controls: cannot read {CONTROLS} ({exc}); '
              f'refusing to pass without controls', file=sys.stderr)
        return 1

    if not controls:
        print('check-cause-controls: control set is empty; refusing to pass vacuously',
              file=sys.stderr)
        return 1

    unscoped = [c for c in controls if not c.get('assay')]
    if unscoped:
        print('check-cause-controls: control(s) without an assay: '
              + ', '.join(c['symbol'] for c in unscoped)
              + '. An unscoped control gets weighed against questions it never answered.',
              file=sys.stderr)
        return 1

    examples = sorted(glob.glob('examples/*.json'))
    if not examples:
        print('check-cause-controls: no examples found; refusing to pass vacuously',
              file=sys.stderr)
        return 1

    failures = 0
    checked = 0
    for path in examples:
        with open(path, encoding='utf-8') as fh:
            doc = json.load(fh)
        # An example names its own assay in `_meta.assay` (the way to add a new
        # organism without editing this script); the map below is the fallback for
        # the three shipped examples, which predate that key.
        meta = doc.get('_meta') if isinstance(doc, dict) else None
        assay = (meta or {}).get('assay') or ASSAY_OF.get(path.replace(chr(92), '/'))
        if assay is None:
            print(f'  FAIL {path}: example declares no assay. Put `"assay": "<name>"` in its `_meta`, '
                  f'and add controls for that assay to {CONTROLS}; a control cannot be bound to a '
                  f'question nobody named.', file=sys.stderr)
            failures += 1
            continue
        scoped = {c['subject']: c for c in controls if c['assay'] == assay}
        if not scoped:
            continue
        for cell in cells_of(doc):
            ctrl = scoped.get(cell.get('subject'))
            if not ctrl:
                continue
            checked += 1
            if cell.get('dark_cause') in forbidden_of(ctrl):
                failures += 1
                receipt = ctrl.get('receipt', {})
                hit = receipt.get('stringent_hit') or receipt.get('ortholog') or '?'
                print(
                    f'  FAIL {path}: {ctrl["symbol"]} ({ctrl["subject"]}) is typed '
                    f'"{cell.get("dark_cause")}", but {ctrl["because"]} '
                    f'({hit}, stringencyFilter={receipt.get("stringencyFilter", "?")}, read '
                    f'{receipt.get("read_on", "?")}).',
                    file=sys.stderr)

    if failures:
        print(f'\ncheck-cause-controls: {failures} invented absence(s).', file=sys.stderr)
        print('A cause is a claim about the world, not a label. Re-query before typing it.',
              file=sys.stderr)
        return 1

    if not checked:
        print('check-cause-controls: no control bound to any example in its own assay; '
              'the control set has drifted off the artifacts and proves nothing',
              file=sys.stderr)
        return 1

    guarded = sorted({c['assay'] for c in controls})
    unguarded = sorted(set(ASSAY_OF.values()) - set(guarded))
    print(f'check-cause-controls: {checked} control cell(s) across {len(examples)} '
          f'example(s); none claims a cause its receipt forbids. '
          f'Guarded assays: {", ".join(guarded)}.')
    if unguarded:
        # An unguarded surface that prints nothing reads as a guarded one.
        print(f'  UNGUARDED in this direction: {", ".join(unguarded)}. Building those controls '
              f'needs verified receipts; a control asserted without one is not a control.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
