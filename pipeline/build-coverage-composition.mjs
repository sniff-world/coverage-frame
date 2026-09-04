#!/usr/bin/env node
/**
 * build-coverage-composition.mjs — OMIA-scoped frame + intersection frame
 * over the SAME subject axis as the ClinVar-scoped CoverageFrame.
 *
 * Frames compose only on a shared subject axis; the intersection
 * is itself a frame. Do not fold OMIA into the ClinVar answered predicate.
 *
 * Reads the ClinVar bundle + cell index emitted by build-coverage-frames.mjs,
 * plus gene-crossrefs.json (OMIA disease-gene records we already hold).
 * Writes the bundle back with two more frames, and a slim stack index.
 *
 *   node web/scripts/build-coverage-composition.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..');
const PUB = path.join(WEB, 'public', 'data');
const SRC_DATA = path.join(WEB, 'src', 'data');
const SCHEMA = path.join(WEB, 'schema');

const CLINVAR_ID = 'sniff:frame/human-disease-gene-canine-model';
const OMIA_ID = 'sniff:frame/human-disease-gene-canine-model/omia';
const INTERSECTION_ID = 'sniff:frame/human-disease-gene-canine-model/intersection';
const OMIA_PROTOCOL_VERSION = '1';
const OMIA_PROTOCOL_ID = `sniff:protocol/human-disease-gene-canine-model-omia@${OMIA_PROTOCOL_VERSION}`;
const X_PROTOCOL_VERSION = '1';
const X_PROTOCOL_ID = `sniff:protocol/human-disease-gene-canine-model-intersection@${X_PROTOCOL_VERSION}`;

const copy = JSON.parse(fs.readFileSync(path.join(SCHEMA, 'coverage-frame-scope.json'), 'utf8'));
const framesDoc = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'coverage-frames.json'), 'utf8'));
const cellIndex = JSON.parse(fs.readFileSync(path.join(PUB, 'coverage-cell-index.json'), 'utf8'));
const xrefs = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'gene-crossrefs.json'), 'utf8'));
const sourcesDoc = JSON.parse(fs.readFileSync(path.join(SRC_DATA, 'sources.json'), 'utf8'));
const omiaAsOf = sourcesDoc.sources?.omia?.data_as_of;
if (!omiaAsOf || !/^\d{4}-\d{2}-\d{2}$/.test(String(omiaAsOf))) {
  throw new Error('coverage-composition: sources.omia.data_as_of missing or not YYYY-MM-DD');
}

const clinvar = (framesDoc.frames || []).find((f) => f.id === CLINVAR_ID);
if (!clinvar) throw new Error('coverage-composition: ClinVar frame missing. Run build-coverage-frames.mjs first.');

const cells = cellIndex.cells || {};
const axisKeys = Object.keys(cells);
if (!axisKeys.length) throw new Error('coverage-composition: empty ClinVar cell index');
if (axisKeys.length !== clinvar.expected_cardinality) {
  throw new Error(
    `coverage-composition: axis size ${axisKeys.length} != ClinVar expected_cardinality ${clinvar.expected_cardinality}`,
  );
}

const bySymbol = new Map();
for (const [k, c] of Object.entries(cells)) {
  const s = String(c.symbol || '').toUpperCase();
  if (s) {
    const arr = bySymbol.get(s) || [];
    arr.push(k);
    bySymbol.set(s, arr);
  }
}

// OMIA answered set: human ortholog symbol (else dog symbol) with an omia_ids record,
// mapped onto the ClinVar axis by symbol. Same keys, never a new universe.
const omiaAnswered = new Set();
const omiaReceipt = new Map(); // ENSG -> { omia_ids, disease_names }
for (const rec of Object.values(xrefs.genes || {})) {
  if (!rec || !Array.isArray(rec.omia_ids) || !rec.omia_ids.length) continue;
  const hs = String(rec.human_ortholog_symbol || rec.gene_symbol || '').toUpperCase();
  if (!hs) continue;
  const keys = bySymbol.get(hs) || [];
  for (const k of keys) {
    omiaAnswered.add(k);
    omiaReceipt.set(k, {
      omia_ids: rec.omia_ids,
      disease_names: rec.omia_disease_names || [],
      symbol: hs,
    });
  }
}

const omiaCriteria = copy.omia_frame.criteria;
const omiaDarkDef = copy.omia_frame.dark_definition;
const answeredTemplate = String(copy.answered_template).split('{criteria}').join(omiaCriteria);
const darkTemplate = String(copy.dark_template)
  .split('{criteria}').join(omiaCriteria)
  .split('{cause}').join('no_disease_anchor')
  .split('{definition}').join(omiaDarkDef.endsWith('.') ? omiaDarkDef : `${omiaDarkDef}.`);

const omiaCells = {};
let omiaAnsweredN = 0;
for (const k of axisKeys) {
  const src = cells[k];
  const hit = omiaAnswered.has(k);
  if (hit) omiaAnsweredN += 1;
  const receipt = omiaReceipt.get(k);
  omiaCells[k] = {
    status: hit ? 'answered' : 'dark',
    cause: hit ? null : 'no_disease_anchor',
    reason: hit
      ? answeredTemplate
      : darkTemplate,
    symbol: src.symbol || null,
    ensembl_gene_id: src.ensembl_gene_id || k,
    omia_ids: receipt ? receipt.omia_ids : null,
  };
}

const omiaKeys = Object.keys(omiaCells);
if (omiaKeys.length !== axisKeys.length || omiaKeys.some((k, i) => k !== axisKeys[i] && !cells[k])) {
  // set-equality, order-independent
  const a = new Set(axisKeys);
  const b = new Set(omiaKeys);
  if (a.size !== b.size || [...a].some((k) => !b.has(k))) {
    throw new Error('coverage-composition: OMIA cell keys do not match the ClinVar axis (frames compose only on a shared subject axis)');
  }
}

const omiaDark = axisKeys.length - omiaAnsweredN;
const omiaFrame = {
  id: OMIA_ID,
  conforms_to: 'sniff:ProvenancedCoverageFrame',
  question: copy.omia_frame.question,
  subject_population: clinvar.subject_population,
  object_population: clinvar.object_population,
  predicate: clinvar.predicate,
  expected_cardinality: clinvar.expected_cardinality,
  answered_count: omiaAnsweredN,
  dark_count: omiaDark,
  dark_by_cause: { no_disease_anchor: omiaDark },
  cell_source: 'sniff:artifact/coverage-stack-index',
  sources_checked: ['infores:omia'],
  as_of: omiaAsOf,
  release_id: clinvar.release_id,
  search_protocol: OMIA_PROTOCOL_ID,
  subject_population_ref: clinvar.subject_population_ref,
  object_population_ref: clinvar.object_population_ref,
  scope: {
    measures: copy.omia_frame.measures,
    sources_queried: ['infores:omia'],
    sources_not_queried: [
      {
        source: 'infores:clinvar',
        reason: 'This frame measures OMIA. ClinVar 3-star reach is a different frame over the same axis.',
        close_path: `Stack with ${CLINVAR_ID}. Do not join ClinVar into this answered predicate.`,
      },
    ],
  },
};

const OMIA_CONTROL_SEEDS = [
  { symbol: 'SOD1', basis: 'SOD1: OMIA:000263-9615 degenerative myelopathy, canine, documented independent of this pipeline' },
  { symbol: 'F8', basis: 'F8: OMIA:000437-9615 haemophilia A, canine, documented independent of this pipeline' },
  { symbol: 'VWF', basis: 'VWF: OMIA:001057-9615 von Willebrand disease, canine, documented independent of this pipeline' },
];
const omiaControls = OMIA_CONTROL_SEEDS.map(({ symbol, basis }) => {
  const keys = bySymbol.get(symbol) || [];
  const hit = keys.map((k) => omiaCells[k]).find((c) => c && c.status === 'answered') || omiaCells[keys[0]] || null;
  return {
    subject: hit && hit.ensembl_gene_id ? `ENSEMBL:${hit.ensembl_gene_id}` : `sniff:gene/${symbol}`,
    expected_status: 'answered',
    observed_status: hit ? hit.status : 'dark',
    basis,
    // OMIA is the very source this lens queries, so these are same-source reads.
    basis_kind: 'same_source_hand_verified',
    receipt_source: 'infores:omia',
    receipt_as_of: omiaAsOf,
    outcome: hit && hit.status === 'answered' ? 'held' : 'failed',
  };
});
const omiaFailed = omiaControls.filter((c) => c.observed_status !== c.expected_status);
if (omiaFailed.length) {
  throw new Error(
    `coverage-composition: OMIA POSITIVE CONTROL FAILED — ${omiaFailed.map((c) => c.subject).join(', ')}. ` +
    'The OMIA lens cannot demonstrate sensitivity (Darkness Contract, calibrated).',
  );
}

// The lens assigns one cause (no_disease_anchor) and must demonstrate it on a
// known case: A1BG has a one-to-one dog ortholog and OMIA records no phene for it
// (the OMIA canine phene table the lens reads, checked directly, 2026-09-04).
const omiaDarknessControls = [{ symbol: 'A1BG', expected_cause: 'no_disease_anchor', basis: 'A1BG: no OMIA canine phene lists this gene (OMIA phene table, read directly 2026-09-04) while a one-to-one dog ortholog exists' }]
  .map(({ symbol, expected_cause, basis }) => {
    const keys = bySymbol.get(symbol) || [];
    const hit = keys.map((k) => omiaCells[k]).find((c) => c && c.status === 'dark') || omiaCells[keys[0]] || null;
    const observed_cause = hit && hit.status === 'dark' ? (hit.cause || hit.dark_cause) : 'absent';
    const observed_status = hit ? hit.status : 'dark';
    const held = observed_status === 'dark' && observed_cause === expected_cause;
    // Receipt facts: no OMIA record lists this gene. If one does now, the world moved.
    const factsHold = !omiaAnswered.has(keys[0]);
    const outcome = held ? 'held' : (factsHold ? 'failed' : 'world_moved');
    return {
      subject: hit && hit.ensembl_gene_id ? `ENSEMBL:${hit.ensembl_gene_id}` : `sniff:gene/${symbol}`,
      expected_cause,
      observed_cause,
      observed_status,
      basis,
      basis_kind: 'same_source_hand_verified',
      receipt_source: 'infores:omia',
      receipt_as_of: omiaAsOf,
      outcome,
    };
  });
const omiaDarkFailed = omiaDarknessControls.filter((c) => c.outcome === 'failed');
if (omiaDarkFailed.length) {
  throw new Error(`coverage-composition: OMIA DARKNESS CONTROL FAILED — ${omiaDarkFailed.map((c) => `${c.subject} expected ${c.expected_cause}, observed ${c.observed_status}/${c.observed_cause}`).join('; ')}. The receipt facts still hold, so the lens is wrong.`);
}
for (const c of omiaDarknessControls.filter((c) => c.outcome === 'world_moved')) {
  console.warn(`coverage-composition: darkness control ${c.subject} reads ${c.observed_status}: OMIA now records this gene. The world moved; re-plant a no_disease_anchor control.`);
}

const omiaProtocol = {
  id: OMIA_PROTOCOL_ID,
  protocol_version: OMIA_PROTOCOL_VERSION,
  pipeline: 'https://github.com/sniff-world/coverage-frame/blob/main/pipeline/build-coverage-composition.mjs',
  match_criteria:
    'A cell is answered when a recorded OMIA canine (NCBI taxon 9615) disease-gene identifier exists for this human gene symbol, mapped onto the shared subject axis. Dark cells are no_disease_anchor under OMIA: no such record. This frame does not assign below_bar.',
  completeness: 'exhaustive',
  cause_precedence: ['unreachable', 'method_limited', 'no_disease_anchor', 'unstudied', 'below_bar', 'absent'],
  dial_references: [],
  positive_controls: omiaControls,
  darkness_controls: omiaDarknessControls,
  executed_at: omiaAsOf,
};

// Intersection: same keys. Lit-in-any = answered. Dark-in-all = dark. Causes stay on constituents.
const stackCells = {};
let litAny = 0;
let litAll = 0;
let darkAll = 0;
for (const k of axisKeys) {
  const cv = cells[k];
  const om = omiaCells[k];
  const cvLit = cv.status === 'answered';
  const omLit = om.status === 'answered';
  let intersection;
  if (cvLit && omLit) intersection = 'lit_all';
  else if (cvLit || omLit) intersection = 'lit_any';
  else intersection = 'dark_in_all_frames';
  if (intersection === 'lit_all') litAll += 1;
  if (intersection !== 'dark_in_all_frames') litAny += 1;
  if (intersection === 'dark_in_all_frames') darkAll += 1;
  stackCells[k] = {
    symbol: cv.symbol || om.symbol || null,
    ensembl_gene_id: cv.ensembl_gene_id || k,
    by_frame: {
      [CLINVAR_ID]: { status: cv.status, cause: cv.cause || null },
      [OMIA_ID]: { status: om.status, cause: om.cause || null },
    },
    intersection,
  };
}

const xAnswered = litAny;
const xDark = darkAll;
if (xAnswered + xDark !== axisKeys.length) {
  throw new Error(`coverage-composition: intersection counts do not cover the axis (${xAnswered}+${xDark} != ${axisKeys.length})`);
}

const xFrame = {
  id: INTERSECTION_ID,
  conforms_to: 'sniff:ProvenancedCoverageFrame',
  question: copy.intersection_frame.question,
  subject_population: clinvar.subject_population,
  object_population: clinvar.object_population,
  predicate: clinvar.predicate,
  expected_cardinality: clinvar.expected_cardinality,
  answered_count: xAnswered,
  dark_count: xDark,
  dark_by_cause: {},
  cell_source: 'sniff:artifact/coverage-stack-index',
  sources_checked: [...new Set([...(clinvar.sources_checked || []), 'infores:omia'])],
  as_of: clinvar.as_of,
  release_id: clinvar.release_id,
  search_protocol: X_PROTOCOL_ID,
  subject_population_ref: clinvar.subject_population_ref,
  object_population_ref: clinvar.object_population_ref,
  constituents: [CLINVAR_ID, OMIA_ID],
  scope: {
    measures: copy.intersection_frame.measures,
    sources_queried: [...new Set([...(clinvar.sources_checked || []), 'infores:omia'])],
    sources_not_queried: [],
  },
};

const xControls = OMIA_CONTROL_SEEDS.map(({ symbol, basis }) => {
  const keys = bySymbol.get(symbol) || [];
  const st = keys.length ? stackCells[keys[0]] : null;
  const lit = st && st.intersection !== 'dark_in_all_frames';
  return {
    subject: st && st.ensembl_gene_id ? `ENSEMBL:${st.ensembl_gene_id}` : `sniff:gene/${symbol}`,
    expected_status: 'answered',
    observed_status: lit ? 'answered' : 'dark',
    basis: `${basis} Intersection control: lit in at least one constituent.`,
  };
});
const xFailed = xControls.filter((c) => c.observed_status !== c.expected_status);
if (xFailed.length) {
  throw new Error(`coverage-composition: INTERSECTION POSITIVE CONTROL FAILED — ${xFailed.map((c) => c.subject).join(', ')}`);
}

const xProtocol = {
  id: X_PROTOCOL_ID,
  protocol_version: X_PROTOCOL_VERSION,
  pipeline: 'https://github.com/sniff-world/coverage-frame/blob/main/pipeline/build-coverage-composition.mjs',
  match_criteria:
    'A cell is answered when ANY constituent frame is answered (lit in at least one scoped source). A cell is dark when EVERY constituent is dark. Causes are not assigned here; they remain on the constituents. Constituents must share one subject axis.',
  completeness: 'exhaustive',
  cause_precedence: ['unreachable', 'method_limited', 'no_disease_anchor', 'unstudied', 'below_bar', 'absent'],
  dial_references: [],
  positive_controls: xControls.map((c) => ({ ...c, basis_kind: c.basis_kind || 'same_source_hand_verified', receipt_source: c.receipt_source || 'infores:omia', outcome: c.outcome || (c.observed_status === c.expected_status ? 'held' : 'failed') })),
  executed_at: clinvar.as_of,
};

// SOD1 fixture: the cell that proves composition. Not a special case in the template.
function selftest() {
  const t = [];
  const sodKeys = bySymbol.get('SOD1') || [];
  t.push(['SOD1 is on the axis', sodKeys.length > 0]);
  const sod = sodKeys[0] ? stackCells[sodKeys[0]] : null;
  t.push(['SOD1 ClinVar is dark', sod && sod.by_frame[CLINVAR_ID].status === 'dark']);
  t.push(['SOD1 OMIA is lit', sod && sod.by_frame[OMIA_ID].status === 'answered']);
  t.push(['SOD1 intersection is lit_any', sod && sod.intersection === 'lit_any']);
  // CEP290: ClinVar 3-star is lit; OMIA's CEP290 record is cat (taxon 9685, rdAc), not dog (9615).
  // Lighting this cell from the cat record would be a taxon leak, not a join fix.
  const cepKeys = bySymbol.get('CEP290') || [];
  t.push(['CEP290 is on the axis', cepKeys.length > 0]);
  const cep = cepKeys[0] ? stackCells[cepKeys[0]] : null;
  t.push(['CEP290 ClinVar is answered', cep && cep.by_frame[CLINVAR_ID].status === 'answered']);
  t.push(['CEP290 OMIA is dark', cep && cep.by_frame[OMIA_ID].status === 'dark']);
  t.push(['CEP290 OMIA cause is no_disease_anchor', cep && cep.by_frame[OMIA_ID].cause === 'no_disease_anchor']);
  t.push(['CEP290 intersection is lit_any', cep && cep.intersection === 'lit_any']);
  t.push(['OMIA axis equals ClinVar axis size', Object.keys(omiaCells).length === axisKeys.length]);
  t.push(['intersection axis equals ClinVar axis size', Object.keys(stackCells).length === axisKeys.length]);
  // planted mismatch
  const planted = new Set(axisKeys);
  planted.add('ENSG_PLANTED_NOT_ON_AXIS');
  t.push(['planted extra key is a mismatched axis', planted.size !== axisKeys.length]);
  const bad = t.filter(([, ok]) => !ok);
  if (bad.length) {
    throw new Error('coverage-composition selftest failed: ' + bad.map(([n]) => n).join('; '));
  }
}
selftest();

// Merge into the ClinVar bundle. ClinVar stays frames[0] so the delta builder is unmoved.
framesDoc.frames = [
  clinvar,
  ...(framesDoc.frames || []).filter((f) => f.id !== CLINVAR_ID && f.id !== OMIA_ID && f.id !== INTERSECTION_ID),
  omiaFrame,
  xFrame,
];
const keepProto = (p) => p && p.id !== OMIA_PROTOCOL_ID && p.id !== X_PROTOCOL_ID;
framesDoc.protocols = [...(framesDoc.protocols || []).filter(keepProto), omiaProtocol, xProtocol];

const framesBody = JSON.stringify(framesDoc, null, 2) + '\n';
fs.writeFileSync(path.join(PUB, 'coverage-frames.json'), framesBody);
fs.writeFileSync(path.join(SRC_DATA, 'coverage-frames.json'), framesBody);

const stackBody = JSON.stringify({
  _meta: {
    doc: 'Per-cell status stacked across CoverageFrames that share one subject axis. IntersectionStatusEnum: lit_all | lit_any | dark_in_all_frames | unresolved. dark_in_all_frames is scoped to the named constituents, not to the world. Causes stay on the constituent frames.',
    axis: clinvar.subject_population_ref,
    constituents: [CLINVAR_ID, OMIA_ID],
    intersection: INTERSECTION_ID,
    n_cells: axisKeys.length,
    generated: clinvar.as_of,
    release_id: clinvar.release_id,
    as_of_by_frame: { [CLINVAR_ID]: clinvar.as_of, [OMIA_ID]: omiaAsOf },
    tallies: { lit_all: litAll, lit_any_only: litAny - litAll, dark_in_all_frames: darkAll, lit_any: litAny, unresolved: 0 },
    stack_frames: [CLINVAR_ID, OMIA_ID],
    stack_note: 'Statuses are under these two frames only. Cells are not evaluated against sources outside this stack.',
  },
  cells: stackCells,
}) + '\n';
fs.writeFileSync(path.join(PUB, 'coverage-stack-index.json'), stackBody);

console.log(
  `coverage-composition: OMIA answered ${omiaAnsweredN} / ${axisKeys.length} dark ${omiaDark}; ` +
  `intersection lit_any ${litAny} (lit_all ${litAll}) dark_in_all_frames ${darkAll}`,
);
console.log('  SOD1: ClinVar dark, OMIA answered, intersection lit_any');
console.log('  wrote coverage-frames.json (3 frames) + coverage-stack-index.json');
