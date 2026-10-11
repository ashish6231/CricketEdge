import test from 'node:test';
import assert from 'node:assert/strict';
import { extract, fit, dateFolds, summarize, candidates, selectModel } from './model.mjs';

const makeSnap = (ab=100, al=20, bb=50, bl=30) => ({ teamNames:['A','B'],teams:{
  A:{trades:[{type:'back',price:3,size:ab,updatedAt:1},{type:'lay',price:2,size:al,updatedAt:1}]},
  B:{trades:[{type:'back',price:2,size:bb,updatedAt:1},{type:'lay',price:4,size:bl,updatedAt:1}]},
} });
const swap = s => ({...s,teamNames:[...s.teamNames].reverse()});

test('four ledgers reproduce bookmaker settlement at different odds',()=>{
  const f=extract(makeSnap());
  assert.deepEqual(f.pl,[-160,120]); // A: -200+20+50-30; B: -50+90+100-20.
  assert.ok(Math.abs(f.effective-.3)<1e-10);
  assert.ok(f.liabilityDelta>0);
});

test('winner fields cannot influence extracted market features',()=>{
  const a=makeSnap();
  assert.deepEqual(extract({...a,actualWinner:'A',predictedWinner:'B'}),extract({...a,actualWinner:'B',predictedWinner:'A'}));
});

test('missing ledgers and malformed trades fail closed; empty selection can be zero',()=>{
  const s=makeSnap();
  s.teams.A.trades[0].price=1;
  assert.equal(extract(s),null);
  assert.equal(extract({...makeSnap(),teams:{A:{trades:[]}}}),null);
  assert.equal(extract(makeSnap(0,0,0,0)),null);
  assert.ok(extract(makeSnap(0,0,20,1)));
});

const rows=Array.from({length:100},(_,i)=>({id:String(i),date:`2026-09-${String(1+Math.floor(i/4)).padStart(2,'0')}`,y:i%2,f:extract(i%2?makeSnap(100+i,5,10,20):makeSnap(10,20,100+i,5))}));

test('date folds exclude same-date outcomes and duplicate test membership',()=>{
  const folds=dateFolds(rows), ids=[];
  for(const {train,test} of folds){assert.ok(train.at(-1).date<test[0].date);ids.push(...test.map(r=>r.id));}
  assert.equal(ids.length,new Set(ids).size);
});

test('every candidate reverses probabilities when selections are swapped',()=>{
  for(const spec of candidates){
    const m=fit(spec,rows);
    const a=extract(makeSnap(70,13,5,10)), b=extract(swap(makeSnap(70,13,5,10)));
    assert.ok(Math.abs(m.predict(a)+m.predict(b)-1)<1e-10,spec.id);
  }
});

test('logistic and tree models learn a known synthetic symmetric signal',()=>{
  for(const spec of [candidates.find(c=>c.id==='logistic-flow-0.1'),candidates.find(c=>c.id==='tree-depth1-leaf12')]){
    const m=fit(spec,rows.slice(0,60));
    assert.ok(m.predict(extract(makeSnap(100,5,10,20)))>.7,spec.id);
    assert.ok(m.predict(extract(makeSnap(10,20,100,5)))<.3,spec.id);
  }
  assert.notEqual(selectModel(rows).spec.id,'chance');
});

test('chance is an abstention and not counted as a correct winner pick',()=>{
  const s=summarize([{p:.5,y:1},{p:.5,y:0},{p:.6,y:1},{p:.4,y:1}]);
  assert.equal(s.picks,2);assert.equal(s.abstained,2);assert.equal(s.correct,1);assert.equal(s.accuracy,.5);assert.equal(s.coverage,.5);
});
