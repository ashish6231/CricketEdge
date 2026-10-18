const fs = require('node:fs');
const path = require('node:path');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { isWomensSpringT20, springTeamKey, getSpringPreMatchReportedActivity } = require('../utils/womensSpringMatchPredictor.mjs');

function backtestSpringReportedActivity(sources) {
  const fixtures = new Map();
  for (const { record } of sources) {
    if (!isWomensSpringT20(record.competitionName)) continue;
    const teams = [record.team1, record.team2];
    const key = `${record.startTime}:${teams.map(springTeamKey).sort().join('|')}`;
    let fixture = fixtures.get(key);
    if (!fixture) { fixture = { match:record.matchName, startTime:record.startTime, teams, ids:new Set(), winners:new Set(), snapshots:[] }; fixtures.set(key,fixture); }
    fixture.ids.add(record.matchId || record.recordId);
    const verified = record.resultVerification?.status === 'verified' || record.resultVerification?.verification === 'verified'
      || (record.status === 'verified' && record.confirmedByEmail && record.confirmedByEmail !== 'crex-auto');
    if (verified && record.actualWinner) fixture.winners.add(record.actualWinner === 'No Result' ? 'No Result' : springTeamKey(record.actualWinner));
    const market = record.markets?.match;
    const candidates = [
      { snapshot:record.snapshot, capturedAt:record.capturedAt, inputTiming:record.inputTiming },
      { snapshot:market?.snapshot, capturedAt:market?.capturedAt, inputTiming:market?.inputTiming },
      { snapshot:market?.latestSnapshot, capturedAt:market?.lastCapturedAt, inputTiming:market?.latestInputTiming },
    ];
    for (const candidate of candidates) {
      if (!candidate.snapshot) continue;
      const input = { ...candidate.snapshot, competitionName:record.competitionName,
        startTime:record.startTime, capturedAt:candidate.capturedAt, inputTiming:candidate.inputTiming };
      if (input.teamNames?.length !== 2 || !input.teamNames.every(name => teams.some(team => springTeamKey(team) === springTeamKey(name)))) continue;
      fixture.snapshots.push(input);
    }
  }
  const rows = [...fixtures.values()].sort((a,b)=>a.startTime-b.startTime).map(fixture=>{
    const actual = fixture.winners.size === 1 ? [...fixture.winners][0] : null;
    const candidates = fixture.snapshots.filter(input => getSpringPreMatchReportedActivity(input))
      .sort((a,b)=>Date.parse(a.capturedAt||a.serverTime)-Date.parse(b.capturedAt||b.serverTime));
    const input = candidates[0];
    const prediction = input ? predictMatchWinner(input) : null;
    const totals = input ? getSpringPreMatchReportedActivity(input) : null;
    const status = actual === 'No Result' ? 'no_result' : !actual ? 'unresolved_or_upcoming'
      : !fixture.snapshots.length ? 'missing_market_snapshot' : !input ? 'missing_prematch_activity'
        : !prediction ? 'equal_activity' : springTeamKey(prediction.winner) === actual ? 'pass' : 'fail';
    return { match:fixture.match,startTime:fixture.startTime,matchIds:[...fixture.ids],status,
      actualWinner:actual === 'No Result' ? actual : fixture.teams.find(team=>springTeamKey(team)===actual)||null,
      prediction:prediction?.winner||null,reportedActivity:totals?Object.fromEntries(input.teamNames.map((name,index)=>[name,totals[index]])):null,
      observedAt:input?.serverTime||input?.capturedAt||null,capturedAt:input?.capturedAt||null,
      archivedBeforeStart: Boolean(input?.capturedAt && Date.parse(input.capturedAt) < fixture.startTime
        && (!input.serverTime || Date.parse(input.serverTime) < fixture.startTime)),
      hasMarketSnapshot:fixture.snapshots.length>0 };
  });
  const count = status => rows.filter(row=>row.status===status).length;
  const passed=count('pass'),failed=count('fail');
  return { rule:'Lower provider-reported pre-match activity predicts winner',evaluation:'Retrospective replay of provider-frozen pre-match activity; most inputs were archived after kickoff. Original issued predictions are unchanged',
    checkedAt:new Date().toISOString(),summary:{fixtures:rows.length,verifiedDecisive:rows.filter(row=>row.actualWinner&&row.actualWinner!=='No Result').length,
      scored:passed+failed,passed,failed,accuracy:passed+failed?100*passed/(passed+failed):null,
      scoredArchivedBeforeStart:rows.filter(row=>['pass','fail'].includes(row.status)&&row.archivedBeforeStart).length,
      missingPrematchActivity:count('missing_prematch_activity'),missingMarketSnapshot:count('missing_market_snapshot'),
      equalTotals:count('equal_activity'),noResult:count('no_result'),unresolvedOrUpcoming:count('unresolved_or_upcoming')},rows };
}
if(require.main===module){
  (async()=>{
    const index=process.argv.indexOf('--input');
    let sources;
    if(process.argv.includes('--database')) {
      require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
      const prisma=require('../db/prisma');
      try {
        const rows=await prisma.$queryRaw`SELECT datasetKey, payload FROM PredictionRecord WHERE datasetKey IN ('matches','womens_spring')`;
        sources=rows.map(row=>({datasetKey:row.datasetKey,record:JSON.parse(row.payload)}));
      } finally { await prisma.$disconnect(); }
    } else sources=index>=0 ? JSON.parse(fs.readFileSync(process.argv[index+1],'utf8')) : ['match_dataset','womens_spring_dataset'].flatMap(name=>
      JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8')).records.map(record=>({datasetKey:name,record})));
    console.log(JSON.stringify(backtestSpringReportedActivity(sources),null,2));
  })().then(()=>process.exit(0)).catch(error=>{console.error(error.code||error.name);process.exit(1)});
}
module.exports={backtestSpringReportedActivity};
