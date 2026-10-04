const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { predictTossWinner, PREDICTOR_VERSION } = require('../utils/tossPredictor');
const { getECSTossPrediction, getLeagueTossPrediction, isWomensAsiaCup } = require('../utils/tossLeagueAlgorithms');
const records = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/toss_dataset.json'))).records;

function rename(value, names) {
  if (typeof value === 'string') return names.reduce((s, n, i) => s.replaceAll(n, `Neutral Team ${i + 1}`), value);
  if (Array.isArray(value)) return value.map(v => rename(v, names));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[rename(k,names),rename(v,names)]));
  return value;
}

test('European decisions are invariant to team identity and do not mutate snapshots', () => {
  const fixtures = records.filter(r=>r.competitionName === 'European T20 Premier League');
  assert.ok(fixtures.length > 0);
  for (const r of fixtures) {
    const snap=structuredClone(r.snapshot), before=JSON.stringify(snap);
    const p=predictTossWinner(snap,r.competitionName);
    const anonymous=predictTossWinner(rename(snap,snap.teamNames),r.competitionName);
    assert.equal(anonymous.winnerIdx,p.winnerIdx,`Team-name dependence: ${r.matchId}`);
    assert.equal(anonymous.pattern,p.pattern);
    assert.equal(JSON.stringify(snap),before);
  }
});

test('European flow and exposure rules are symmetric when team positions are swapped', () => {
  for (const r of records.filter(r=>r.competitionName==='European T20 Premier League')) {
    const s=r.snapshot, [t1,t2]=s.teamNames;
    const ctx={t1,t2,b1:s.preMatchVolume.team1.back,b2:s.preMatchVolume.team2.back,l1:s.preMatchVolume.team1.lay,l2:s.preMatchVolume.team2.lay,prePnl1:s.preMatchPnl.team1,prePnl2:s.preMatchPnl.team2,supRatio:s.syntheticSupport?.supportRatio||1,trap:s.marketSignals?.trap?.level};
    const swapped={...ctx,t1:t2,t2:t1,b1:ctx.b2,b2:ctx.b1,l1:ctx.l2,l2:ctx.l1,prePnl1:ctx.prePnl2,prePnl2:ctx.prePnl1};
    assert.equal(getECSTossPrediction(swapped)?.winner,getECSTossPrediction(ctx)?.winner,`Position bias: ${r.matchId}`);
  }
});

test('explicit women international metadata is never inferred as Asia Cup from nationality', () => {
  assert.equal(isWomensAsiaCup('Womens International Twenty20 Matches','India W','Pakistan W'),false);
  assert.equal(isWomensAsiaCup("Women's Asia Cup T20",'India W','Pakistan W'),true);
  const r=records.find(r=>r.competitionName==='Womens International Twenty20 Matches');
  const snap={...r.snapshot,competitionName:"Women's Asia Cup T20"};
  assert.equal(getLeagueTossPrediction(snap,r.competitionName).tier,'WOMENS_TOSS_SPECIAL');
});

test('predictor does not read supplied actual outcomes or match IDs', () => {
  for (const r of records) {
    const p=predictTossWinner(r.snapshot,r.competitionName);
    const altered={...structuredClone(r.snapshot),matchId:'unseen-fixture',actualWinner:'Fabricated winner',actualTossWinner:'Fabricated winner',result:{winner:'Fabricated winner'}};
    const q=predictTossWinner(altered,r.competitionName);
    assert.equal(q?.winnerIdx,p?.winnerIdx);
    assert.equal(q?.pattern,p?.pattern);
  }
});

test('zero-flow snapshots abstain even if an actual winner or favourite is supplied', () => {
  const snapshot={teamNames:['Alpha','Beta'],preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}},marketSignals:{bookieFavouriteOutcome:'Alpha'},actualWinner:'Alpha'};
  assert.equal(predictTossWinner(snapshot,'European T20 Premier League'),null);
});

test('uncalibrated rule support does not invent numerical future probabilities', () => {
  const r=records.find(r=>r.snapshot?.preMatchVolume?.team1?.back>0);
  const p=predictTossWinner(r.snapshot,r.competitionName);
  assert.equal(p.predictorVersion,PREDICTOR_VERSION);
  assert.equal(p.confidence.calibrated,false);
  assert.equal(p.confidence.pct,'Uncalibrated');
});

const crex = require('../services/crexService');
const originalOverview = crex.getCrexOverview;
crex.getCrexOverview = async () => [];
const {captureEndedTosses} = require('../services/tossCapture');
crex.getCrexOverview = originalOverview;
test('capture passes outer competition metadata when it is missing from the snapshot', async () => {
  const snapshot={teamNames:['Alpha','Beta'],preMatchVolume:{team1:{back:100,lay:10},team2:{back:50,lay:20}},preMatchPnl:{team1:-50,team2:50}};
  let called=false, stored;
  const summary=await captureEndedTosses({
    scraper:{getAllTossMatches:async()=>[{matchId:'test-metadata',matchName:'Alpha v Beta',competitionName:'European T20 Premier League',status:'ended',totalMatched:180}],getTossSnapshot:async()=>snapshot},
    store:{load:async()=>({records:[]}),upsertPendingCapture:async value=>{stored=value;return {created:true};}},
    predictTossWinner:(snap,comp)=>{called=true;assert.deepEqual(snap,snapshot);assert.equal(comp,'European T20 Premier League');return {winnerName:'Alpha',predictorVersion:PREDICTOR_VERSION};},
  });
  assert.ok(called);assert.equal(summary.captured,1);assert.equal(stored.predictorVersion,PREDICTOR_VERSION);
});
