#!/usr/bin/env node
/**
 * build-coverage-frame-delta.mjs — guarantee 5 of the Darkness Contract
 * (the Darkness Contract): a frame is a snapshot; CHANGE ships as a typed FrameDelta
 * (schema/sniff-coverage-frame-delta.yaml), never as a silent regeneration.
 *
 * Flow: build-coverage-frames.mjs writes the current release; this script
 * archives it under web/data/coverage-frame-releases/ (durable, committed)
 * and, when a PRIOR release exists in the archive, emits
 * public/data/coverage-frame-delta.json between the two most recent.
 *
 * kind discipline (never blended):
 *   world_moved  — identical protocol@version, population DEFINITIONS, and
 *                  dials (definitions are intensional: a new source release
 *                  under the same selection is the world moving). Cells may
 *                  flip, and the universe membership may change: the world
 *                  mints and retires question cells, enumerated as typed
 *                  boundary events (entered / left), never silently. The
 *                  conservation identity binds the frames' DECLARED counts to
 *                  the enumerated flows:
 *                  answered(t1) = answered(t0) + darkToAnswered - answeredToDark
 *                                 + enteredAnswered - leftAnswered
 *                  cardinality(t1) = cardinality(t0) + entered - left
 *                  A frame that does not reconcile against its predecessor
 *                  plus the delta refuses to emit.
 *   frame_moved  — the question changed (protocol / population definitions /
 *                  dials). Transitions are annotations, not knowledge flow.
 *
 * Trigger inference at this grain is deterministic:
 *   frame_moved: population_change > method_change > criteria_change
 *   world_moved: source_release (reference = the new release id)
 * Hand-typed triggers (new_publication, correction) belong to a curated
 * overrides layer that does not exist yet; it is added when the first real
 * correction needs it, not before.
 *
 *   node web/scripts/build-coverage-frame-delta.mjs             # archive + emit
 *   node web/scripts/build-coverage-frame-delta.mjs --selftest  # fixture proofs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..');
const PUB = path.join(WEB, 'public', 'data');
const ARCHIVE = path.join(WEB, 'data', 'coverage-frame-releases');

// --- pure core (selftestable) -------------------------------------------------

// What the protocol actually DOES. `id`, `protocol_version`, `pipeline` and
// `executed_at` are provenance: they say who ran it and where the code lives.
// These four say what the search was, and only these may reclassify a delta.
// ONE HOME. validate-coverage-frames.cjs independently recomputes this
// classification and reads the same file, so the emitter and its checker cannot
// drift apart while each stays self-consistent.
const PROCEDURE_FIELDS = JSON.parse(
  fs.readFileSync(path.join(WEB, 'schema', 'procedure-fields.json'), 'utf8'),
).procedure_fields;

export function procedureOf(p) {
  const o = {};
  for (const k of PROCEDURE_FIELDS) o[k] = p && p[k] !== undefined ? p[k] : null;
  return JSON.stringify(o);
}

export function classifyKind(prev, curr) {
  const p = prev.protocol || {};
  const c = curr.protocol || {};
  const prevPops = (prev.populations || []).map((x) => x.id).sort();
  const currPops = (curr.populations || []).map((x) => x.id).sort();
  const dialsEq = JSON.stringify((p.dial_references || []).slice().sort()) === JSON.stringify((c.dial_references || []).slice().sort());
  const popsEq = JSON.stringify(prevPops) === JSON.stringify(currPops);
  // THE PROCEDURE, NOT THE LABEL. This compared `p.id === c.id`, and a protocol
  // id moves for reasons that are not procedural: on 2026-08-23 the private-org
  // leak fix repointed `pipeline`, the pin refused a re-pin without a version
  // bump (it hashes the whole emitter and cannot tell provenance from procedure),
  // and PROTOCOL_VERSION went 2 -> 3 -> 4 with the search untouched. The emitter's
  // own comment records it: "THE SEARCH PROCEDURE DID NOT CHANGE: same queries,
  // same filters, same funnel, same controls." Under id-equality that documentation
  // fix silently reclassified a world_moved delta as frame_moved, inverting the one
  // answer this schema exists to keep straight. A relabel is not a method change.
  const protoEq = procedureOf(p) === procedureOf(c);
  // world_moved asserts THE WORLD MOVED, so it has to check that it did. It used
  // to be the residual bucket: everything with identical definitions landed here
  // whether or not the upstream snapshot had changed. A release that corrected a
  // source identifier over a byte-identical upstream snapshot, flipping zero
  // cells, was therefore published as world_moved, which is the same inversion in
  // the other direction as the one the comment above records.
  if (protoEq && popsEq && dialsEq) {
    // `correction` claims NOTHING moved, so it is asserted only when nothing did:
    // same upstream snapshot AND not one cell different. Keying it on the snapshot
    // alone was tempting and wrong. source_version covers the populations, not
    // every source the frame reads, so a source that moved without a population
    // saying so would have been published as our error rather than as new
    // knowledge. That inversion is worse than the one being fixed here: it takes
    // a real change in the world and files it as a mistake we made.
    // prev/curr, NOT p/c: p and c are the PROTOCOL objects above. Reading
    // p.populations and p.cells off a protocol yields undefined on both sides,
    // which compares equal, which made nothingMoved unconditionally true and
    // classified every delta as a correction. The selftest caught it.
    const nothingMoved =
      sourceSnapshotOf(prev) === sourceSnapshotOf(curr) &&
      cellsIdentical(prev.cells, curr.cells);
    return nothingMoved ? 'correction' : 'world_moved';
  }
  return 'frame_moved';
}

// The upstream snapshot every population was drawn from. Intensional definitions
// live in the population id; this is the extensional half, and it is the only
// evidence available here that the world actually moved.
function cellsIdentical(a = {}, b = {}) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = a[k];
    const y = b[k];
    if (!y) return false;
    if (x.status !== y.status || (x.cause || null) !== (y.cause || null)) return false;
  }
  return true;
}

export function sourceSnapshotOf(frame) {
  return (frame.populations || [])
    .map((x) => `${x.id}=${x.source_version || ''}`)
    .sort()
    .join('|');
}

export function inferTrigger(kind, prev, curr) {
  if (kind === 'correction') return 'correction';
  if (kind === 'world_moved') return 'source_release';
  const prevPops = (prev.populations || []).map((x) => x.id).sort().join('|');
  const currPops = (curr.populations || []).map((x) => x.id).sort().join('|');
  if (prevPops !== currPops) return 'population_change';
  // Same rule as classifyKind: a method change is a change to the METHOD.
  if (procedureOf(prev.protocol || {}) !== procedureOf(curr.protocol || {})) return 'method_change';
  return 'criteria_change';
}

const subjectFor = (k, cell) =>
  cell && cell.ensembl_gene_id ? `ENSEMBL:${cell.ensembl_gene_id}` : `sniff:gene/${k}`;
const symbolFor = (k, cell) => (cell && cell.symbol) || k;

export function diffCells(prevCells, currCells) {
  const transitions = [];
  const entered = [];
  const left = [];
  const all = new Set([...Object.keys(prevCells), ...Object.keys(currCells)]);
  for (const k of all) {
    const a = prevCells[k];
    const b = currCells[k];
    if (!a) {
      entered.push({ subject: subjectFor(k, b), symbol: symbolFor(k, b), status: b.status, dark_cause: b.cause || null });
      continue;
    }
    if (!b) {
      left.push({ subject: subjectFor(k, a), symbol: symbolFor(k, a), status: a.status, dark_cause: a.cause || null });
      continue;
    }
    if (a.status === b.status && (a.cause || null) === (b.cause || null)) continue;
    transitions.push({
      subject: subjectFor(k, b),
      symbol: symbolFor(k, b),
      from_status: a.status,
      from_cause: a.cause || null,
      to_status: b.status,
      to_cause: b.cause || null,
    });
  }
  return { transitions, entered, left };
}

/**
 * The conservation identity binds the frames' DECLARED counts (from the
 * funnel, independent of the cell enumeration) to the enumerated flows:
 *   answered(t1) = answered(t0) + darkToAnswered - answeredToDark
 *                  + enteredAnswered - leftAnswered
 *   cardinality(t1) = cardinality(t0) + entered - left
 * Requires declared counts on both snapshots; an archive without them cannot
 * reconcile and must be regenerated.
 */
export function conservationHolds(prev, curr, diff) {
  if (![prev.answered_count, curr.answered_count, prev.expected_cardinality, curr.expected_cardinality]
    .every((n) => typeof n === 'number')) return false;
  const inflow = diff.transitions.filter((t) => t.from_status !== 'answered' && t.to_status === 'answered').length;
  const outflow = diff.transitions.filter((t) => t.from_status === 'answered' && t.to_status !== 'answered').length;
  const enteredAnswered = diff.entered.filter((e) => e.status === 'answered').length;
  const leftAnswered = diff.left.filter((e) => e.status === 'answered').length;
  const answeredOk = curr.answered_count === prev.answered_count + inflow - outflow + enteredAnswered - leftAnswered;
  const cardinalityOk = curr.expected_cardinality === prev.expected_cardinality + diff.entered.length - diff.left.length;
  return answeredOk && cardinalityOk;
}

export function buildDelta(prev, curr) {
  const kind = classifyKind(prev, curr);
  const diff = diffCells(prev.cells, curr.cells);
  // Conservation binds for world_moved AND correction. Only frame_moved is exempt,
  // because there the question itself changed and the counts are not comparable.
  // A correction is the case that needs it most: the enum defines it as the repair
  // path that is "never a silent overwrite", and a repair whose declared counts
  // move with no enumerated flow is precisely a silent overwrite wearing the label
  // of an honest one.
  if ((kind === 'world_moved' || kind === 'correction') && !conservationHolds(prev, curr, diff)) {
    throw new Error(
      'coverage-frame-delta: CONSERVATION VIOLATION — a world_moved delta must reconcile the declared counts ' +
      `against the enumerated flows (transitions=${diff.transitions.length}, entered=${diff.entered.length}, ` +
      `left=${diff.left.length}). Either the cell enumeration is lossy, the declared counts are wrong, or the ` +
      'frame really moved and the protocol/population definition versions must say so.',
    );
  }
  const trigger = inferTrigger(kind, prev, curr);
  const reference = curr.release_id || null;
  return {
    id: `sniff:delta/${(prev.release_id || 'prev').replace(/^sniff:release\//, '')}..${(curr.release_id || 'curr').replace(/^sniff:release\//, '')}`,
    previous_frame: `${prev.frame_id}@${prev.release_id}`,
    current_frame: `${curr.frame_id}@${curr.release_id}`,
    kind,
    transitions: diff.transitions.map((t) => ({ ...t, trigger, reference })),
    entered: diff.entered.map((e) => ({ ...e, trigger, reference })),
    left: diff.left.map((e) => ({ ...e, trigger, reference })),
  };
}

// --- selftest (injected fixtures; a state machine not shown to refuse a blend is worth zero)
function selftest() {
  let ok = true;
  const t = (name, cond) => { console.log((cond ? '  ok ' : '  XX ') + name); if (!cond) ok = false; };
  const proto = { id: 'sniff:protocol/x@1', dial_references: ['sniff:dial/d@1'] };
  const pops = [
    { id: 'sniff:population/a@1', source_version: 'src-release-1' },
    { id: 'sniff:population/b@1', source_version: 'src-release-1' },
  ];
  const counted = (cells) => ({
    expected_cardinality: Object.keys(cells).length,
    answered_count: Object.values(cells).filter((c) => c.status === 'answered').length,
  });
  const mk = (cells, over = {}) => ({
    frame_id: 'sniff:frame/x', release_id: 'sniff:release/r', protocol: proto, populations: pops,
    cells, ...counted(cells), ...over,
  });

  // 1. a genuine world move reconciles and types dark->answered
  const prev = mk({ A: { status: 'dark', cause: 'unstudied' }, B: { status: 'answered' } });
  const curr = mk({ A: { status: 'answered' }, B: { status: 'answered' } }, { release_id: 'sniff:release/r2' });
  const d1 = buildDelta(prev, curr);
  t('world_moved classified', d1.kind === 'world_moved');
  // The gap that let a relabel ship as world_moved: there was a proof that a NEW
  // source_version stays world_moved, and none that an UNCHANGED one does not.
  t('identical definitions over an identical snapshot is a correction',
    classifyKind(prev, { ...prev, release_id: 'sniff:release/later' }) === 'correction');
  t('a correction triggers as a correction',
    inferTrigger('correction', prev, prev) === 'correction');
  t('dark-to-answered transition enumerated', d1.transitions.length === 1 && d1.transitions[0].to_status === 'answered');
  t('world trigger is source_release', d1.transitions[0].trigger === 'source_release');

  // 2. a newer source_version under identical definitions is STILL world_moved
  //    (population identity is the intension, not the extension)
  const currNewSrc = mk(curr.cells, {
    release_id: 'sniff:release/r2',
    populations: pops.map((p) => ({ ...p, source_version: 'src-release-2' })),
  });
  t('source_version move under same definitions is world_moved', classifyKind(prev, currNewSrc) === 'world_moved');

  // 3. a birth under world_moved is LEGAL when the declared counts reconcile,
  //    and it ships as a typed boundary event
  const currBirth = mk(
    { A: { status: 'dark', cause: 'unstudied' }, B: { status: 'answered' }, C: { status: 'answered' } },
    { release_id: 'sniff:release/r2' },
  );
  const d3 = buildDelta(prev, currBirth);
  t('world_moved with reconciled birth is legal', d3.kind === 'world_moved');
  t('birth enumerated as entered boundary event', d3.entered.length === 1 && d3.entered[0].status === 'answered');

  // 4. a birth whose declared counts do NOT move is a conservation violation, refused
  const currBirthLying = { ...currBirth, ...counted(prev.cells) }; // declared counts frozen at t0
  let threw = false;
  try { buildDelta(prev, currBirthLying); } catch { threw = true; }
  t('blend refused: unreconciled birth throws', threw);

  // 5. a lossy enumeration (declared answered moves, no flow enumerated) is refused
  const currMiscount = mk(prev.cells, { release_id: 'sniff:release/r2', answered_count: prev.answered_count + 1 });
  threw = false;
  try { buildDelta(prev, currMiscount); } catch { threw = true; }
  t('blend refused: declared count moved with no enumerated flow', threw);

  // 6. population DEFINITION change reclassifies to frame_moved and is then legal
  const currPopMoved = mk(currBirthLying.cells, {
    release_id: 'sniff:release/r2',
    ...counted(currBirthLying.cells),
    populations: [{ ...pops[0], id: 'sniff:population/a@2' }, pops[1]],
  });
  const d6 = buildDelta(prev, currPopMoved);
  t('frame_moved on population definition change', d6.kind === 'frame_moved');
  t('frame_moved trigger is population_change', d6.transitions.concat(d6.entered).every((x) => x.trigger === 'population_change'));
  t('births enumerated on frame_moved', d6.entered.length === 1);

  // 6b. A PROVENANCE-ONLY RELABEL IS A CORRECTION. This is the live 2026-08-23
  //     case: id, version and pipeline all moved, the search did not. No arm
  //     covered it, which is exactly why the inversion shipped unnoticed.
  //     This arm asserted world_moved until 2026-08-30, and it was half right:
  //     the lesson it protects is that a relabel is NOT a method change, and
  //     that still holds. It asserted world_moved only because that was the
  //     one remaining value, which made the arm claim the world had moved over
  //     an upstream snapshot it never checked.
  const procProto = { ...proto, match_criteria: 'same', completeness: 'exhaustive' };
  const prevProc = mk(prev.cells, { protocol: { ...procProto, id: 'p@2', protocol_version: '2', pipeline: 'https://old.example/x' } });
  const currProc = mk(prev.cells, { release_id: 'sniff:release/r2', protocol: { ...procProto, id: 'p@4', protocol_version: '4', pipeline: 'https://new.example/y' } });
  t('provenance-only protocol relabel is a correction, not a method change', classifyKind(prevProc, currProc) === 'correction');
  // Ask the classifier rather than asserting a kind: this arm passed the whole
  // time the classification beneath it was wrong, because it hardcoded the answer.
  t('a relabel triggers as a correction',
    inferTrigger(classifyKind(prevProc, currProc), prevProc, currProc) === 'correction');

  // 6c. A REAL procedure change still reclassifies. The fix must not blind the gate.
  const currMethod = mk(prev.cells, { release_id: 'sniff:release/r2', protocol: { ...procProto, match_criteria: 'DIFFERENT criteria' } });
  t('a real match_criteria change is frame_moved', classifyKind(prevProc, currMethod) === 'frame_moved');
  t('a real procedure change triggers method_change', inferTrigger('frame_moved', prevProc, currMethod) === 'method_change');

  // 7. dial change alone is frame_moved / criteria_change
  const currDial = mk(prev.cells, { release_id: 'sniff:release/r2', protocol: { ...proto, dial_references: ['sniff:dial/d@2'] } });
  const d7 = buildDelta(prev, currDial);
  t('dial change is frame_moved', d7.kind === 'frame_moved');
  t('dial change trigger is criteria_change', inferTrigger(d7.kind, prev, currDial) === 'criteria_change');

  console.log(ok ? 'coverage-frame-delta selftest: holds (Darkness Contract, perishable).' : 'coverage-frame-delta selftest: FAILED.');
  process.exit(ok ? 0 : 1);
}

// --- main ----------------------------------------------------------------------
function main() {
  const framesDoc = JSON.parse(fs.readFileSync(path.join(PUB, 'coverage-frames.json'), 'utf8'));
  const cellsDoc = JSON.parse(fs.readFileSync(path.join(PUB, 'coverage-cell-index.json'), 'utf8'));
  const frame = framesDoc.frames[0];
  const releaseId = frame.release_id;
  if (!releaseId) throw new Error('coverage-frame-delta: frame has no release_id; cannot archive');

  const snapshot = {
    frame_id: frame.id,
    release_id: releaseId,
    protocol: (framesDoc.protocols || [])[0] || null,
    populations: framesDoc.populations || [],
    // Declared counts (from the funnel, independent of the cell enumeration):
    // the conservation identity reconciles these against the enumerated flows.
    expected_cardinality: frame.expected_cardinality,
    answered_count: frame.answered_count,
    dark_count: frame.dark_count,
    cells: cellsDoc.cells,
  };

  fs.mkdirSync(ARCHIVE, { recursive: true });
  const fname = releaseId.replace(/[^a-z0-9@.-]+/gi, '-') + '.json';
  const archivePath = path.join(ARCHIVE, fname);
  const body = JSON.stringify(snapshot) + '\n';

  // WRITE ONCE. A RELEASE ID MUST RESOLVE TO EXACTLY ONE BYTE-SEQUENCE, FOREVER.
  // This was an unconditional writeFileSync, so every build overwrote the archive
  // for the current release_id and the id denoted whatever the last build made.
  // That is how the frozen 2026-08-13 snapshot was re-stamped @2 -> @3 -> @4 while
  // all 16,754 cells stayed byte-identical, and how a delta silently changed its
  // own history. If the content under an existing id would change, the id is
  // wrong (mint a new release) or the change is: either way a human decides.
  // Compare the DOCUMENT, not its serialisation. Comparing raw strings made this
  // fire on a trailing CRLF from a git checkout while every field, all 16,754
  // cells included, was identical. A checker that reports a difference it never
  // measured is the same class it was built to catch.
  const canon = (o) => JSON.stringify(o);
  if (fs.existsSync(archivePath)) {
    let existing = null;
    try {
      existing = canon(JSON.parse(fs.readFileSync(archivePath, 'utf8')));
    } catch {
      throw new Error(
        `coverage-frame-delta: archived ${fname} is not readable JSON. A frozen `
        + 'snapshot that cannot be parsed cannot be compared, and silently '
        + 'overwriting it would destroy the record. Restore it from git.',
      );
    }
    if (existing !== canon(snapshot)) {
      throw new Error(
        `coverage-frame-delta: REFUSED to overwrite ${fname}. The archive for `
        + `${releaseId} already exists with different content, so this release id `
        + 'would denote two documents. Mint a new release_id for the current frame, '
        + 'or restore the archive. Never rewrite a frozen snapshot in place.',
      );
    }
  } else {
    fs.writeFileSync(archivePath, body);
  }

  const releases = fs.readdirSync(ARCHIVE).filter((f) => f.endsWith('.json')).sort();
  if (releases.length < 2) {
    console.log(`coverage-frame-delta: archived ${fname}; single release in archive, no delta to emit (honest: the first genuine delta needs a second frontier release).`);
    return;
  }
  const prevName = releases[releases.length - 2];
  const prev = JSON.parse(fs.readFileSync(path.join(ARCHIVE, prevName), 'utf8'));
  const delta = buildDelta(prev, snapshot);
  const out = {
    _meta: {
      doc: 'Sniff FrameDelta: typed change between coverage-frame releases. Generated, never hand-maintained. Conforms to schema/sniff-coverage-frame-delta.yaml, and is verified against it on every build.',
      schema: 'https://sniff.world/schema/coverage-frame-delta',
      generated: new Date().toISOString().slice(0, 10),
    },
    delta,
  };
  fs.writeFileSync(path.join(PUB, 'coverage-frame-delta.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`coverage-frame-delta: ${delta.kind} ${prev.release_id} -> ${snapshot.release_id}, ${delta.transitions.length} transition(s).`);
}

if (process.argv.includes('--selftest')) selftest();
else main();
