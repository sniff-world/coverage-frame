#!/usr/bin/env python3
"""Every object in every example validates against its own class, with linkml-validate.

WHY THIS EXISTS, AND WHY THE KEY CHECK WAS NOT ENOUGH

`check-examples.py` asks whether every key in an example is declared *somewhere*
in the schema family. That is a real check and it caught a real defect. It also
cannot see the defect it was standing next to: a key declared on one class,
appearing on an instance of a different class.

That is not hypothetical. Three of these documents shipped in exactly that state:

  * the demonstration frame inlined `search_protocol` as an object and named its
    populations with `subject_population`. The base class rejects the first, the
    provenanced class wants the second as a reference. The example conformed to
    neither class in the family while every count in it reconciled.
  * its cells carried `symbol`, declared nowhere, passing the key check because
    `symbol` is a real word in a real schema somewhere else.
  * the README told a reader to validate each frame against `CoverageFrame`. The
    frames we publish are `ProvenancedCoverageFrame`, so following the
    instructions produced six errors.

Every one of those is invisible to a key check and immediate under instance
validation. So this runs the tool a reader would run, on every object, in CI.

WHY A CLASS MAP IS ACCEPTABLE HERE

The earlier argument against this check was that a class-per-path map would
itself drift. It would, if it were large. It is six entries, it lives next to
the documents it describes, and a wrong entry fails loudly rather than silently:
if a container is mapped to the wrong class, validation fails immediately, and
if a new container appears with no mapping, UNMAPPED below fails the run. The
map cannot drift quietly, which was the actual objection.

Exit 0 = every object validates. Exit 1 = one did not, or a container is
unmapped.
"""

import glob
import json
import os
import subprocess
import sys
import tempfile

CORE = "schema/sniff-coverage-frame.yaml"
PROV = "schema/sniff-coverage-frame-provenance.yaml"
DELTA = "schema/sniff-coverage-frame-delta.yaml"

# container key -> (class, schema that declares it)
CLASS_MAP = {
    "frames": ("ProvenancedCoverageFrame", PROV),
    "frame": ("ProvenancedCoverageFrame", PROV),
    "populations": ("PopulationDefinition", PROV),
    "protocols": ("SearchProtocol", PROV),
    "delta": ("FrameDelta", DELTA),
    "cells": ("FrameCell", CORE),
}

# Document-envelope keys that hold no instances. Kept separate from CLASS_MAP so
# that "not an instance container" is a stated decision rather than an omission.
NOT_INSTANCES = {"_meta", "cell_index", "cell_index_sha256", "schema_provenance"}


def validate(obj, cls, schema):
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(obj, fh)
        run = subprocess.run(
            ["linkml-validate", "-s", schema, "-C", cls, path],
            capture_output=True,
            text=True,
        )
        out = run.stdout + run.stderr
        if "No issues found" in out:
            return None
        errs = [ln.strip() for ln in out.splitlines() if "[ERROR]" in ln]
        return errs or [out.strip().splitlines()[-1] if out.strip() else "unknown failure"]
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def main():
    files = sorted(glob.glob("examples/*.json"))
    if not files:
        print("check-conformance: no examples found", file=sys.stderr)
        return 1

    checked = 0
    failures = []
    unmapped = []

    for fn in files:
        with open(fn, encoding="utf-8") as fh:
            doc = json.load(fh)
        if not isinstance(doc, dict):
            failures.append((fn, "-", 0, "document root is not an object"))
            continue
        for key, value in doc.items():
            if key in NOT_INSTANCES:
                continue
            if key not in CLASS_MAP:
                unmapped.append((fn, key))
                continue
            cls, schema = CLASS_MAP[key]
            items = value if isinstance(value, list) else [value]
            for i, obj in enumerate(items):
                errs = validate(obj, cls, schema)
                checked += 1
                if errs:
                    failures.append((fn, key, i, cls, errs))

    for row in failures:
        fn, key, i, cls, errs = row if len(row) == 5 else (*row, [])
        print(f"  FAIL  {os.path.basename(fn)}  {key}[{i}] as {cls}")
        for e in errs[:3]:
            print(f"          {e[:200]}")

    for fn, key in unmapped:
        print(
            f"  FAIL  {os.path.basename(fn)}  container '{key}' has no class mapping. "
            f"Add it to CLASS_MAP, or to NOT_INSTANCES if it holds no instances. "
            f"An unmapped container is unchecked, and unchecked is how this class shipped."
        )

    if failures or unmapped:
        print()
        print(
            f"check-conformance: {len(failures)} object(s) do not conform"
            + (f", {len(unmapped)} container(s) unmapped" if unmapped else "")
            + "."
        )
        return 1

    print(
        f"check-conformance: {checked} object(s) across {len(files)} example(s) validate "
        f"against their own class with linkml-validate."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
