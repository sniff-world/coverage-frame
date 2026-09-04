# Changelog

Repository releases carry a single version; each schema file also carries its own
`version:` slot, listed in the README table.

## 1.0.0 (unreleased)

First public release. Core 0.2.8, provenance 0.3.14, delta 0.3.4.

- `DarknessControl` and `darkness_controls` on `SearchProtocol`: one held-out cell
  per cause the tallies claim, independently known dark for that cause, asserted to
  receive it. The canine frame plants DAZ3 (`unreachable`), TBP (`below_bar`) and
  A1BG (`no_disease_anchor`); the mouse demo plants DAZ3 and OR2J3. `check-examples.py`
  requires a control for every claimed cause and fails on a mismatch. Canine protocol
  version 9 to 10; the calibration set is part of the procedure.
- Controls carry `basis_kind` (independent literature, independent source, or the
  protocol's own source read by hand) and `outcome` (`held`, `world_moved`, `failed`).
  A same-source control whose receipt facts no longer hold routes to `world_moved`
  and the frame ships while a held control still covers the cause; a control that
  fails with its facts intact is a funnel defect and nothing ships. Canine protocol
  10 to 11. All dates are UTC calendar dates.

- `infores:` now expands to `https://w3id.org/biolink/infores/`, matching Biolink,
  so registry CURIEs round-trip.
- `ENSEMBL`, `HGNC`, `MGI`, `OMIA`, and `NCBITaxon` prefixes are declared in the core.
- `negated` and `absent` no longer claim `biolink:negated` as a `meaning` (it is a
  slot, not a concept); both carry it as `see_also`, and `absent` states that its
  status is `negated`, never `dark`.
- The delta module no longer redefines the core's `symbol` slot.
- The generated README has one branch per delta kind; a `correction` delta was
  previously rendered under the frame-moved heading with an empty subject.
- `check-examples.py` enforces the arithmetic: answered + dark = expected, cause
  tallies sum to dark_count, intersection frames carry no tallies, and `absent`
  is never paired with `dark`.
- `check-cause-controls.py` reads an example's assay from `_meta.assay`.
- CITATION.cff and .zenodo.json state both licenses and the release version.
- The emitters are published under `pipeline/`; every protocol's `pipeline` URI
  resolves to one of them, and the canine builder is hash-locked to its protocol
  pin (`check-pipeline.py`). Canine protocol version 8 to 9 for that change alone.
