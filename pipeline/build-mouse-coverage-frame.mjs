#!/usr/bin/env node
/**
 * build-mouse-coverage-frame.mjs — same CoverageFrame question, different taxon.
 *
 * Question: does this human disease gene have a reciprocal one-to-one mouse
 * ortholog that carries Alliance disease annotations (MGI via the Alliance of
 * Genome Resources)?
 *
 * This is a DEMONSTRATION / talk artifact, completeness: sampled. It is NOT a
 * live consumer claim and is NOT wired into prebuild. A full-universe run uses
 * the Alliance bulk DISEASE-ALLIANCE-JSON dump (see
 * docs/coverage-frames/mouse-model-generality.md). Until then the protocol may
 * not emit `absent`, `below_bar`, or `no_disease_anchor`: a sampled protocol can
 * assign three of the enum's causes, and it says so rather than padding the
 * tallies with zeros for causes it cannot reach.
 *
 * THE ASSAY IS ONE-TO-ONE, and the cause comes from Alliance's own flags. An
 * earlier version typed a cell `unstudied` whenever a stringent ortholog existed
 * without disease annotations. Two of the seed's dark cells showed why that was
 * wrong. DAZ3's only stringent mouse hit is Dazl, whose reciprocal-best human
 * partner is DAZL: the mouse genome has no DAZ (the cluster is a primate Y-linked
 * duplication of DAZL), so no entity exists for the assay to observe and the
 * honest cause is `unreachable`. OR2J3's stringent hit Or2j3 has two OTHER human
 * olfactory receptors as reciprocal bests: an entity exists, and a one-to-one
 * method cannot resolve a many-to-many family, so the honest cause is
 * `method_limited`. Both facts are readable from isBestScore /
 * isBestScoreReverse on the Alliance orthology API, which is where this builder
 * now reads them.
 *
 * Offline: reads the committed Alliance snapshot (v2, with reciprocal receipts).
 * Refresh:  node web/scripts/build-mouse-coverage-frame.mjs --refresh
 *
 *   node web/scripts/build-mouse-coverage-frame.mjs
 *     -> web/data/coverage-frame-demos/mouse-model-frame.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(ROOT, 'data', 'coverage-frame-demos');
const SNAP = path.join(DEMO, 'alliance-ortholog-snapshot.json');
const OUT = path.join(DEMO, 'mouse-model-frame.json');
const CORE_SCHEMA = path.join(ROOT, 'schema', 'sniff-coverage-frame.yaml');
const PROV_SCHEMA = path.join(ROOT, 'schema', 'sniff-coverage-frame-provenance.yaml');
const POSITIVE_CONTROLS = ['TP53', 'SOD1', 'F8'];
const MOUSE = 'NCBITaxon:10090';
const HUMAN = 'NCBITaxon:9606';
const ONE_TO_ONE_DIAL = 'sniff:dial/reciprocal-best-orthology@1';
const ALLIANCE = 'https://www.alliancegenome.org/api';
const HEADERS = { accept: 'application/json', 'user-agent': 'sniff.world coverage-frame demo (mouse)' };

const schemaVersion = (file) => ((fs.readFileSync(file, 'utf8').match(/^version:\s*(\S+)/m) || [])[1] || 'unknown');
const yes = (v) => v === true || v === 'Yes' || (v && typeof v === 'object' && v.name === 'Yes');

// ---- Alliance reads (refresh only) -------------------------------------------
async function orthologsOf(id, taxon) {
  const r = await fetch(`${ALLIANCE}/gene/${id}/orthologs?stringencyFilter=stringent&limit=500`, { headers: HEADERS });
  if (!r.ok) throw new Error(`alliance: ${id} orthologs HTTP ${r.status}`);
  const j = await r.json();
  const rows = (j.results || []).map((x) => ({ inner: x.geneToGeneOrthologyGenerated || x, raw: x }));
  const hits = rows
    .filter(({ inner }) => String(inner.objectGene?.taxon?.curie || '') === taxon)
    .map(({ inner, raw }) => ({
      id: inner.objectGene.primaryExternalId,
      symbol: inner.objectGene.geneSymbol?.displayText || null,
      best: yes(inner.isBestScore),
      reciprocal_best: yes(inner.isBestScoreReverse),
      methods_matched: (inner.predictionMethodsMatched || []).length,
      // geneAnnotationsMap is keyed by gene id and covers both ends of the pair.
      has_disease_annotations: raw.geneAnnotationsMap?.[inner.objectGene.primaryExternalId]?.hasDiseaseAnnotations
        ?? (raw.geneAnnotations || []).find((a) => a.geneIdentifier === inner.objectGene.primaryExternalId)?.hasDiseaseAnnotations
        ?? null,
    }));
  return { total: Number(j.total) || rows.length, hits };
}

async function refresh(seed) {
  const genes = [];
  for (const g of seed) {
    const fwd = await orthologsOf(g.hgnc, MOUSE);
    const mouse = fwd.hits.find((h) => h.best) || fwd.hits[0] || null;
    let reverse = null;
    if (mouse) {
      const back = await orthologsOf(mouse.id, HUMAN);
      reverse = {
        mouse_id: mouse.id,
        reciprocal_best_partners: back.hits.filter((h) => h.best && h.reciprocal_best).map((h) => ({ id: h.id, symbol: h.symbol })),
        human_total: back.total,
      };
      if (mouse.has_disease_annotations == null) {
        const gr = await fetch(`${ALLIANCE}/gene/${mouse.id}`, { headers: HEADERS });
        const gj = gr.ok ? await gr.json() : {};
        mouse.has_disease_annotations = gj.diseaseAnnotationCount != null ? Number(gj.diseaseAnnotationCount) > 0 : null;
      }
    }
    genes.push({ human_symbol: g.human_symbol, hgnc: g.hgnc, mouse_hits: fwd.hits, mouse, reverse, alliance_total_orthologs: fwd.total });
    console.log(`  ${g.human_symbol}: ${fwd.hits.length} stringent mouse hit(s)${mouse ? `, best ${mouse.symbol} (${mouse.id}) reciprocal=${mouse.reciprocal_best} disease=${mouse.has_disease_annotations}; reverse bests ${reverse.reciprocal_best_partners.map((p) => p.symbol).join(',') || 'none'}` : ''}`);
  }
  return {
    format: 2,
    as_of: new Date().toISOString().slice(0, 10),
    source: `${ALLIANCE}/gene/{id}/orthologs?stringencyFilter=stringent (forward and reverse)`,
    question: 'Does this human disease gene have a reciprocal one-to-one mouse ortholog that carries Alliance disease annotations?',
    genes,
  };
}

// ---- the funnel ----------------------------------------------------------------
// Instrument-side causes first, then the world-side one. Each step is a question
// the Alliance flags answer; the first "no" is the binding cause.
function causeFor(g) {
  if (!g.mouse) return { cause: 'unreachable', why: 'no stringent mouse ortholog' };
  if (!g.mouse.reciprocal_best) {
    const partners = g.reverse?.reciprocal_best_partners || [];
    const names = partners.map((p) => p.symbol || p.id);
    if (partners.length === 1 && partners[0].id !== g.hgnc) {
      return { cause: 'unreachable', why: `${g.mouse.symbol} belongs one-to-one to ${names[0]}; no mouse counterpart exists for this gene` };
    }
    return { cause: 'method_limited', why: `one-to-one undefined: ${g.mouse.symbol}'s reciprocal bests are ${names.join(', ') || 'none'}` };
  }
  if (g.mouse.has_disease_annotations === true) return { cause: null, why: 'reciprocal one-to-one ortholog with disease annotations' };
  if (g.mouse.has_disease_annotations === false) return { cause: 'unstudied', why: 'reciprocal one-to-one ortholog with no disease annotation in Alliance' };
  throw new Error(`mouse-model-frame: ${g.human_symbol}: disease annotation state unknown; refresh the snapshot`);
}

function build(snapshot) {
  if (snapshot.format !== 2) throw new Error('mouse-model-frame: snapshot is not format 2; run with --refresh');
  const ASSIGNABLE = ['unreachable', 'method_limited', 'unstudied'];
  const cells = [];
  const darkByCause = Object.fromEntries(ASSIGNABLE.map((c) => [c, 0]));
  let answered = 0;
  for (const g of snapshot.genes) {
    const { cause } = causeFor(g);
    if (cause) {
      darkByCause[cause] += 1;
      cells.push({ subject: g.hgnc, symbol: g.human_symbol, object: g.mouse ? g.mouse.id : null, status: 'dark', dark_cause: cause });
    } else {
      answered += 1;
      cells.push({ subject: g.hgnc, symbol: g.human_symbol, object: g.mouse.id, status: 'answered', dark_cause: null });
    }
  }
  const PROTOCOL_ID = 'sniff:protocol/human-disease-gene-mouse-model@demo-2';
  const controls = POSITIVE_CONTROLS.map((sym) => {
    const cell = cells.find((c) => c.symbol === sym);
    return {
      subject: cell ? cell.subject : null,
      expected_status: 'answered',
      observed_status: cell ? cell.status : 'missing',
      basis: `${sym}: MGI disease-model annotations exist for the mouse ortholog (Alliance geneAnnotationsMap.hasDiseaseAnnotations, read ${snapshot.as_of} UTC)`,
      // The same Alliance flag the protocol reads, read by hand: catches a parse bug, not a source error.
      basis_kind: 'same_source_hand_verified',
      receipt_source: 'infores:agrkb',
      receipt_as_of: snapshot.as_of,
      outcome: cell && cell.status === 'answered' ? 'held' : 'failed',
    };
  });
  const failed = controls.filter((c) => c.observed_status !== c.expected_status);
  if (failed.length) throw new Error(`positive control failed: ${failed.map((c) => c.basis.split(':')[0]).join(', ')}`);
  // Darkness controls: the two cells this demo once mistyped, each now asserted to
  // its cause on evidence that is not this pipeline's own query.
  const DARKNESS = [
    { symbol: 'DAZ3', expected_cause: 'unreachable', receipt_source: 'PMID:8896558', basis: 'DAZ3: the DAZ cluster is a primate Y-linked transposition and amplification of autosomal DAZL (Saxena et al. 1996, PMID:8896558); the mouse genome carries Dazl and Boll and no DAZ, so no counterpart exists for the assay to observe' },
    { symbol: 'OR2J3', expected_cause: 'method_limited', receipt_source: 'PMID:11802173', basis: 'OR2J3: mouse olfactory receptors are a massively expanded family with many-to-many orthology to human (Zhang and Firestein 2002, PMID:11802173); a one-to-one assay cannot resolve the pair, and Alliance flags Or2j3 as reciprocal-best to OR2J2 and OR2J1, not OR2J3' },
  ];
  const darknessControls = DARKNESS.map(({ symbol, expected_cause, receipt_source, basis }) => {
    const cell = cells.find((c) => c.symbol === symbol);
    const observed_cause = cell && cell.status === 'dark' ? cell.dark_cause : 'absent';
    const observed_status = cell ? cell.status : 'missing';
    return {
      subject: cell ? cell.subject : null,
      expected_cause,
      observed_cause,
      observed_status,
      basis,
      basis_kind: 'independent_literature', // a paper does not move; a mismatch here is always a pipeline defect
      receipt_source,
      outcome: observed_status === 'dark' && observed_cause === expected_cause ? 'held' : 'failed',
    };
  });
  const darkFailed = darknessControls.filter((c) => c.outcome === 'failed');
  if (darkFailed.length) throw new Error(`darkness control failed: ${darkFailed.map((c) => `${c.basis.split(':')[0]} expected ${c.expected_cause}, observed ${c.observed_status}/${c.observed_cause}`).join('; ')}`);
  const seedPop = 'sniff:population/alliance-mouse-demo-seed@1';
  const orthoPop = 'sniff:population/alliance-mouse-orthologs-of-seed@2';
  return {
    _meta: {
      doc: 'Demonstration CoverageFrame: GenCC-neighborhood human disease genes x mouse models via Alliance/MGI. SAMPLED seed, not the full universe. Not a consumer claim. The assay is reciprocal one-to-one orthology; causes are read from Alliance orthology flags.',
      schema: 'https://sniff.world/schema/coverage-frame',
      schema_version: schemaVersion(CORE_SCHEMA),
      schema_provenance: 'https://sniff.world/schema/coverage-frame-provenance',
      schema_provenance_version: schemaVersion(PROV_SCHEMA),
      generated: snapshot.as_of,
      completeness: 'sampled',
      assay: 'mouse',
      source: snapshot.source,
    },
    frame: {
      id: 'sniff:frame/human-disease-gene-mouse-model@demo-seed',
      question: snapshot.question,
      // Labels for a reader; the *_ref slots carry the identity.
      subject_population: `Sampled seed of ${snapshot.genes.length} human disease genes in the GenCC neighborhood`,
      object_population: 'Stringent mouse orthologs returned by the Alliance orthology API for each seed gene',
      subject_population_ref: seedPop,
      object_population_ref: orthoPop,
      predicate: 'biolink:model_of',
      expected_cardinality: snapshot.genes.length,
      answered_count: answered,
      dark_count: snapshot.genes.length - answered,
      dark_by_cause: darkByCause,
      sources_checked: ['infores:agrkb'],
      as_of: snapshot.as_of,
      search_protocol: PROTOCOL_ID,
      conforms_to: 'sniff:ProvenancedCoverageFrame',
    },
    populations: [
      {
        id: seedPop,
        source: 'infores:agrkb',
        source_version: snapshot.as_of,
        selection: 'Sampled seed of human disease genes in the GenCC neighbourhood. NOT the full universe; the demo exists to show the shape, never to publish a census.',
        count: snapshot.genes.length,
      },
      {
        id: orthoPop,
        source: 'infores:agrkb',
        source_version: snapshot.as_of,
        selection: 'Mouse genes returned by the Alliance orthology API for each seed gene under stringent filtering, with each hit\'s reciprocal-best human partners read back from the mouse side. Not the set of all mouse genes carrying disease annotations; this demo never enumerated that set.',
        count: snapshot.genes.filter((g) => g.mouse && g.mouse.id).length,
      },
    ],
    protocols: [
      {
        id: PROTOCOL_ID,
        protocol_version: 'demo-2',
        pipeline: 'https://github.com/sniff-world/coverage-frame/blob/main/pipeline/build-mouse-coverage-frame.mjs',
        completeness: 'sampled',
        match_criteria:
          'A cell is answered when the human gene has a stringent Alliance mouse ortholog that is reciprocal-best (isBestScore and isBestScoreReverse both true) AND that mouse gene carries Alliance disease annotations. '
          + 'Instrument-side causes first: no stringent mouse hit is unreachable; a hit whose reciprocal-best human partner is a single different gene is unreachable (the mouse gene belongs to a human paralog, so no counterpart exists for this gene); a hit whose reciprocal bests are several or none is method_limited (one-to-one is undefined in that family); a reciprocal one-to-one ortholog with no disease annotation is unstudied. '
          + 'This sampled protocol can assign three of the six causes in DarkCauseEnum; below_bar, no_disease_anchor and absent are not assignable without the full Alliance disease dump and are listed in neither the funnel nor the tallies.',
        cause_precedence: ASSIGNABLE,
        dial_references: [ONE_TO_ONE_DIAL],
        positive_controls: controls,
        darkness_controls: darknessControls,
      },
    ],
    cells,
  };
}

// ---- entry --------------------------------------------------------------------
const args = process.argv.slice(2);
let snapshot = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
if (args.includes('--refresh')) {
  const seed = (snapshot.genes || []).map((g) => ({ human_symbol: g.human_symbol, hgnc: g.hgnc }));
  console.log(`mouse-model-frame: refreshing ${seed.length} seed genes from Alliance`);
  snapshot = await refresh(seed);
  fs.writeFileSync(SNAP, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`  wrote ${path.relative(ROOT, SNAP)} (format 2, as_of ${snapshot.as_of})`);
}
const doc = build(snapshot);
fs.mkdirSync(DEMO, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`mouse-model-frame: ${doc.frame.answered_count} answered, ${doc.frame.dark_count} dark, of ${doc.frame.expected_cardinality} seed cells. Controls PASS.`);

if (args.includes('--selftest')) {
  const fail = [];
  const t = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };
  const cell = (sym) => doc.cells.find((c) => c.symbol === sym);
  t('TP53 is answered', cell('TP53')?.status === 'answered');
  // DAZ3: Alliance's only stringent mouse hit is Dazl (MGI:1342328), and Dazl's
  // reciprocal-best human partner is DAZL, not DAZ3. The mouse genome has no DAZ.
  t('DAZ3 is unreachable (Dazl belongs one-to-one to DAZL; no mouse counterpart)', cell('DAZ3')?.dark_cause === 'unreachable');
  t('DAZ3 carries its own HGNC id, not DAZ2\'s', cell('DAZ3')?.subject === 'HGNC:15965');
  // OR2J3: Or2j3 (MGI:2177520) exists, so `unreachable` is false; its reciprocal
  // bests are other human olfactory receptors, so one-to-one is undefined.
  t('OR2J3 is method_limited (entity exists; one-to-one undefined in the OR family)', cell('OR2J3')?.dark_cause === 'method_limited');
  t('OR2J3 carries its ortholog rather than null', cell('OR2J3')?.object === 'MGI:2177520');
  t('tallies name only assignable causes', Object.keys(doc.frame.dark_by_cause).sort().join(',') === 'method_limited,unreachable,unstudied');
  t('funnel equals the assignable causes', doc.protocols[0].cause_precedence.join(',') === 'unreachable,method_limited,unstudied');
  t('method_limited cites a versioned dial', doc.protocols[0].dial_references.includes(ONE_TO_ONE_DIAL));
  t('sampled protocol cannot claim absent', doc.cells.every((c) => c.dark_cause !== 'absent'));
  t('population labels and refs are different things', doc.frame.subject_population !== doc.frame.subject_population_ref);
  t('schema versions are pinned in _meta', /^\d+\.\d+\.\d+$/.test(doc._meta.schema_version) && /^\d+\.\d+\.\d+$/.test(doc._meta.schema_provenance_version));
  t('positive controls all pass', doc.protocols[0].positive_controls.every((c) => c.observed_status === c.expected_status));
  t('darkness controls all land on their cause', doc.protocols[0].darkness_controls.every((c) => c.outcome === 'held'));
  t('every control says what kind of evidence it stands on', [...doc.protocols[0].positive_controls, ...doc.protocols[0].darkness_controls].every((c) => ['independent_literature', 'independent_source', 'same_source_hand_verified'].includes(c.basis_kind)));
  t('every cause the tallies claim has a darkness control', Object.entries(doc.frame.dark_by_cause).filter(([, n]) => n > 0).every(([cause]) => doc.protocols[0].darkness_controls.some((c) => c.expected_cause === cause)));
  if (fail.length) { console.error('selftest failed'); process.exit(1); }
}
