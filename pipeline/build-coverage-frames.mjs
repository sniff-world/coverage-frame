#!/usr/bin/env node
/**
 * build-coverage-frames.mjs — emit the reasoned-absence as machine-readable
 * CoverageFrames (schema/sniff-coverage-frame.yaml family), from data we
 * already compute.
 *
 * v0.3 (the Darkness Contract): the frame ships as a
 * ProvenancedCoverageFrame (schema/sniff-coverage-frame-provenance.yaml):
 * it cites its SearchProtocol (versioned; the gate hashes THIS script against
 * schema/protocol-pins.json so the procedure cannot change silently), its
 * versioned PopulationDefinitions (counts derived from the artifacts, never
 * typed), the dial behind every subjective cause, and PASSING positive
 * controls (held-out cells independently OMIA-documented answerable; a dark
 * cell not shown to LIGHT on a planted positive is worth zero, so a failing
 * control makes this script REFUSE to emit).
 *
 * PROTOCOL_VERSION discipline: bump on ANY behavior change to this script,
 * then re-pin (node scripts/validate-coverage-frames.cjs --repin). The gate
 * refuses a changed script under an unchanged version.
 *
 * Also emits a slim coverage-cell-index.json for agent lookup (workers fetch
 * this static asset; they do not import frontier-map into the Worker bundle).
 *
 *   node web/scripts/build-coverage-frames.mjs
 *     -> public/data/coverage-frames.json
 *     -> public/data/coverage-cell-index.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// v2 (2026-08-13): cells keyed by ENSG (symbols collide; the v1 symbol-keyed
// index silently clobbered 6 cells, caught by the first genuine delta), and
// populations carry intensional definition versions (@<int>), not release
// dates, so a source release reads as world_moved rather than frame_moved.
// Bumped 2 -> 3, then 3 -> 4 on 2026-08-23 (one bump for the whole tone pass). THE SEARCH PROCEDURE DID NOT CHANGE: same queries,
// same filters, same funnel, same controls, so cells emitted under @2 and @3 are
// directly comparable and no coverage figure moved. The only difference is the
// `pipeline` provenance URL, which pointed at a PRIVATE repo and therefore 404'd
// for every reader while naming the private workshop.
//
// The pin refuses a re-pin without a version bump, and that strictness is correct
// even though it over-fires here: it hashes the whole emitter and cannot tell
// provenance from procedure. Paying the price and writing down WHAT changed beats
// moving the constant outside the hashed file to dodge the check.
const PROTOCOL_VERSION = '12'; // 12: population selection text corrected (a doubled clause); the OMIA lens now unions the OMIA disease table with the crossrefs (nine genes lit that OMIA had already named); release 2026-09-06
const PIPELINE_URL = 'https://github.com/sniff-world/coverage-frame/blob/main/pipeline/build-coverage-frames.mjs';
const PROTOCOL_ID = `sniff:protocol/human-disease-gene-canine-model@${PROTOCOL_VERSION}`;
const CLINVAR_REVIEW_DIAL = 'sniff:dial/clinvar-review-floor@1'; // the 3-star expert-review bar behind below_bar
// Population DEFINITION versions: bump only when the selection procedure text
// changes (the gate pins the selection text per version in protocol-pins.json).
// @3 (2026-09-06): the selection TEXT changed (a doubled clause typed into the literal was
// removed); the selection itself did not. The pin refuses a text change under a fixed @n,
// and it is right to: a reader cites the text.
const SUBJECT_POPULATION_ID = 'sniff:population/bridge-touched-human-genes@3';
const OBJECT_POPULATION_ID = 'sniff:population/canine-one2one-ortholog-space@2';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..');
const PUB = path.join(WEB, 'public', 'data');
const SRC_DATA = path.join(WEB, 'src', 'data');
const readAt = (o, d) => d.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);

// Served-copy sync: public/schema/*.yaml is a DERIVED copy of web/schema/*.yaml,
// written here every build so the schema a machine fetches at its own `id` URL
// can never drift from the repo source. validate-coverage-frames.cjs holds the
// equality as a gate arm (belt and suspenders for a hand-edited public copy).
const SCHEMA_SRC = path.join(WEB, 'schema');
const SCHEMA_PUB = path.join(WEB, 'public', 'schema');
const SCOPE_COPY = JSON.parse(fs.readFileSync(path.join(SCHEMA_SRC, 'coverage-frame-scope.json'), 'utf8'));
fs.mkdirSync(SCHEMA_PUB, { recursive: true });
const schemaFiles = fs.readdirSync(SCHEMA_SRC).filter((f) => f.endsWith('.yaml'));
for (const f of schemaFiles) {
  fs.copyFileSync(path.join(SCHEMA_SRC, f), path.join(SCHEMA_PUB, f));
}

const frontier = JSON.parse(fs.readFileSync(path.join(PUB, 'frontier-map.json'), 'utf8'));
let unreach = null;
const urPath = path.join(PUB, 'unreachable-inventory.json');
if (fs.existsSync(urPath)) unreach = JSON.parse(fs.readFileSync(urPath, 'utf8'));

const total = readAt(frontier, '_meta.funnel.total');
const answered = readAt(frontier, '_meta.funnel.kept');
const dark = readAt(frontier, '_meta.funnel.dark');
const byCauseRaw = readAt(frontier, 'headline.by_cause') || {};
const FRONTIER_CAUSE_MAP = { unstudied: 'no_disease_anchor' };
const byCause = {};
for (const [k, n] of Object.entries(byCauseRaw)) {
  const nk = FRONTIER_CAUSE_MAP[k] || k;
  byCause[nk] = (byCause[nk] || 0) + n;
}

if ([total, answered, dark].some((n) => typeof n !== 'number')) throw new Error('coverage-frames: frontier funnel missing');
if (answered + dark !== total) throw new Error(`coverage-frames: funnel does not sum (${answered}+${dark} != ${total})`);
const causeSum = Object.values(byCause).reduce((a, b) => a + b, 0);
if (causeSum !== dark) throw new Error(`coverage-frames: by_cause sums to ${causeSum}, expected dark=${dark}`);

const SRC_INFORES = { clinvar_gene_disease_atoms: 'infores:clinvar', 'gene-orthology': 'infores:ensembl-gene' };
const sourcesChecked = (readAt(frontier, '_meta.sources') || [])
  .map((s) => SRC_INFORES[s.replace(/\.json$/, '')])
  .filter(Boolean);

const asOf = readAt(frontier, '_meta.generated') || readAt(frontier, '_meta.as_of') || null;

// A RELEASE NAMES THE FRAME AS COMPUTED, not the upstream snapshot it read.
// This contract says absence needs a versioned procedure, which makes the
// procedure constitutive of the answer: a frame computed under @7 is a different
// epistemic object from one computed under @4 even over byte-identical upstream
// data. "Same release, different protocol" is therefore a contradiction here, not
// a keying option, and keying the archive by release+protocol would stop
// sniff:release/<date> naming exactly one document — the property the write-once
// guard exists to defend, and the property every citation surface depends on
// (decks, registry entries, the DOI, and FrameDeltas all point at bare ids).
// The upstream snapshot is CONTENT: it rides in the population's source_version
// and in as_of, never in the key.
const dataSnapshotRelease =
  readAt(frontier, '_meta.release_id') || (asOf ? `sniff:release/${asOf}` : null);
const releaseId = 'sniff:release/2026-09-06';

// --- v0.3 populations (counts DERIVED from the artifacts, never typed) -------
const orthology = JSON.parse(fs.readFileSync(path.join(WEB, 'src', 'data', 'gene-orthology.json'), 'utf8'));
const orthGenes = orthology.genes || orthology;
const one2oneCount = Object.values(orthGenes).filter((g) => g && g.ortholog_status === 'one2one').length;
const ensemblRelease = readAt(orthology, '_meta.ensembl_release') || null;
if (!one2oneCount) throw new Error('coverage-frames: gene-orthology one2one count is zero — population derivation broken');

const subjectPopulation = {
  id: SUBJECT_POPULATION_ID,
  source: 'infores:clinvar',
  source_version: dataSnapshotRelease,
  selection:
    'Every human gene touched by the dog-to-human bridge: ClinVar P/LP disease-gene atoms (3-star anchors kept, below-expert-bar signal retained as below_bar) joined to the dog orthology ladder; the count is the human-gene selection funnel total.',
  count: total,
};
const objectPopulation = {
  id: OBJECT_POPULATION_ID,
  source: 'infores:ensembl-gene',
  source_version: ensemblRelease ? `Ensembl Compara release ${ensemblRelease}` : null,
  selection:
    'Dog genes with ortholog_status=one2one in the Ensembl Compara one-to-one set; the moderate OrthoDB/OMA ladder used for reachability is stated in match_criteria, not double-counted here.',
  count: one2oneCount,
};

const frame = {
  id: 'sniff:frame/human-disease-gene-canine-model',
  conforms_to: 'sniff:ProvenancedCoverageFrame',
  question: SCOPE_COPY.question,
  subject_population: 'Human disease genes touched by the dog-to-human bridge',
  object_population: 'Canine orthologs',
  predicate: 'biolink:model_of',
  expected_cardinality: total,
  answered_count: answered,
  dark_count: dark,
  dark_by_cause: byCause,
  cell_source: 'sniff:artifact/frontier-map',
  sources_checked: sourcesChecked,
  as_of: asOf,
  release_id: releaseId,
  search_protocol: PROTOCOL_ID,
  subject_population_ref: subjectPopulation.id,
  object_population_ref: objectPopulation.id,
  scope: {
    measures: SCOPE_COPY.measures,
    sources_queried: sourcesChecked,
    sources_not_queried: [
      {
        source: SCOPE_COPY.omia.source,
        reason: SCOPE_COPY.omia.reason,
        close_path: SCOPE_COPY.omia.close_path,
      },
    ],
  },
};

// Slim cell index for agent serving. Keys are the STABLE cell identity
// (Ensembl gene id; symbol fallback only when no ENSG exists): symbols
// collide, and the v1 symbol-keyed index silently clobbered 6 cells, which
// surfaced as phantom transitions in the first genuine FrameDelta. The
// display symbol travels in the value; lookups by symbol resolve through it.
const CAUSE_DEF = {
  no_disease_anchor: 'dog ortholog exists but no human P/LP disease evidence to bridge from (ascertainment darkness)',
  unstudied: 'a literature or exhaustion search addressing this question found nothing',
  below_bar: 'human P/LP signal exists but sits below the 3-star expert-panel review bar in ClinVar',
  absent: 'the biology genuinely lacks a counterpart for this question',
  unreachable: 'no dog ortholog via any method on the full ladder',
  method_limited: 'the assay or method cannot observe this case',
};
const cellKey = (r) => String(r.ensembl_gene_id || r.entity || '').toUpperCase();
const cells = {};
for (const r of frontier.records || []) {
  const k = cellKey(r);
  if (!k) continue;
  const cause = FRONTIER_CAUSE_MAP[r.cause] || r.cause;
  cells[k] = {
    status: 'dark',
    cause,
    reason: r.reason || CAUSE_DEF[cause] || cause,
    symbol: String(r.entity || '').toUpperCase() || null,
    ensembl_gene_id: r.ensembl_gene_id || null,
  };
}
// Answered / bridgeable foundations from unreachable inventory (not double-listed as dark)
if (unreach && Array.isArray(unreach.records)) {
  for (const r of unreach.records) {
    const k = cellKey(r);
    if (!k || cells[k]) continue;
    if (r.bridgeable === true) {
      cells[k] = {
        status: 'answered',
        cause: null,
        reason: String(SCOPE_COPY.answered_template).replaceAll('{criteria}', SCOPE_COPY.criteria),
        symbol: String(r.entity || '').toUpperCase() || null,
        ensembl_gene_id: r.ensembl_gene_id || null,
        ortholog_confidence: r.ortholog_confidence || null,
      };
    } else if (r.bridgeable === false) {
      cells[k] = {
        status: 'dark',
        cause: 'unreachable',
        reason: 'no dog ortholog via any method (the full ladder)',
        symbol: String(r.entity || '').toUpperCase() || null,
        ensembl_gene_id: r.ensembl_gene_id || null,
      };
    }
  }
}

// The index must be EXHAUSTIVE: one cell per universe member, no clobbering.
// A lossy index refuses to build (this assertion is what the v1 symbol keying
// would have tripped: 16748 cells for a 16754-gene universe).
const nCells = Object.keys(cells).length;
if (nCells !== total) {
  throw new Error(
    `coverage-frames: cell index is lossy — ${nCells} cells for a universe of ${total}. ` +
    'Cell keys must be one-to-one with the population (Darkness Contract, bounded).',
  );
}

// --- v0.3 positive controls (guarantee 3): held-out cells independently
// OMIA-documented answerable BEFORE this pipeline existed (verified against
// src/data/omia-disease-dim.json, canine 9615 records). The protocol must
// find them answered or this script refuses to emit dark cells at all: a
// parsing bug must fail the build, never ship as ignorance.
const CONTROL_SEEDS = [
  { symbol: 'TP53', basis: 'TP53: OMIA:000620-9615 (histiocytic sarcoma), canine, listed by OMIA among the genes associated with this phene, independent of this pipeline. Weaker anchor than F8 and VWF: OMIA records this phene as multifactorial with no key variant known, and removed its candidate variant from the table of likely causal variants. Retained as a control on the recorded association, not on a causal variant.' },
  { symbol: 'F8', basis: 'F8: OMIA:000437-9615 (hemophilia A), canine, documented independent of this pipeline' },
  { symbol: 'VWF', basis: 'VWF: OMIA:001057-9615 (von Willebrand disease), canine, documented independent of this pipeline' },
];
// Controls carry HOW MUCH their basis proves (basis_kind) and WHAT the run did to
// them (outcome). The routing rule for a control that does not hold:
//   - same_source_hand_verified: re-check the receipt facts against the ingested
//     copy of that source. Facts changed -> `world_moved` (emit; the gate insists a
//     held control still covers the cause; the delta carries the cell). Facts
//     unchanged -> `failed` (the funnel is wrong; throw).
//   - independent_*: no mutable receipt, so a mismatch is always `failed`.
// Both branches exist because on a mutable database "the world moved" and "the
// builder broke" look identical from a red CI, and the difference is the whole
// diagnosis.
const clinvarSummary = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'clinvar-gene-summary.json'), 'utf8'));
const CLINVAR_RETRIEVED = readAt(clinvarSummary, '_meta.retrieved') || null;
export function controlOutcome({ held, factsHold, kind }) {
  if (held) return 'held';
  if (kind === 'same_source_hand_verified' && factsHold === false) return 'world_moved';
  return 'failed';
}

const positiveControls = CONTROL_SEEDS.map(({ symbol, basis }) => {
  // Cells are ENSG-keyed; controls are seeded by symbol, so resolve through
  // the value. If several genes share the symbol, the control asks whether the
  // protocol found the documented one: any matching answered cell passes.
  const matches = Object.entries(cells).filter(([, c]) => c.symbol === symbol);
  const hit = matches.find(([, c]) => c.status === 'answered') || matches[0] || null;
  const cell = hit ? hit[1] : null;
  const ensg = cell && cell.ensembl_gene_id ? `ENSEMBL:${cell.ensembl_gene_id}` : `sniff:gene/${symbol}`;
  return {
    subject: ensg,
    expected_status: 'answered',
    observed_status: cell ? cell.status : 'dark',
    basis,
    // OMIA is a different database from the ClinVar anchor this protocol queries.
    basis_kind: 'independent_source',
    receipt_source: 'infores:omia',
    outcome: cell && cell.status === 'answered' ? 'held' : 'failed',
  };
});
const failedControls = positiveControls.filter((c) => c.observed_status !== c.expected_status);

// --- darkness controls: one per cause the tallies claim, each known dark for
// that cause INDEPENDENTLY of this pipeline. Positive controls prove the funnel
// finds what exists; these prove it names why it does not. Both demonstration
// dark cells of the mouse frame were mistyped while every positive control
// passed, which is the exact blindness this set closes.
const DARKNESS_SEEDS = [
  {
    symbol: 'DAZ3', expected_cause: 'unreachable',
    basis: 'DAZ3: the DAZ cluster arose by transposition and amplification of autosomal DAZL onto the primate Y chromosome (Saxena et al. 1996, PMID:8896558); no non-primate genome, the dog included, carries a DAZ gene, so no ortholog exists for the assay to observe',
    basis_kind: 'independent_literature', receipt_source: 'PMID:8896558', receipt_as_of: null,
    factsHold: () => true, // a paper does not move
  },
  {
    symbol: 'TBP', expected_cause: 'below_bar',
    basis: 'TBP: ClinVar holds 28 germline pathogenic or likely pathogenic records for TBP (spinocerebellar ataxia 17) and none reviewed by an expert panel (E-utilities esearch, read 2026-09-04 UTC), so a human anchor exists and sits under the three-star bar',
    basis_kind: 'same_source_hand_verified', receipt_source: 'infores:clinvar', receipt_as_of: '2026-09-04',
    // The receipt, as facts the ingested ClinVar summary can confirm or deny.
    factsHold: (g) => !!g && g.has_below_bar === true && Number(g.n_pathogenic) === 0,
  },
  {
    symbol: 'A1BG', expected_cause: 'no_disease_anchor',
    basis: 'A1BG: ClinVar holds no germline pathogenic or likely pathogenic record for A1BG (E-utilities esearch, read 2026-09-04 UTC) while a one-to-one dog ortholog exists, so the question cannot be asked of this gene from a human anchor',
    basis_kind: 'same_source_hand_verified', receipt_source: 'infores:clinvar', receipt_as_of: '2026-09-04',
    factsHold: (g) => !g || (g.has_below_bar !== true && Number(g.n_pathogenic) === 0),
  },
];
const darknessControls = DARKNESS_SEEDS.map(({ symbol, expected_cause, basis, basis_kind, receipt_source, receipt_as_of, factsHold }) => {
  const matches = Object.entries(cells).filter(([, c]) => c.symbol === symbol);
  const hit = matches.find(([, c]) => c.status === 'dark') || matches[0] || null;
  const cell = hit ? hit[1] : null;
  const observed_cause = cell && cell.status === 'dark' ? cell.cause : (cell ? 'absent' : 'unreachable');
  const observed_status = cell ? cell.status : 'dark';
  const held = observed_status === 'dark' && observed_cause === expected_cause;
  const outcome = controlOutcome({ held, factsHold: factsHold(clinvarSummary.genes ? clinvarSummary.genes[symbol] : undefined), kind: basis_kind });
  const out = { subject: cell && cell.ensembl_gene_id ? `ENSEMBL:${cell.ensembl_gene_id}` : `sniff:gene/${symbol}`, expected_cause, observed_cause, observed_status, basis, basis_kind, receipt_source, outcome };
  if (receipt_as_of) out.receipt_as_of = receipt_as_of;
  return out;
});
const brokenDarkness = darknessControls.filter((c) => c.outcome === 'failed');
if (brokenDarkness.length) {
  throw new Error(
    `coverage-frames: DARKNESS CONTROL FAILED — ${brokenDarkness.map((c) => `${c.subject} expected ${c.expected_cause}, observed ${c.observed_status}/${c.observed_cause}`).join('; ')}. ` +
    'The receipt facts still hold in the ingested source, so the funnel is wrong, and its dark cells may not ship (Darkness Contract, calibrated).',
  );
}
for (const c of darknessControls.filter((c) => c.outcome === 'world_moved')) {
  console.warn(`coverage-frames: darkness control ${c.subject} (${c.expected_cause}) reads ${c.observed_status}/${c.observed_cause}: the world moved (ClinVar retrieved ${CLINVAR_RETRIEVED}, receipt read ${c.receipt_as_of}). Emitting; re-plant a ${c.expected_cause} control.`);
}
if (failedControls.length) {
  throw new Error(
    `coverage-frames: POSITIVE CONTROL FAILED — ${failedControls.map((c) => c.subject).join(', ')} not observed answered. ` +
    'The protocol cannot demonstrate sensitivity, so its dark cells may not ship (Darkness Contract, calibrated).',
  );
}

const searchProtocol = {
  id: PROTOCOL_ID,
  protocol_version: PROTOCOL_VERSION,
  // Public and resolvable. This pointed at a PRIVATE repo until 2026-08-23, which
  // shipped a dead link plus the private org name onto four public surfaces
  // (/cite/, /schema/, /api/v1/coverage/frames.json, /data/coverage-frames.json).
  // The schema requires a resolvable URI; a 404 is not one. Since protocol 9 the
  // URI resolves to the published copy of THIS file in the public schema repo,
  // whose bytes hash to the value protocol-pins.json records for this version;
  // the public repo's check-pipeline.py proves the two are the same bytes.
  pipeline: PIPELINE_URL,
  match_criteria:
    'A cell is answered when the human gene has a 3-star ClinVar P/LP anchor AND an assertable dog ortholog (Compara one2one, or the OrthoDB/OMA moderate ladder for reachability). Dark causes per the precedence funnel; below_bar is denominated by the named dial.',
  completeness: 'exhaustive', // the funnel enumerated every cell in the subject population (total == answered + dark, asserted above)
  cause_precedence: ['unreachable', 'method_limited', 'no_disease_anchor', 'unstudied', 'below_bar', 'absent'],
  dial_references: [CLINVAR_REVIEW_DIAL],
  positive_controls: positiveControls,
  darkness_controls: darknessControls,
  executed_at: asOf,
};

const framesOut = {
  _meta: {
    doc: 'Sniff CoverageFrames: reasoned absence as machine-readable frames. Generated, never hand-maintained. Conforms to schema/sniff-coverage-frame.yaml plus the provenance module, and is verified against them on every build.',
    schema: 'https://sniff.world/schema/coverage-frame',
    schema_provenance: 'https://sniff.world/schema/coverage-frame-provenance',
    generated: asOf,
    release_id: releaseId,
    cell_index: 'sniff:artifact/coverage-cell-index',
  },
  frames: [frame],
  protocols: [searchProtocol],
  populations: [subjectPopulation, objectPopulation],
};
if (!asOf) {
  framesOut._meta.note = 'as_of is null: frontier-map _meta.generated missing — re-run emit-frontier-map.py or stamp the web artifact.';
}

const indexBody = JSON.stringify({
  _meta: {
    doc: 'Slim per-gene index for CoverageFrame agent lookup, keyed by Ensembl gene id (symbol fallback); the display symbol travels in the value. status=dark|answered. Built with coverage-frames.',
    frame: frame.id,
    generated: asOf,
    release_id: releaseId,
    n_cells: Object.keys(cells).length,
  },
  cells,
});
const sha = crypto.createHash('sha256').update(indexBody).digest('hex');

// stamp sha before write
framesOut._meta.cell_index_sha256 = sha;
const framesBody = JSON.stringify(framesOut, null, 2) + '\n';

// public/ = static HTTP; src/data/ = Vite-importable (API/MCP routes cannot import from public/)
fs.writeFileSync(path.join(PUB, 'coverage-frames.json'), framesBody);
fs.writeFileSync(path.join(SRC_DATA, 'coverage-frames.json'), framesBody);
fs.writeFileSync(path.join(PUB, 'coverage-cell-index.json'), indexBody + '\n');

console.log(`build-coverage-frames: 1 frame + cell index (+ ${schemaFiles.length} schema YAMLs synced to public/schema/)`);
console.log(`  ${frame.id}: ${frame.expected_cardinality} = ${frame.answered_count} answered + ${frame.dark_count} dark`, JSON.stringify(frame.dark_by_cause));
console.log(`  as_of=${asOf} release=${releaseId} cells=${Object.keys(cells).length} index_sha=${sha.slice(0, 12)}…`);
console.log('  wrote public/data + src/data coverage-frames.json (importable)');
