const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const {EventEmitter} = require('node:events');
const {Readable} = require('node:stream');
const crex = require('../services/crexService');

const START = Date.parse('2026-10-18T08:00:00Z');
const SLUG = 'pak-vs-sl-1st-odi-odi-tri-series-in-pakistan-2026-match-updates-13NB';
const liveKey = 'https://api.goscorer.com/api/v3/getLiveMatches';
const mappingKey = 'https://oc.crickapi.com/mapping/getHomeMapDatahome';
const fixtureKey = 'https://stats.crickapi.com/fixture/getFixture';
const scoreKey = 'https://api.goscorer.com/api/v3/getSV3';
const entities = {'&':'&a;','"':'&q;',"'":'&s;','<':'&l;','>':'&g;'};
const html = state => `<script type="application/json" id="app-root-state">${JSON.stringify(state).replace(/[&"'<>]/g, value=>entities[value])}</script><a href="/cricket-live-score/${SLUG}"></a>`;
const homeState = (changes={}) => ({
  [liveKey]: {'13NB':{b:'U',c:'T',e:'2M3',d:2,s:1,ti:'0-34m : 0-39s',tiMs:START,
    j:'305/10(49.5',k:'121/4(24.0',res:'Innings Break',f_key:'13NB',...changes}},
  [mappingKey]: {t:[{f_key:'U',n:'Pakistan',sn:'PAK'},{f_key:'T',n:'Sri Lanka',sn:'SL'}],s:[{f_key:'2M3',n:'ODI Tri Series in Pakistan 2026'}]},
  article:'<span style="font-family: &quot;Suisse Screen Bold&quot;">Cricket news &amp; updates</span>',
});

function mockPages(t, pages) {
  t.mock.method(https,'get',(url,options,callback)=>{
    const request = new EventEmitter(); request.destroy=()=>{};
    process.nextTick(()=>{
      const body=pages[String(url)];
      const response=Readable.from(body == null ? [] : [Buffer.from(body)]);
      response.statusCode=body == null ? 503 : 200;response.headers={};
      callback(response);
    });
    return request;
  });
}

test('transport decoding preserves article entities instead of corrupting the whole homepage', () => {
  const state=homeState();
  assert.deepEqual(crex.parseState(html(state)),state);
  const raw = {text:'Literal &quot;quotes&quot; and &q; data'};
  assert.deepEqual(crex.parseState(`<script id="app-root-state">${JSON.stringify(raw)}</script>`),raw);
  assert.deepEqual(crex.parseState('<script id="app-root-state">{&quot;text&quot;:&quot;A &amp;quot;quoted&amp;quot; value&quot;}</script>'),{text:'A &quot;quoted&quot; value'});
  assert.equal(crex.parseState('<script id="app-root-state">{broken}</script>'),null);
});

test('Pakistan–Sri Lanka second innings remains live and uses its real scheduled date', () => {
  const rows=crex.parseCrexOverview(html(homeState()));
  const fixture=rows.find(row=>row.crexMatchId==='13NB');
  assert.equal(fixture.status,'live');
  assert.equal(fixture.startTime,START);
  assert.equal(fixture.score1,'305/10(49.5)');
  assert.equal(fixture.score2,'121/4(24.0)');
  assert.equal(crex.findCrexMatch('Pakistan v Sri Lanka',rows,{startTime:START,inPlay:true}).crexMatchId,'13NB');
  assert.equal(crex.findCrexMatch('Sri Lanka v Pakistan',rows,{startTime:START,inPlay:true}).score1,'121/4(24.0)');
  assert.equal(crex.findCrexMatch('Pakistan v Sri Lanka',rows,{startTime:START+7*86400000,inPlay:true}),null);
});

test('fixture lifecycle takes priority over innings for upcoming and completed matches', () => {
  for (const [changes,expected] of [[{s:0,d:1},'upcoming'],[{s:2,d:1,res:'No Result'},'completed'],[{s:'1',d:2},'live'],[{s:undefined,d:2,res:''},'upcoming']]) {
    assert.equal(crex.parseCrexOverview(html(homeState(changes)))[0].status,expected);
  }
});

test('fresh home scores and status supersede a stale schedule row without duplicate fixtures', () => {
  const schedule = {[fixtureKey]:[{nf:'13NB',id:51383,team1:'Pakistan',team2:'Sri Lanka',status:0,t:START,
    team1Score1:'100-2',team1Over1:'20.0',link:`/cricket-live-score/${SLUG}`,venue:'Rawalpindi',flag1:'pak.png',flag2:'sl.png'}]};
  const rows=crex.parseCrexOverview(html(homeState()),schedule);
  assert.equal(rows.length,1);
  assert.equal(rows[0].crexMatchId,'13NB');
  assert.equal(rows[0].status,'live');
  assert.equal(rows[0].score1,'305/10(49.5)');
  assert.equal(rows[0].venue,'Rawalpindi');
  assert.equal(rows[0].team1Flag,'pak.png');
  assert.equal(crex.parseCrexOverview('',schedule)[0].crexMatchId,'13NB');
});

test('homepage-only live fixtures survive a transient failed homepage refresh', async t => {
  const page=html(homeState());
  const pages={'https://crex.com/':page,'https://crex.com/schedule':html({[fixtureKey]:[]})};
  mockPages(t,pages);
  const first=await crex.getCrexOverview(true);
  assert.equal(first.find(row=>row.crexMatchId==='13NB').status,'live');
  delete pages['https://crex.com/'];
  const next=await crex.getCrexOverview(true);
  assert.equal(next.find(row=>row.crexMatchId==='13NB').status,'live');
});

test('innings breaks, stumps, delays and run equations never mark live scorecards completed', async t => {
  const messages=['Innings Break','Stumps','Rain Delay','Sri Lanka need 185 runs in 156 balls'];
  const pages=Object.fromEntries(messages.map((B,index)=>[`https://crex.com/cricket-live-score/live-pause-${index}`,
    html({[scoreKey]:{status:1,B,team1_f_n:'Sri Lanka',team2_f_n:'Pakistan',score1:'121-4',score2:'305-10'}})]));
  pages['https://crex.com/cricket-live-score/real-result']=html({[scoreKey]:{status:2,B:'Pakistan won by 50 runs',team1_f_n:'Sri Lanka',team2_f_n:'Pakistan'}});
  mockPages(t,pages);
  for (let index=0;index<messages.length;index++) {
    const detail=await crex.getCrexMatchDetail(`live-pause-${index}`);
    assert.equal(detail.status,'live',messages[index]);
    assert.equal(detail.runningBall.isCompleted,false);
    assert.equal(detail.scorecard.matchResult,null);
  }
  assert.equal((await crex.getCrexMatchDetail('real-result')).status,'completed');
});


test('a subscribed Pakistan–Sri Lanka market is eligible for live detail polling in the second innings', t => {
  const stubs = [
    ['../services/dataCache',{getCricketMatches:()=>[{matchId:'36187761',matchName:'Pakistan v Sri Lanka',startTime:START,status:'live',inPlay:true}]}],
    ['../services/socketService',{getActiveSubscribedMatchIds:()=>['36187761']}],
    ['../services/normalizer/queue',{getIngestQueue:()=>{throw new Error('Unexpected queue access in a candidate selection test');}}],
  ];
  for (const [name,exports] of stubs) {
    const id=require.resolve(name), previous=require.cache[id];
    require.cache[id]={id,filename:id,loaded:true,exports};
    t.after(()=>{if(previous) require.cache[id]=previous;else delete require.cache[id];});
  }
  const worker=require('../services/scraper-crex');
  const candidates=worker.buildDetailCandidates(crex.parseCrexOverview(html(homeState())),Date.now());
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].localMatchId,'36187761');
  assert.equal(candidates[0].crexMatch.crexMatchId,'13NB');
});

test('the website feed attaches the live CREX scorecard to the existing Pakistan–Sri Lanka market', async t => {
  const local={matchId:'36187761',matchName:'Pakistan v Sri Lanka',competitionName:'One Day Internationals',startTime:START,status:'live',inPlay:true};
  const overview=crex.parseCrexOverview(html(homeState()));
  const cacheId=require.resolve('../services/dataCache'),previousCache=require.cache[cacheId];
  require.cache[cacheId]={id:cacheId,filename:cacheId,loaded:true,exports:{
    getCricketMatches:()=>[local],getTossMatches:()=>[],getCrexOverview:()=>overview,
    getCricketSnapshot:async()=>({teamNames:['Pakistan','Sri Lanka'],teams:{Pakistan:{trades:[]},'Sri Lanka':{trades:[]}}}),
    getCrexDetail:()=>({status:'live',scorecard:{status:'live',team1:{name:'Sri Lanka',shortName:'SL',score:'127-4 25.0'},team2:{name:'Pakistan',shortName:'PAK',score:'305-10 49.5'}}}),
  }};
  const serviceId=require.resolve('../services/matchPayloadService'),previousService=require.cache[serviceId];
  delete require.cache[serviceId];
  t.after(()=>{
    if(previousCache) require.cache[cacheId]=previousCache;else delete require.cache[cacheId];
    if(previousService) require.cache[serviceId]=previousService;else delete require.cache[serviceId];
  });
  const payload=await require('../services/matchPayloadService').getCricketMatchesPayload();
  const match=payload.matches.find(row=>row.matchId===local.matchId);
  assert.equal(match.crex.crexMatchId,'13NB');
  assert.equal(match.crex.status,'live');
  assert.equal(match.crex.score1,'305-10 49.5');
  assert.equal(match.crex.score2,'127-4 25.0');
});
