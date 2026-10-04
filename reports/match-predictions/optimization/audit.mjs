import { activeDataHashes } from '../active-data-hashes.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { predictTossWinner as baseline } from './baseline-v9/tossPredictor.js';
import { predictTossWinner as optimized, PREDICTOR_VERSION } from '../../../server/utils/tossPredictor.js';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../../..');
const files = ['server/data/toss_dataset.json', 'server/data/match_dataset.json', 'server/data/verified_toss_results.json', 'server/data/verified_match_results.json', 'server/data/ended_matches_cache.json'];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const hashes = Object.fromEntries(files.map(f => [f, hash(fs.readFileSync(path.join(root, f)))]));
const baselineSaved = JSON.parse(fs.readFileSync(path.join(out, 'baseline-saved-audit.json')));
const originalHashes = JSON.parse(fs.readFileSync(path.join(out, '../match-optimization/input-hashes.json')));
const expected = activeDataHashes(root, originalHashes);
if (hashes[files[0]] !== expected[files[0]]) throw new Error('Toss dataset differs from authorized active inputs');
if (originalHashes[files[0]] !== baselineSaved.sourceSha256) throw new Error('Preserved toss baseline hash mismatch');
const records = JSON.parse(fs.readFileSync(path.join(root, files[0]))).records;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const engines = { baseline, optimized };
const result = (winner, actual) => !winner ? 'Unscored' : norm(winner) === norm(actual) ? 'Correct' : 'Wrong';
const rows = records.map(r => {
    if (r.status !== 'verified' || r.resultVerification?.verification !== 'verified') throw new Error('Unverified toss ' + r.matchId);
    const predictions = {};
    for (const [name, predict] of Object.entries(engines)) {
        const snap = structuredClone(r.snapshot), before = JSON.stringify(snap);
        const p = predict(snap, r.competitionName);
        if (JSON.stringify(snap) !== before) throw new Error('Mutation ' + r.matchId);
        if (p?.winnerName && !r.snapshot.teamNames.some(t => norm(t) === norm(p.winnerName))) throw new Error('Winner outside fixture');
        predictions[name] = { winner: p?.winnerName || null, verdict: result(p?.winnerName, r.actualWinner), pattern: p?.pattern || null, reason: p?.reason || null };
    }
    const transition = predictions.baseline.verdict === 'Wrong' && predictions.optimized.verdict === 'Correct' ? 'Fixed' : predictions.baseline.verdict === 'Correct' && predictions.optimized.verdict === 'Wrong' ? 'Regressed' : 'Unchanged';
    return { matchId: String(r.matchId), league: r.competitionName, matchName: r.matchName, startTime: r.resultVerification.sourceStartTime || r.startTime, date: new Date(r.resultVerification.sourceStartTime || r.startTime).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }), actualWinner: r.actualWinner, sourceUrl: r.resultVerification.sourceUrl, savedPrediction: r.predictedWinner || null, predictions, transition };
}).sort((a, b) => a.league.localeCompare(b.league) || a.startTime - b.startTime || a.matchId.localeCompare(b.matchId));
function score(rows, engine) { const correct = rows.filter(r => r.predictions[engine].verdict === 'Correct').length, wrong = rows.filter(r => r.predictions[engine].verdict === 'Wrong').length; return { total: rows.length, correct, wrong, scored: correct + wrong, unscored: rows.length - correct - wrong, accuracy: correct + wrong ? +(100 * correct / (correct + wrong)).toFixed(1) : null }; }
const scores = Object.fromEntries(Object.keys(engines).map(e => [e, score(rows, e)]));
const leagues = [...new Set(rows.map(r => r.league))].sort().map(league => { const group = rows.filter(r => r.league === league); return { league, total: group.length, scores: Object.fromEntries(Object.keys(engines).map(e => [e, score(group, e)])), fixed: group.filter(r => r.transition === 'Fixed').length, regressed: group.filter(r => r.transition === 'Regressed').length }; });
const report = {
    generatedAt: new Date().toISOString(), version: PREDICTOR_VERSION, scores, leagues, fixed: rows.filter(r => r.transition === 'Fixed').length, regressed: rows.filter(r => r.transition === 'Regressed').length, remainingWrong: rows.filter(r => r.predictions.optimized.verdict === 'Wrong'), unscored: rows.filter(r => r.predictions.optimized.verdict === 'Unscored'), rows, dataHashes: hashes, codeHashes: Object.fromEntries(['server/utils/tossPredictor.js', 'server/utils/tossLeagueAlgorithms.js', 'server/services/tossCapture.js'].map(f => [f, hash(fs.readFileSync(path.join(root, f)))])), methods: [
        'Same active retained toss snapshots and independently verified Cricbuzz actual toss winners are replayed before and after optimization.',
        'Baseline v9 code is preserved verbatim in optimization/baseline-v9; actual winners are used only after prediction for scoring.',
        'League rules were tuned after inspecting this dataset. These percentages are in-sample retrospective agreement, not held-out or future accuracy.',
        'Existing snapshots were captured after match end. No proven pre-toss issue time is available, so live predictive accuracy cannot be inferred.',
        'User-requested input-quality cleanup archives records without valid frozen pre-match flow/P&L; removed records are not counted as passes.',
        'All wrong predictions and regressions remain visible. Original saved predictions, actual winners and active datasets were not changed by this optimization.',
        'ETPL team-name winner assumptions were removed; women’s international routing, exposure conflict handling and Asia Cup imbalance gates were corrected.',
        'Capture now passes the outer competition name to the predictor, preserving league routing when snapshot metadata is missing.',
        'No future 100% toss accuracy is promised. Fixed 92%/78% confidence figures and the stale 34/34 UI claim were removed; live confidence is explicitly uncalibrated.'
    ]
};
for (const f of files) if (hash(fs.readFileSync(path.join(root, f))) !== hashes[f]) throw new Error('Dataset changed ' + f);
for (const e of Object.keys(engines)) for (const k of ['correct', 'wrong', 'unscored']) if (leagues.reduce((n, l) => n + l.scores[e][k], 0) !== scores[e][k]) throw new Error('League reconciliation failed');
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ scores, fixed: report.fixed, regressed: report.regressed, remainingWrong: report.remainingWrong.map(r => ({ id: r.matchId, match: r.matchName, league: r.league, actual: r.actualWinner, predicted: r.predictions.optimized.winner })), unscored: report.unscored.map(r => r.matchId) }, null, 2));
