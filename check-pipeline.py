#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""check-pipeline.py: the published emitter is the pinned emitter.

"A no needs a procedure." Every protocol shipped in examples/ carries a `pipeline`
URI. This check proves three things, and refuses to pass vacuously:

  1. every `pipeline` URI points into this repository's pipeline/ directory and the
     file it names exists here;
  2. the canine frame's builder, which the source substrate pins by sha256 per
     protocol version, hashes to the pinned value (pipeline/PINS.json), so the
     bytes a reader can open are the bytes that produced the frame;
  3. the protocol version a frame's protocol id carries (`@N`) is the version the
     pin was taken at, so a frame cannot cite a newer or older procedure than the
     one that ran.

Hashes are computed over LF-normalized text, the same rule the substrate uses, so
a checkout on any platform gives the same digest.
"""
import glob
import hashlib
import json
import os
import re
import sys

PINS = os.path.join('pipeline', 'PINS.json')
PIPELINE_DIR = 'pipeline'
URI_RE = re.compile(r'^https://github\.com/sniff-world/coverage-frame/blob/[^/]+/pipeline/([A-Za-z0-9_.-]+)$')


def sha256_lf(path):
    with open(path, 'rb') as fh:
        data = fh.read().replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def protocols_in(doc):
    """Every object with a `pipeline` key, wherever it sits in the document."""
    if isinstance(doc, dict):
        if 'pipeline' in doc:
            yield doc
        for v in doc.values():
            yield from protocols_in(v)
    elif isinstance(doc, list):
        for v in doc:
            yield from protocols_in(v)


def main():
    if not os.path.exists(PINS):
        print('check-pipeline: pipeline/PINS.json missing; refusing to pass without a pin', file=sys.stderr)
        return 1
    with open(PINS, encoding='utf-8') as fh:
        pins = json.load(fh)
    failures = 0
    seen = 0
    for path in sorted(glob.glob('examples/*.json')):
        with open(path, encoding='utf-8') as fh:
            doc = json.load(fh)
        for proto in protocols_in(doc):
            seen += 1
            uri = str(proto.get('pipeline', ''))
            m = URI_RE.match(uri)
            if not m:
                failures += 1
                print(f'  FAIL {path}: pipeline "{uri}" does not point into this repository\'s pipeline/ directory', file=sys.stderr)
                continue
            script = m.group(1)
            local = os.path.join(PIPELINE_DIR, script)
            if not os.path.exists(local):
                failures += 1
                print(f'  FAIL {path}: pipeline names {script}, which is not published under pipeline/', file=sys.stderr)
                continue
            pid = str(proto.get('id', ''))
            for key, pin in pins.get('pinned', {}).items():
                if not pid.startswith(key + '@'):
                    continue
                version = pid.split('@', 1)[1]
                if version != str(pin.get('protocol_version')):
                    failures += 1
                    print(f'  FAIL {path}: {pid} cites protocol version {version}; the pin was taken at {pin.get("protocol_version")}', file=sys.stderr)
                if pin.get('script') != script:
                    failures += 1
                    print(f'  FAIL {path}: {pid} names {script}; the pin is for {pin.get("script")}', file=sys.stderr)
                digest = sha256_lf(local)
                if digest != pin.get('script_sha256'):
                    failures += 1
                    print(f'  FAIL {path}: {script} hashes to {digest[:16]}…, the pin says {str(pin.get("script_sha256"))[:16]}…; the published bytes are not the bytes that ran', file=sys.stderr)
            print(f'  ok   {path}: {pid or "<protocol>"} -> pipeline/{script}')
    if seen == 0:
        print('check-pipeline: no protocol carries a pipeline URI; refusing to pass vacuously', file=sys.stderr)
        return 1
    if failures:
        print(f'\ncheck-pipeline: {failures} failure(s) across {seen} protocol(s).', file=sys.stderr)
        return 1
    print(f'\ncheck-pipeline: {seen} protocol(s) resolve to published emitters; the pinned builder hashes to its pin.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
