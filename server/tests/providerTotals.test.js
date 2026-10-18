const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { freezePreMatchProviderTotals: freeze, getExplicitPreMatchProviderTotals: totals,
  getCurrentProviderTotals, canObservePreMatchProviderTotals, providerSnapshotFromRecord } = require('../utils/providerTotals.mjs');
const { createProviderTotalStore } = require('../services/providerTotalStore');
const startTime = '2026-10-18T10:00:00Z';
const before = Date.parse(startTime) - 120000;
const after = Date.parse(startTime) + 120000;
const snapshot = (values = {team1:100,team2:200}) => ({teamNames:['Alpha','Beta'], startTime,
  status:'upcoming',serverTime:new Date(before).toISOString(),deepMetrics:{totals:values}});

function fakeDatabase() {
  const rows = new Map();
  const calls = {reads:0,writes:0};
  let failing = false;
  const prisma = {predictionRecord:{
    async findUnique({where}) { calls.reads++; return rows.get(where.datasetKey_recordKey.recordKey) || null; },
    async upsert({where,create,update}) {
      calls.writes++;
      if (failing) throw new Error('Offline');
      const key = where.datasetKey_recordKey.recordKey;
      rows.set(key, rows.has(key) ? {...rows.get(key),...update} : create);
    },
  }};
  return {prisma,calls,rows,fail:value => {failing=value;}};
}

test('all leagues freeze observed provider totals, preserve zero, and do not mutate input', () => {
  const input = {...snapshot({team1:0,team2:'23.5'}),competitionName:'Unseen league'};
  const original = structuredClone(input);
  assert.deepEqual(totals(freeze(input,null,{now:before})), [0,23.5]);
  assert.deepEqual(input,original);
});

test('missing, live, terminal, unknown-time and after-start current totals cannot be captured', () => {
  for (const input of [
    {...snapshot(),startTime:null}, {...snapshot(),inPlay:true}, {...snapshot(),status:'ended'},
    {...snapshot(),crex:{status:'completed'}}, {...snapshot(),inputTiming:'captured-after-start'},
    {...snapshot(),capturedAt:new Date(after).toISOString()},
    {...snapshot(),serverTime:new Date(after).toISOString()},
    {...snapshot(),deepMetrics:null},
  ]) assert.equal(totals(freeze(input,null,{now:before})),null);
  // A stale upstream timestamp received after kickoff is not pre-match evidence.
  assert.equal(totals(freeze(snapshot(),null,{now:after})),null);
  assert.equal(canObservePreMatchProviderTotals({...snapshot(),serverTime:null}),false);
});

test('live updates restore captured totals by team identity and kickoff, including partial pairs', () => {
  const saved = freeze(snapshot({team1:0,team2:200}),null,{now:before});
  const live = {...snapshot({team1:900,team2:800}),status:'live',teamNames:['Beta','Alpha']};
  assert.deepEqual(totals(freeze(live,saved,{now:after})),[200,0]);
  assert.equal(totals(freeze({...live,startTime:'2026-10-19T10:00:00Z'},saved,{now:after})),null);
  assert.equal(totals(freeze({...live,teamNames:['Gamma','Alpha']},saved,{now:after})),null);
  const partial = {...snapshot(),preMatchProviderTotals:{team1:123}};
  assert.deepEqual(totals(freeze(partial,saved,{now:after})),[123,200]);
});

test('older out-of-order observations cannot roll back a newer capture', () => {
  const saved = freeze({...snapshot(),serverTime:new Date(before+30000).toISOString()},null,{now:before+30000});
  assert.deepEqual(totals(freeze(snapshot({team1:1,team2:2}),saved,{now:before+40000})),[100,200]);
});

test('archive recovery requires pre-start capture as well as pre-start source time', () => {
  const record = {snapshot:snapshot(),capturedAt:new Date(before).toISOString()};
  assert.deepEqual(totals(providerSnapshotFromRecord(record)),[100,200]);
  assert.equal(totals(providerSnapshotFromRecord({...record,capturedAt:new Date(after).toISOString()})),null);
  assert.equal(totals(providerSnapshotFromRecord({...record,inputTiming:'after-start'})),null);
});

test('partial missing totals are merged without treating blank strings as zero', () => {
  assert.deepEqual(getCurrentProviderTotals(snapshot({totalBetTeam1:'',totalBetTeam2:'0'})),[null,0]);
  assert.deepEqual(totals(freeze({...snapshot({team1:null,team2:42}),preMatchProviderTotals:{team1:7}},null,{now:before})),[7,42]);
});

test('file persistence restores both markets on first post-start load after server restart', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'provider-totals-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const options = {filePath:path.join(dir,'totals.json'),database:false};
  const store = createProviderTotalStore(options);
  await Promise.all([
    store.attach(snapshot(),{matchId:'1',market:'cricket',now:before}),
    store.attach(snapshot({team1:3,team2:4}),{matchId:'1',market:'toss',now:before}),
  ]);
  const restarted = createProviderTotalStore(options);
  const live = {...snapshot({team1:1000,team2:2000}),status:'live'};
  assert.deepEqual(totals(await restarted.attach(live,{matchId:'1',now:after})),[100,200]);
  assert.deepEqual(totals(await restarted.attach(live,{matchId:'1',market:'toss',now:after})),[3,4]);
});

test('database writes are compact, deduplicated and refreshed before kickoff', async () => {
  const db = fakeDatabase();
  const store = createProviderTotalStore({prisma:db.prisma,database:true});
  await store.attach({...snapshot(),teams:{large:'unneeded'}},{matchId:'2',now:before});
  await store.attach({...snapshot(),serverTime:new Date(before+1000).toISOString()},{matchId:'2',now:before+1000});
  assert.equal(db.calls.writes,1);
  const saved = JSON.parse(db.rows.get('cricket:2').payload);
  assert.equal(saved.teams,undefined);
  await store.attach({...snapshot({team1:120,team2:230}),serverTime:new Date(before+2000).toISOString()},{matchId:'2',now:before+2000});
  assert.equal(db.calls.writes,2);
  assert.deepEqual(totals(await store.attach({...snapshot(),status:'live'},{matchId:'2',now:after})),[120,230]);
});

test('cache miss refreshes to pick up captures persisted by another worker', async () => {
  const db = fakeDatabase();
  const reader = createProviderTotalStore({prisma:db.prisma,database:true});
  const writer = createProviderTotalStore({prisma:db.prisma,database:true});
  await reader.attach({...snapshot(),deepMetrics:null},{matchId:'3',now:before});
  await writer.attach(snapshot(),{matchId:'3',now:before});
  assert.deepEqual(totals(await reader.attach({...snapshot(),status:'live'},{matchId:'3',now:after})),[100,200]);
});

test('failed durable writes retain values in memory, throttle and retry unchanged totals', async t => {
  const db = fakeDatabase();
  const store = createProviderTotalStore({prisma:db.prisma,database:true});
  const warn = t.mock.method(console,'warn',() => {});
  db.fail(true);
  await store.attach(snapshot(),{matchId:'4',now:before});
  assert.equal(db.calls.writes,1);
  const live = {...snapshot({team1:1000,team2:2000}),status:'live'};
  assert.deepEqual(totals(await store.attach(live,{matchId:'4',now:before+1000})),[100,200]);
  assert.equal(db.calls.writes,1);
  db.fail(false);
  await store.attach(live,{matchId:'4',now:after});
  assert.equal(db.calls.writes,2);
  assert.deepEqual(totals(JSON.parse(db.rows.get('cricket:4').payload)),[100,200]);
  assert.equal(warn.mock.callCount(),1);
});


test('provider frozen pre-match activity is usable on first live load without a prior capture', async () => {
  const db = fakeDatabase();
  const store = createProviderTotalStore({prisma:db.prisma,database:true});
  const live = {...snapshot({team1:9000,team2:8000}),status:'live',
    preMatchTotalBets:{team1:0,team2:215.8}};
  const result = await store.attach(live,{matchId:'ledger',now:after});
  assert.deepEqual(totals(result),[0,215.8]);
  assert.deepEqual(result.preMatchProviderTotals,{team1:0,team2:215.8});
  assert.deepEqual(result.deepMetrics.totals,{team1:9000,team2:8000});
  const restarted = createProviderTotalStore({prisma:db.prisma,database:true});
  assert.deepEqual(totals(await restarted.attach({...snapshot(),status:'live'},
    {matchId:'ledger',now:after+1000})),[0,215.8]);
});

test('provider frozen activity is authoritative over an earlier local capture', () => {
  const input = {...snapshot(),status:'live',preMatchTotalBets:{team1:150,team2:240},
    preMatchProviderTotals:{team1:100,team2:200}};
  assert.deepEqual(totals(freeze(input,null,{now:after})),[150,240]);
});
