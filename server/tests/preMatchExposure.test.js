const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {capturePreMatchExposure:capture,recoverPreMatchProviderExposure:recover}=require('../utils/preMatchExposure.mjs');
const {createProviderTotalStore}=require('../services/providerTotalStore');
const start=Date.parse('2026-11-01T08:00:00Z');
const trade=(type,size,price,time=start-2000)=>({type,size,price,updatedAt:time});
const fixture=()=>({teamNames:['A','B'],startTime:start,serverTime:start-1000,
  preMatchVolume:{team1:{back:100,lay:20},team2:{back:80,lay:50}},preMatchPnl:{team1:-150,team2:100},
  teams:{A:{trades:[trade('back',100,3),trade('lay',20,2)]},B:{trades:[trade('back',80,2),trade('lay',50,3)]}}});

test('frozen provider ledger recovers all four exposures when priced pre-match rows are missing',()=>{
  const snap=fixture();snap.serverTime=start+60000;snap.inPlay=true;
  snap.preMatchTotalBets={team1:250,team2:100};snap.teams={A:{trades:[]},B:{trades:[]}};
  snap.deepMetrics={simplePL:{team1_win:999999,team2_win:999999},totals:{team1:999999,team2:999999}};
  const result=capture(snap,null,{now:start+60000});
  assert.equal(result.preMatchCapture.state,'locked');
  assert.equal(result.preMatchCapture.exposureSource,'provider-period-ledger');
  assert.equal(result.preMatchExposure.team1.backExposure,200);
  assert.equal(result.preMatchExposure.team1.layExposure,20);
  assert.equal(result.preMatchExposure.team2.backExposure,80);
  assert.equal(result.preMatchExposure.team2.layExposure,100);
  assert.deepEqual(result.preMatchCapture.pnl,{team1:-180,team2:-30});
  assert.equal(result.preMatchExposure.team2.recordedTrades,null);
});

test('Janakpur-shaped partial history recovers period values instead of showing zero risk and false positive P/L',()=>{
  const snap={teamNames:['Janakpur Bolts','Pokhara Avengers'],startTime:start,serverTime:start+60000,inPlay:true,
    preMatchVolume:{team1:{back:149.13,lay:18.45},team2:{back:54.04,lay:11.26}},
    preMatchTotalBets:{team1:128.02,team2:82.67},preMatchPnl:{team1:-58.85,team2:85.24},
    teams:{'Janakpur Bolts':{trades:[trade('back',.01,1.01)]},'Pokhara Avengers':{trades:[]}}};
  const result=capture(snap,null,{now:start+60000});
  const expected={team1:{back:116.76,lay:15.13,pnl:-98.31},team2:{back:64.22,lay:18.78,pnl:-52.96}};
  for(const [key,value] of Object.entries(expected)) {
    assert.ok(Math.abs(result.preMatchExposure[key].backExposure-value.back)<1e-8);
    assert.ok(Math.abs(result.preMatchExposure[key].layExposure-value.lay)<1e-8);
    assert.ok(Math.abs(result.preMatchCapture.pnl[key]-value.pnl)<1e-8);
  }
  assert.equal(result.preMatchCapture.state,'locked');
  assert.equal(result.preMatchExposure.team2.recordedTrades,null);
  delete snap.preMatchTotalBets;
  const incomplete=capture(snap,null,{now:start+60000});
  assert.equal(incomplete.preMatchCapture.state,'waiting');
  assert.equal(incomplete.preMatchCapture.pnl.team1,null);
});

test('incomplete, negative, missing and Draw ledgers never produce guessed exposures',()=>{
  const snap=fixture();snap.preMatchTotalBets={team1:250,team2:100};
  for(const corrupt of [s=>delete s.preMatchPnl.team2,s=>s.preMatchTotalBets.team1=1,
    s=>s.preMatchPnl.team1=-99999,s=>s.teamNames.push('The Draw'),s=>s.preMatchVolume.team1.lay='',
    s=>s.preMatchTotalBets.team1=null]) {
    const broken=structuredClone(snap);corrupt(broken);assert.equal(recover(broken),null);
  }
});

test('recovery agrees with independently priced complete historical pre-match ledgers',()=>{
  const {getTradeStats,timestamp,tradeTimestamp}=require('../utils/bookiePl.mjs');
  const data=JSON.parse(require('node:fs').readFileSync(require.resolve('../data/match_dataset.json'),'utf8'));
  let checked=0;
  for(const record of data.records) {
    const snap=record.snapshot,names=snap?.teamNames,kickoff=timestamp(snap?.startTime??record.startTime);
    if(names?.length!==2 || kickoff==null)continue;
    const derived=recover(snap);if(!derived)continue;
    const stats=names.map(name=>getTradeStats((snap.teams?.[name]?.trades||[]).filter(row=>tradeTimestamp(row)<kickoff)));
    if(!stats.every((value,index)=>Math.abs(value.tBack-snap.preMatchVolume[`team${index+1}`].back)<.02
      && Math.abs(value.tLay-snap.preMatchVolume[`team${index+1}`].lay)<.02))continue;
    for(const [index,values] of stats.entries()) {
      const actual=derived[`team${index+1}`];
      assert.ok(Math.abs((actual.backExposure??0)-values.tBackLiab)<.02,`${record.matchId}: Back`);
      assert.ok(Math.abs((actual.layExposure??0)-values.tLayLiab)<.02,`${record.matchId}: Lay`);
      checked+=2;
    }
  }
  assert.ok(checked>=78);
});

test('one coherent set of four positive exposures locks the whole capture and never changes',()=>{
  const saved=capture(fixture(),null,{now:start-500});
  assert.equal(saved.preMatchCapture.state,'locked');
  assert.equal(saved.preMatchExposure.team1.netExposure,180);
  assert.equal(saved.preMatchExposure.team2.netExposure,-20);
  const live={...fixture(),serverTime:start+5000,inPlay:true,teamNames:['B','A'],teams:{A:{trades:[]},B:{trades:[]}},
    preMatchVolume:{team1:{back:999,lay:999},team2:{back:999,lay:999}}};
  const restored=capture(live,saved,{now:start+5000});
  assert.equal(restored.preMatchExposure.team1.netExposure,-20);
  assert.equal(restored.preMatchExposure.team2.netExposure,180);
  assert.equal(restored.preMatchCapture.lockedAt,start-500);
  assert.deepEqual(restored.preMatchCapture.volume.team2,{back:100,lay:20});
});

test('zero/missing exposure prevents locking and both nets stay unavailable after kickoff',()=>{
  const snap=fixture();snap.teams.A.trades.pop();
  const before=capture(snap,null,{now:start-500});
  assert.equal(before.preMatchCapture.state,'waiting');
  assert.equal(before.preMatchExposure.team1.layExposure,null);
  assert.equal(before.preMatchExposure.team1.netExposure,null);
  assert.equal(before.preMatchExposure.team2.netExposure,null);
  const live=capture({...snap,inPlay:true,serverTime:start+1000},before,{now:start+1000});
  assert.equal(live.preMatchCapture.state,'waiting');
  assert.equal(live.preMatchCapture.lockedAt,null);
});

test('late-arriving pre-start history locks after kickoff without using live trades',()=>{
  const snap=fixture();snap.teams.A.trades.pop();
  const pending=capture(snap,null,{now:start-500});
  const live={...snap,serverTime:start+5000,inPlay:true};
  live.preMatchVolume={...live.preMatchVolume,team1:{back:100,lay:30}};
  live.teams.A.trades.push(trade('lay',30,4,start-100));
  live.teams.A.trades.push(trade('back',50000,10,start+1000));
  const saved=capture(live,pending,{now:start+5000});
  assert.equal(saved.preMatchCapture.state,'locked');
  assert.equal(saved.preMatchCapture.mode,'pre-match');
  assert.equal(saved.preMatchCapture.capturedAfterStart,true);
  assert.equal(saved.preMatchCapture.lockedAt,start+5000);
  assert.equal(saved.preMatchExposure.team1.netExposure,110);
  assert.deepEqual(saved.preMatchCapture.volume.team1,{back:100,lay:30});
  live.teams.A.trades.push(trade('lay',900,5,start+2000));
  assert.equal(capture(live,saved,{now:start+10000}).preMatchExposure.team1.netExposure,110);
});

test('live trades cannot complete an incomplete pre-match set or restore a contaminated old lock',()=>{
  const snap=fixture();snap.teams.A.trades.pop();snap.inPlay=true;snap.serverTime=start+5000;
  snap.teams.A.trades.push(trade('lay',50000,10,start+1000));
  const contaminated=capture(fixture(),null,{now:start-500});
  contaminated.preMatchCapture.mode='after-start';contaminated.preMatchCapture.version=1;
  contaminated.preMatchCapture.exposure.team1.backExposure=999999;
  const result=capture(snap,contaminated,{now:start+5000});
  assert.equal(result.preMatchCapture.state,'waiting');
  assert.equal(result.preMatchCapture.mode,'pre-match');
  assert.equal(result.preMatchExposure.team1.backExposure,200);
  assert.equal(result.preMatchExposure.team1.layExposure,null);
  assert.equal(result.preMatchExposure.team1.netExposure,null);
});

test('partial snapshots and legacy captures are not stitched into an apparently complete lock',()=>{
  const old=fixture();old.teams.A.trades.pop();
  const partial=capture(old,null,{now:start-500});
  const next=fixture();next.teams.A.trades.shift();
  assert.equal(capture(next,partial,{now:start-100}).preMatchCapture.state,'waiting');
  const legacy={...fixture(),preMatchExposure:capture(fixture()).preMatchExposure};
  const empty={...fixture(),teams:{A:{trades:[]},B:{trades:[]}}};
  assert.equal(capture(empty,legacy).preMatchCapture.state,'waiting');
});

test('no P/L or current-odds fallback; future and malformed rows cannot complete the set',()=>{
  for(const corrupt of [s=>s.teams.A.trades[0].price=1,s=>delete s.teams.A.trades[0].updatedAt,
    s=>s.teams.A.trades[0].updatedAt=start+1000,s=>s.teams.A.trades=[]]) {
    const snap=fixture();corrupt(snap);snap.deepMetrics={simplePL:{team1_win:99999}};
    const result=capture(snap);
    assert.equal(result.preMatchCapture.state,'waiting');
    assert.equal(result.preMatchExposure.team1?.netExposure ?? null,null);
  }
  assert.equal(capture({...fixture(),startTime:null}).preMatchCapture,undefined);
  const equal=fixture();equal.teams.A.trades=[trade('back',10,2),trade('lay',10,2)];
  equal.preMatchVolume.team1={back:10,lay:10};
  assert.equal(capture(equal).preMatchExposure.team1.netExposure,0);
});

test('durable locked capture restores all fields after restart and rejected zero captures can recover',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'exposure-lock-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const options={database:false,filePath:path.join(dir,'captures.json')};
  const incomplete=fixture();incomplete.teams.A.trades.pop();
  await createProviderTotalStore(options).attach(incomplete,{matchId:'1',now:start-500});
  const complete={...fixture(),serverTime:start+1000,inPlay:true};
  const saved=await createProviderTotalStore(options).attach(complete,{matchId:'1',now:start+1000});
  assert.equal(saved.preMatchCapture.state,'locked');
  const restored=await createProviderTotalStore(options).attach({...complete,teams:{}},{matchId:'1',now:start+2000});
  assert.equal(restored.preMatchExposure.team1.netExposure,180);
  assert.equal(restored.preMatchCapture.lockedAt,start+1000);
});

test('raw-SQL persistence deduplicates immutable locks with deployed Prisma clients',async()=>{
  const rows=new Map();let writes=0;
  const prisma={async $queryRaw(_strings,_dataset,key){return rows.has(key)?[{payload:rows.get(key)}]:[]},
    async $executeRaw(_strings,_id,_dataset,key,payload){writes++;rows.set(key,payload)}};
  const options={prisma,database:true},store=createProviderTotalStore(options);
  await store.attach(fixture(),{matchId:'raw',now:start-500});
  await store.attach({...fixture(),serverTime:start-200},{matchId:'raw',now:start-100});
  assert.equal(writes,1);
  const restored=await createProviderTotalStore(options).attach({...fixture(),teams:{},serverTime:start+1000},
    {matchId:'raw',now:start+1000});
  assert.equal(restored.preMatchExposure.team1.netExposure,180);
});
