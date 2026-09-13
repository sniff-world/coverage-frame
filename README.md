# CoverageFrame: reasoned absence over a bounded question space

A small LinkML schema family for the one thing a knowledge graph cannot say
with an edge: **why an answer is missing**. Biolink's `negated` can state that
an asserted relationship is false. Nothing in Biolink, ECO, or GO can state,
per cell over a declared question space, that nobody has looked, that evidence
exists but sits under a stated review bar, that no ortholog exists to observe,
or that the method cannot resolve the entity. CoverageFrame types 6
causes of absence, each bound to prior art where prior art exists.

**A yes needs a pointer. A no needs a procedure.**

These schemas run in production at [sniff.world](https://sniff.world), a
governed canine-genetics knowledge graph. The IDs resolve:
[`https://sniff.world/schema/coverage-frame`](https://sniff.world/schema/coverage-frame).

**Repository version 1.0.0** (see [CHANGELOG.md](CHANGELOG.md)); the
three schema files carry their own versions in the table below.

## The schema family

| file | version | contents |
|---|---|---|
| [`schema/sniff-coverage-frame.yaml`](schema/sniff-coverage-frame.yaml) | 0.2.8 | Core: `CoverageFrame`, `FrameCell`, `CellStatusEnum`, `DarkCauseEnum`. One class pair, two enums. |
| [`schema/sniff-coverage-frame-provenance.yaml`](schema/sniff-coverage-frame-provenance.yaml) | 0.3.14 | `SearchProtocol`, `PopulationDefinition`, positive controls. The procedure behind the no. |
| [`schema/sniff-coverage-frame-delta.yaml`](schema/sniff-coverage-frame-delta.yaml) | 0.3.4 | `FrameDelta`, `CellTransition`. Darkness is perishable; change is typed. |

The core is deliberately small and sits beside Biolink rather than forking it.
`CoverageFrame` and `SearchProtocol` declare their Biolink posture with
`implements` (a conformance binding, not a subclass and not an
`exact_mappings`): a FrameCell is a companion `InformationContentEntity`,
not an Association mixin. The knowledge graph maps the territory, the coverage
plane maps the map, and the two join on node CURIEs. Enum values that have a
Biolink or ECO counterpart say so on the value (`see_also`, `close_mappings`).

## Author your own frame

A frame is a template with two populations and a protocol. Five steps, and a
minimal skeleton to copy:

1. **Name the question** as a sentence a stranger can test, and pick the two
   populations it ranges over (for example: a set of human disease genes, and
   the set of your organism's one-to-one orthologs). Give each population a
   definition with a version in its id; when the selection changes, bump it.
2. **Write the protocol**: the sources you query (as `infores:` CURIEs), the
   bar you apply (a named, versioned dial, not a number in prose), and the
   precedence order in which causes are assigned when several could apply.
3. **Plant controls on both sides**: a few subjects independently known to be
   answerable, and one subject per cause you expect to assign that is
   independently known dark for that cause (a paper, a registry query, a source
   read, with its date). If a positive does not light, or a darkness control lands
   on a different cause, the frame does not publish its dark cells.
4. **Run, and give every expected cell one status**: `answered` with a
   citation, `negated` with a citation, or `dark` with exactly one cause.
5. **Validate** with the commands under Validation below, and put your
   example's assay name in its `_meta.assay` so `check-cause-controls.py`
   can bind controls to it.

```json
{
  "id": "example:frame/my-question",
  "question": "Does a published <organism> model exist for this human disease gene?",
  "subject_population_ref": "example:population/human-disease-genes@1",
  "object_population_ref": "example:population/organism-orthologs@1",
  "protocol_ref": "example:protocol/my-search@1",
  "expected_cardinality": 3,
  "answered_count": 1,
  "dark_count": 2,
  "dark_by_cause": { "unstudied": 1, "unreachable": 1 },
  "cells": [
    { "subject": "HGNC:11998", "symbol": "TP53", "status": "answered", "assertion_ref": "PMID:00000000" },
    { "subject": "HGNC:12345", "symbol": "GENE2", "status": "dark", "dark_cause": "unstudied" },
    { "subject": "HGNC:23456", "symbol": "GENE3", "status": "dark", "dark_cause": "unreachable" }
  ]
}
```

The hardest field is `expected_cardinality`. It is the size of the question,
not of the answer: every subject-object pair the two populations produce, before
any search. If the number surprises you, the populations are wrong, not the
count. Two things are not yet in this repository and are named here rather than
implied. A second-organism frame at production scale (the mouse example is a
sampled seed). And the per-cell pointer on an answered cell: the schema declares
`association` for it, and the published frames do not yet fill it. An answered
canine cell today carries the criteria it met and the ortholog confidence; the
record identifiers behind it (the ClinVar gene-condition record and the Ensembl
homology) are held upstream and are not on the cell. Both are open items, not
features.

An **intersection frame** stacks several frames that share one subject axis. It
names its `constituents` and carries no cause tallies of its own: causes stay
on the constituent frames, and an empty `dark_by_cause` on an intersection is
the rule, not a gap. `check-examples.py` enforces the arithmetic both ways.

## The live frame (release 2026-09-06, data as of 2026-08-13, read at generation time)

One production frame asks: *Does a canine model foundation exist for this human disease gene under ClinVar 3-star review plus an assertable one-to-one ortholog?*

| | |
|---|---|
| Expected cells | 16,754 |
| Answered (an assertion exists under the protocol's criteria) | 124 |
| Dark, by cause | 16,630 |

Each dark cell carries one typed cause:

| cause | cells |
|---|---|
| `no_disease_anchor` | 11,161 |
| `below_bar` | 5,362 |
| `unreachable` | 107 |

Causes are assigned by a declared precedence funnel (unreachable → method_limited → no_disease_anchor → unstudied → below_bar → absent),
and the frame is published only when its positive controls (TP53, F8, VWF) are
observed as answered AND its darkness controls (DAZ3 for `unreachable`, TBP for `below_bar`, A1BG for `no_disease_anchor`) each land on the
cause they are independently known to carry. A protocol that cannot find what is
independently known to exist does not publish its dark cells; a protocol that
has never demonstrated a cause on a known case may not assign it.

Every control says what kind of evidence it stands on (`basis_kind`): a paper
(independent of every database the protocol queries), a different database
(independent of the source, not of the world), or the protocol's own source read
by hand with a dated receipt (catches builder bugs and wrong filters, which is
most of the value; catches no error in the source). A same-source control on a
mutable database is a world-movement tripwire: when its receipt facts stop
holding in the ingested source, its `outcome` is `world_moved`, the frame still
ships while another held control covers the cause, and the delta carries the
cell. A control that fails while its receipt facts still hold is `failed`, the
funnel is wrong, and nothing ships. Every date in these files is a UTC calendar
date.


## The frame moved (sniff:delta/2026-09-04..2026-09-06)

Between the 2026-09-04 and 2026-09-06 releases,
a `frame_moved` delta recorded 0 typed transition(s).
The protocol or the populations changed, so these transitions are annotations of a changed question and NOT knowledge flow. They are not comparable as coverage movement.
See [`examples/coverage-frame-delta.json`](examples/coverage-frame-delta.json).

## Generality

The same pipeline, pointed at a different taxon, emits
[`examples/mouse-model-frame.json`](examples/mouse-model-frame.json): the same
question over mouse models. The pattern is not overfitted to one bridge.

## Prior art

The honest version of the novelty claim, with receipts, lives in
[PRIOR-ART.md](PRIOR-ART.md). The short form: single-cause, record-scoped
cousins exist (ECO:0000035 and GO's ND code, FHIR `data-absent-reason`,
Wikidata `novalue`), and Biolink's own maintainers named this gap in 2019
([biolink-model#247](https://github.com/biolink/biolink-model/issues/247)).
No vocabulary we could find types the cause of absence per cell over a
declared, bounded question space. Corrections and refutations are welcome as
issues; the file states each claim with its source.

## The 6 causes, and what each one binds to

Prior art above looks backward, one row per existing vocabulary. This is the
same audit read forward, one row per cause. Bindings were verified 2026-08-19
against Biolink v4.4.4, the ECO 2026-07-10 release, GO, and FHIR.

| cause | asserts | bound to | why nothing else fits |
|---|---|---|---|
| `absent` | Studied, and the entity or relationship does not exist. | `biolink:negated`, exact | Fully covered, and conceded as prior art. GO's NOT qualifier and HPO negative phenotype annotation already say this. |
| `unstudied` | No study addressing this question in this species was found. | `ECO:0000035`, close | The nearest term in any evidence ontology, long deployed in GO as the ND code (`ECO:0000307`, verified against ECO's own gaf mapping). ECO's comment on the term already assumes "a more-or-less exhaustive search has been conducted", and that is the gap: it attaches to a single annotation, so there is no way to **declare** what was searched, against what expected set, or to check the assumption. It can say nothing was found, never how much was looked for. |
| `no_disease_anchor` | The question could not be asked of this subject: no anchor exists in the source the frame bridges from. | none | Minted after `unstudied` was read as "nobody has looked at this gene" when the computed meaning was "no anchor to bridge from". Opposite facts under one label. This is ascertainment darkness, not literature darkness, and no vocabulary checked separates the two. |
| `below_bar` | Evidence exists but sits under a stated review bar. | none | Adjacent to evidence strength, which is ECO's domain, but no ECO term names evidence that is below a threshold set downstream by a consumer. The bar here is a named, versioned dial rather than a constant, so the term has to reference a declared policy instead of asserting one. |
| `unreachable` | No ortholog or entity exists for the assay to observe. | none in Biolink, ECO or GO | Structurally distinct from both not-looked and looked-and-absent: the observation is impossible for this subject. FHIR's `not-applicable` is a record-scoped cousin; what is unclaimed is the same distinction per cell over a declared question space. |
| `method_limited` | The method cannot resolve this class of entity even where the underlying data are present. | none in Biolink, ECO or GO | GIAB stratifications are the field already agreeing that this needs its own layer, in genome coordinates only and never generalized. FHIR's `unsupported` is a record-scoped cousin. |
No vocabulary checked in the life-science knowledge-graph stack types any of
these per cell over a declared question space, and that absence is the
contribution as well as the request. Record-scoped and cell-scoped cousins do
exist outside that stack, in clinical informatics and in official statistics;
PRIOR-ART.md credits them and states precisely what is left unclaimed.

**What would close each gap**, offered as a request rather than a claim:

- `below_bar` needs a term that **references** a declared threshold rather than
  fixing one, because the bar is a consumer's policy and differs per pipeline.
  A flat term cannot carry it.
- `unreachable` needs a term for structurally unobservable, separable from
  unknown, so a coverage denominator can honestly exclude it.
- `method_limited` needs GIAB's idea lifted out of genome coordinates into a
  domain-independent term.

If any of these already exist under a name we missed, that is the most useful
issue anyone could file here. The claim is that they do not, stated with its
verification date and the versions checked, so it is checkable rather than
asserted.

## The pipeline

A no needs a procedure, so the procedure is here. Every shipped protocol's
`pipeline` URI resolves to a file under [`pipeline/`](pipeline/): the exact
bytes of the emitter that produced the frames in `examples/`.

| script | emits | sha256 (LF-normalized) |
|---|---|---|
| [`build-coverage-frames.mjs`](pipeline/build-coverage-frames.mjs) | the canine frame, its cells, and the cell index | `df264a29754f994c…` |
| [`build-coverage-composition.mjs`](pipeline/build-coverage-composition.mjs) | the OMIA lens frame and the intersection frame | `911717f670924900…` |
| [`build-coverage-frame-delta.mjs`](pipeline/build-coverage-frame-delta.mjs) | the typed delta between two releases | `900ed528699d9339…` |
| [`build-mouse-coverage-frame.mjs`](pipeline/build-mouse-coverage-frame.mjs) | the mouse demo frame | `ec45007632dc7cd8…` |

The canine frame's protocol is **hash-locked**: the source substrate pins the
sha256 of its builder per protocol version ([`pipeline/PINS.json`](pipeline/PINS.json)),
refuses to re-pin without a version bump, and `check-pipeline.py` in this
repository recomputes the hash of the published copy on every CI run. If the
bytes here ever differ from the bytes that ran, CI fails. The other three
scripts are published with their hashes as a commitment and are not yet pinned
per version.

These scripts read the source substrate (local data planes, release manifests,
pinned population selections) and are not runnable standalone. What they give a
reader is the procedure itself: the filters, the funnel order, the controls, and
the exact place each cause is assigned.

## Validation

CI runs `linkml-lint`, `gen-json-schema`, and `linkml-validate` on every object
in every example
(see [.github/workflows/validate.yml](.github/workflows/validate.yml)), the
same checks these schemas pass in the source repository on every change.

**Validating an instance document.** Validate each object against its own
class. `CoverageFrame` is the schema's `tree_root` (so `gen-json-schema`
produces a root for one frame), but a release document is an envelope holding
several frames plus their protocols and populations, so passing the whole
document to `linkml-validate` will not work: the instances are inside it.

The frames published here are `ProvenancedCoverageFrame`, not the base
`CoverageFrame`. They carry a release, a scope, and references to their
protocol and populations. Naming the base class is the most likely way to get
confusing errors:

```bash
# one frame, extracted from the "frames" array
linkml-validate -s schema/sniff-coverage-frame-provenance.yaml -C ProvenancedCoverageFrame frame.json

# and the rest, each against its own class
#   protocols[]   -> SearchProtocol          (provenance schema)
#   populations[] -> PopulationDefinition    (provenance schema)
#   cells[]       -> FrameCell               (core schema)
#   delta         -> FrameDelta              (delta schema)
```

`check-conformance.py` does exactly this for every object in every example and
runs in CI, so the claim that these documents conform is checked rather than
asserted. The core stays deliberately small so this stays workable: one class
pair and two enums, with everything else in the importable modules.

## Contributing

Issues are the right channel for everything: a refutation of a prior-art row,
a term candidate, a frame you authored elsewhere, a check that should exist.
Pull requests against `schema/` cannot be merged here, because the files are
regenerated from the source substrate; open the issue and the change lands
upstream and flows back on the next release.

## Provenance and sync

The source of truth for these schemas is Sniff's build substrate, where
gates verify the served copies, the frame figures, and the enum funnel on
every deploy; the canonical copies resolve under
[https://sniff.world/schema/](https://sniff.world/schema/). This repository
is the citable, DOI-carrying mirror; it is regenerated, never hand-edited.

## License and citation

Two licenses, because this repository holds two kinds of thing.

- **The schemas and examples are CC0-1.0** (see [LICENSE](LICENSE)): a public
  domain dedication, matching [linkml-model](https://github.com/linkml/linkml-model).
  A schema is infrastructure, and requiring attribution as a license condition
  taxes the registries and pipelines most likely to adopt it. Credit belongs in
  the citation record, not in a notice you have to propagate.
- **The code is MIT** (see [LICENSE-CODE](LICENSE-CODE)): `build-staging.mjs`
  and the CI workflow. CC0 on software muddies warranty and patent
  expectations, so tooling is licensed separately, as LinkML does.

The examples are aggregate counts, source CURIEs, and hashes describing our own
pipeline, plus a small number of ortholog assignments read from the Alliance of
Genome Resources API and phene identifiers from OMIA, each cited in the file that
carries it. Alliance data is CC BY 4.0; OMIA is CC BY. Those terms govern those
records; the CC0 dedication covers the counts, hashes and schema work that are ours.

**Frame data is a separate object.** These terms cover the schema family. A
published CoverageFrame carries the terms of the sources it was computed from,
and says so in its own provenance.

Please cite via [CITATION.cff](CITATION.cff). Citation is how this gets credited,
and it is asked for rather than required.
