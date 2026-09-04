# Prior art, and the honest claim

CoverageFrame claims one thing: no existing vocabulary types the **cause** of
an individual missing answer inside a declared, bounded scientific question
space. This file is the audit behind that sentence, verified against current
releases on 2026-08-19. If something below is wrong, or something is missing,
please open an issue: the claim is maintained by continued checking, and
corrections are part of the record.

The claim used to be broader ("no vocabulary for reasoned absence"). The audit
narrowed it, and the narrowing is recorded here rather than hidden: real
single-cause, record-scoped cousins exist, and they are credited below.

## What each nearest neighbor covers, and what it lacks

| prior art | what it covers | what it lacks | receipt |
|---|---|---|---|
| Biolink `negated` (v4.4.4, 2026-08-10) | A boolean on an association that was formed: subject, predicate, object all asserted, truth value flipped. | Cannot attach to a cell that has no edge. No cause vocabulary of any kind. | [negated](https://biolink.github.io/biolink-model/negated/) |
| Biolink `knowledge_level` / `agent_type` (since v4.2.0) | How and by whom an existing statement was produced. `not_provided` marks a metadata gap on an edge that exists. | All values require an edge to exist. None types why a cell has no edge. | [KnowledgeLevelEnum](https://biolink.github.io/biolink-model/KnowledgeLevelEnum/) |
| ECO:0000035 "no evidence data found" (and its manual-assertion child ECO:0000307, GO's ND code) | The field's best existing analog to `unstudied`: an extensive search was conducted and nothing was found. ~20 years of deployment in GO. Bound as a `close_mappings` on `unstudied` in the core schema. | One flat term for one cause, attached to a single annotation. No sub-typing for below-bar, unreachable, or method-limited. No denominator, no question space, no coverage declaration. | [eco.obo](https://raw.githubusercontent.com/evidenceontology/evidenceontology/master/eco.obo) · [GO evidence codes](https://geneontology.github.io/docs/guide-go-evidence-codes/) |
| GO NOT qualifier / HPO negative phenotype annotation | Evidenced non-existence: studied, demonstrated absent. This is CoverageFrame's `absent` cause, fully conceded as prior art (it maps to `biolink:negated`). | Covers exactly one of the six causes. | [GO annotations](https://geneontology.github.io/docs/go-annotations/) · [HPO downloads](https://human-phenotype-ontology.github.io/downloads.html) |
| ClinGen gene-disease validity (Definitive / Strong / Moderate / Limited / Disputed / Refuted / No Known Disease Relationship, under a versioned SOP with expert panels) | The nearest neighbor to `below_bar` and to `absent` in clinical genomics: a typed, versioned grade on a curated gene-disease pair. `Limited` is evidence under a stated bar; `Disputed` and `Refuted` are evidenced non-support; `No Known Disease Relationship` is a typed assertion of absence made after a panel looked. Conceded as generously as the FHIR row: this is real cause-typing, with provenance, at the pair scope. | Assigned only where a panel curated the pair. No declared question space, no expected cardinality, no population definition, no coverage assertion: it says nothing about a pair nobody curated, which is the common CoverageFrame cell. The bar is the panel's own SOP, not a consumer's declared, versioned dial. Note the seam precisely: CoverageFrame's shipped `below_bar` dial is ClinVar's review-status floor (three stars, reviewed by expert panel, where the panels are largely ClinGen variant curation panels); gene-disease validity is a separate ClinGen curation, and neither is a coverage declaration. | [ClinGen gene-disease validity](https://clinicalgenome.org/curation-activities/gene-disease-validity/) · [ClinGen SOP](https://clinicalgenome.org/docs/) |
| GenCC harmonized gene-disease classifications (Definitive / Strong / Moderate / Supportive / Limited / Disputed Evidence / Refuted Evidence / No Known Disease Relationship, across submitters) | The same grade vocabulary as ClinGen, harmonized across submitting groups, with per-submission provenance. Sniff already ingests it. `Limited` and `No Known Disease Relationship` are the same two cousins of `below_bar` and `absent`. | Same scope as ClinGen: a grade on a curated pair, present only where a submitter looked. No denominator, no population, no protocol, no coverage claim. Two submitters can disagree on one pair, and the harmonization records both, which is provenance rather than a cause on a missing cell. | [GenCC](https://thegencc.org/) · [GenCC terms](https://thegencc.org/faq.html) |
| FHIR `data-absent-reason` (15 codes) and HL7 v3 NullFlavor | The closest prior art in any field: a typed reason why one field on one existing clinical record has no value (unknown, not-asked, masked, unsupported, and so on). | Scoped to a field on a record inside a workflow. No declared question space, no population definition, no search protocol, no expected cardinality. Cause-typing at that scope is real and is conceded here: `not-asked` and `not-performed` separate "nobody looked" from "the process broke" (`error`), and `not-applicable` and `unsupported` are cousins of `unreachable` and `method_limited`. What no code does is get assigned before any record exists, which is the common CoverageFrame cell, or name evidence sitting under a stated, versioned review bar. | [data-absent-reason](https://www.hl7.org/fhir/R4/valueset-data-absent-reason.html) · [NullFlavor](https://terminology.hl7.org/6.5.0/CodeSystem-v3-NullFlavor.html) |
| INSDC/MIxS missing-value reporting | A controlled vocabulary for why one metadata field on one sample record is blank (not applicable, missing, not provided, restricted access, plus sub-terms). | Same record-field scope. Its terms do not separate unstudied from below-bar from unreachable. | [INSDC spec](https://www.insdc.org/technical-specifications/missing-value-reporting/) |
| Wikidata `novalue` / `somevalue` | The best-known production KG separating "definitely no value" from "a value exists but is unknown" from silence. | Three undifferentiated buckets, no causes, no bounded space, no provenance of the absence. | [Wikibase data model](https://wmde.github.io/wikidata-wikibase-architecture/Glossary.html) |
| GIAB stratifications | Typed, machine-readable difficult-region masks: the genomics field already agreeing that method-limited needs its own layer. | Covers one cause, in genome coordinates only. Never generalized. | [giab-stratifications](https://github.com/usnistgov/giab-stratifications) |
| OWL 2 negative assertions, closure axioms, LCWA (Dong et al., Knowledge Vault, KDD 2014; Ren, Pan, Zhao, *Closed World Reasoning for OWL2 with Negation As Failure*) | The closure operator itself: license treating a region's silence as meaningful. CoverageFrame stands on this lineage and says so. | The result of closure is a boolean. Nothing in the lineage types why a closed cell is empty. | [Knowledge Vault](https://www.cs.ubc.ca/~murphyk/Papers/kv-kdd14.pdf) |
| Completeness statements (Motro 1989; Razniewski and Nutt 2011; Darari et al. 2013/2018) | Local completeness declared over parts of a database or RDF source, so query answers can be certified complete. The direct intellectual ancestor of the frame itself. | Certifies that a region is complete. Does not type the cells that remain empty inside it. | [Motro](https://doi.org/10.1145/76902.76904) · [Darari](https://doi.org/10.1145/3196248) |
| "Negative Statements Considered Useful" (Arnaout, Razniewski, Weikum, Pan, 2021) | The academic cousin in spirit: KBs need negation as a first-class citizen; ranks salient negative statements. | Ranks which negatives matter. Never asks what kind of absence each one is. | [arXiv:2001.04425](https://arxiv.org/pdf/2001.04425) |
| SEPIO (legacy and LinkML successor), OBAN | Provenance and evidence for assertions that exist, in the same LinkML ecosystem this schema lives in. | Assertion-first by design. Nothing for the assertion never made. | [sepio-linkml](https://github.com/sepio-framework/sepio-linkml) · [OBAN](https://github.com/EBISPOT/OBAN) |
| DCAT 3, W3C DQV, OMOP/OHDSI Kahn framework | Dataset-level coverage descriptors and aggregate completeness metrics (a dataset is 72% complete). | A percentage over a dataset, not a cause on a cell. None can say, for one missing answer, which of six different true stories applies. | [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/) · [DQV](https://www.w3.org/TR/vocab-dqv/) |

## The gap Biolink named itself

In 2019, Biolink issue [#247](https://github.com/biolink/biolink-model/issues/247)
("need a standard way of encoding gaps in knowledge or questions", filed by
Chris Mungall) named a related gap, sketched in the comments as typed blank RDF
nodes that could be turned into queries. It closed a year later with no shipped
mechanism, and nothing comparable has landed through v4.4.4. CoverageFrame is
offered as one answer to a question the model's own maintainers asked first.
**It is not the blank-node encoding they sketched**, and it does not claim to be
what that issue asked for.

## What remains unclaimed, as far as this audit found

- `below_bar` (evidence exists but sits under a stated, versioned review bar):
  no term in Biolink, ECO, GO, FHIR, or HL7 v3. ClinGen gene-disease validity
  and GenCC DO grade evidence against a bar (`Limited`), and are credited above
  for it; what is unclaimed is a bar the consumer declares as a versioned dial,
  applied per cell over a declared question space, so that a pair nobody curated
  is still typed rather than silent.
- `unreachable` (no entity exists for the assay to observe) and
  `method_limited` (the method cannot resolve the entity class): no term in
  Biolink, ECO, or GO. Record-scoped cousins DO exist in FHIR
  (`not-applicable`, `unsupported`); what is unclaimed is the same distinction
  made per cell over a declared question space rather than per field on a
  record.
- The coverage declaration itself as an assertable object: a bounded question,
  versioned populations, an expected cardinality, a pinned search protocol,
  positive controls, and typed deltas. Completeness appears elsewhere only as
  a metric computed about a corpus afterward, never as a thing a pipeline
  asserts and a gate verifies.

## Verification notes

Biolink was checked against the live model YAML at v4.4.4; ECO against the
2026-07-10 release OBO; FHIR against the published R4/R5 value set; HL7
NullFlavor against THO 6.5.0. ClinGen gene-disease validity and GenCC were
added 2026-09-03 after an outside read named their omission; the seven-grade
vocabulary was checked against the ClinGen curation page and GenCC's published
terms on that date. Two GO wiki pages (ND, NOT propagation) refused
direct fetch and are corroborated via the geneontology.github.io docs mirror;
if you hold the primary wiki wording and it differs, that is exactly the kind
of issue to open.
