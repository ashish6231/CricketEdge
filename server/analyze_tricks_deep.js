/**
 * Deep trick mining — cross-signals, toss, bookie PL, traps, time windows.
 */
const axios = require('axios');
const fs = require('fs');

const BASE = 'https://tennisliveload.com';

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
const sortT = (t) => [...(t||[])].sort((a,b)=>(a.updatedAt||0)-(b.updatedAt||0));
const firstN = (t,n) => sortT(t).slice(0,n);
const lastN = (t,n) => sortT(t).slice(-n);
const vol = (trades) => {
  let back=0,lay=0,backLiab=0,layLiab=0;
  for(const t of trades||[]){ const s=t.size||0,p=t.price||0;
    if(t.type==='back'){back+=s;backLiab+=s*(p-1);} else if(t.type==='lay'){lay+=s;layLiab+=s*(p-1);}
  }
  return {back,lay,backLiab,layLiab,total:back+lay};
};
const plIfWins = (s1,s2,team) => team===1
  ? s1.backLiab-s1.layLiab-s2.back+s2.lay
  : s2.backLiab-s2.layLiab-s1.back+s1.lay;

function inferWinner(snap) {
  const t1=snap.teamNames[0],t2=snap.teamNames[1];
  const tr1=snap.teams?.[t1]?.trades||[], tr2=snap.teams?.[t2]?.trades||[];
  const min1=tr1.length?Math.min(...tr1.map(t=>t.price)):999;
  const min2=tr2.length?Math.min(...tr2.map(t=>t.price)):999;
  if(min1<=1.12&&min1<min2) return t1;
  if(min2<=1.12&&min2<min1) return t2;
  return min1<=min2?t1:t2;
}

function extract(snap, tossSnap) {
  const t1=snap.teamNames[0], t2=snap.teamNames[1];
  const tr1=snap.teams?.[t1]?.trades||[], tr2=snap.teams?.[t2]?.trades||[];
  const pv1=snap.preMatchVolume?.team1||{}, pv2=snap.preMatchVolume?.team2||{};
  const ip1=snap.inPlayVolume?.team1||{}, ip2=snap.inPlayVolume?.team2||{};
  const m1=snap.advancedMetricsV2?.team1||{}, m2=snap.advancedMetricsV2?.team2||{};
  const sa=snap.syntheticSupport?.teamA||{}, sb=snap.syntheticSupport?.teamB||{};
  const ms=snap.marketSignals||{};
  const v1=vol(tr1), v2=vol(tr2);
  const preV1=vol([]); preV1.back=pv1.back||0; preV1.lay=pv1.lay||0;
  const preV2=vol([]); preV2.back=pv2.back||0; preV2.lay=pv2.lay||0;

  const pre5_1=median(firstN(tr1,5).map(t=>t.price));
  const pre5_2=median(firstN(tr2,5).map(t=>t.price));
  const last5_1=median(lastN(tr1,5).map(t=>t.price));
  const last5_2=median(lastN(tr2,5).map(t=>t.price));

  const loadT=(m1.totalBet||0)+(m2.totalBet||0);
  const load1pct=loadT>0?(m1.totalBet||0)/loadT:0.5;

  // Toss cross
  let tossFade=null, tossMs=null, tossMoreBetted=null;
  if(tossSnap?.teamNames?.length===2) {
    const tt1=tossSnap.teamNames[0], tt2=tossSnap.teamNames[1];
    tossMoreBetted=tossSnap.marketSignals?.moreBettedTeam;
    tossMs=tossSnap.marketSignals?.prediction?.prediction;
    if(tossMoreBetted) tossFade=tossMoreBetted===tt1?tt2:tt1;
  }

  // Map toss team names to match team names (same names usually)
  const tossPickMatch = (tossWinner) => {
    if(!tossWinner) return null;
    if(tossWinner===t1||tossWinner.includes(t1)||t1.includes(tossWinner)) return t1;
    if(tossWinner===t2||tossWinner.includes(t2)||t2.includes(tossWinner)) return t2;
    return tossWinner;
  };

  return {
    t1,t2, actual:null,
    pre5_1,pre5_2,last5_1,last5_2,
    preBack1:pv1.back||0,preLay1:pv1.lay||0,preBack2:pv2.back||0,preLay2:pv2.lay||0,
    ipBack1:ip1.back||0,ipLay1:ip1.lay||0,ipBack2:ip2.back||0,ipLay2:ip2.lay||0,
    v2Back1:m1.back||0,v2Lay1:m1.lay||0,v2Total1:m1.totalBet||0,
    v2Back2:m2.back||0,v2Lay2:m2.lay||0,v2Total2:m2.totalBet||0,
    load1pct, load1:snap.matchLoadV2?.team1, load2:snap.matchLoadV2?.team2,
    prePnl1:snap.preMatchPnl?.team1, prePnl2:snap.preMatchPnl?.team2,
    ipPnl1:snap.inPlayPnl?.team1, ipPnl2:snap.inPlayPnl?.team2,
    pl1:plIfWins(v1,v2,1), pl2:plIfWins(v1,v2,2),
    prePl1:plIfWins(preV1,preV2,1), prePl2:plIfWins(preV1,preV2,2),
    msPred:ms.prediction?.prediction, bookieFav:ms.bookieFavouriteOutcome,
    moreBetted:ms.moreBettedTeam, riskTeam:ms.riskTeam,
    trap:ms.trap?.level||'none', trapReason:ms.trap?.reason,
    supportConf:ms.supportConfidence,
    synSup1:sa.support, synSup2:sb.support,
    synMoney1:sa.supportMoney, synMoney2:sb.supportMoney,
    supPct1:snap.supportMetrics?.team1?.support,
    supPct2:snap.supportMetrics?.team2?.support,
    backPct1:snap.advancedMetrics?.team1?.backPercentage,
    backPct2:snap.advancedMetrics?.team2?.backPercentage,
    tossFade: tossPickMatch(tossFade), tossMs: tossPickMatch(tossMs),
    hasToss: !!tossSnap,
    matchLoad1:snap.matchLoadV2?.team1, matchLoad2:snap.matchLoadV2?.team2,
    competition:snap.competitionName,
    totalMatched:snap.totalMatched,
  };
}

function score(name, fn, rows) {
  let c=0,t=0,skip=0; const wrong=[];
  for(const r of rows){ const p=fn(r); if(p==null){skip++;continue;} t++; if(p===r.actual)c++; else wrong.push({...r,pred:p}); }
  return {name, acc:t?c/t:0,c,t,skip,wrong};
}

const pick=(a,b,t1,t2,higher=true)=> higher?(a>=b?t1:t2):(a<b?t1:t2);
const fadeMB=r=>r.moreBetted?(r.moreBetted===r.t1?r.t2:r.t1):null;
const lowerOdds=(o1,o2,t1,t2,g=0)=> o1==null||o2==null||Math.abs(o1-o2)<g?null:(o1<=o2?t1:t2);

const TRICKS = {
  // ── Already known best ──
  'Fade More Betted': fadeMB,

  // ── Bookie P/L tricks ──
  'Bookie wins if T1 (higher PL)': r => r.pl1==null||r.pl2==null?null:pick(r.pl1,r.pl2,r.t1,r.t2),
  'Bookie wins if T2 (higher PL)': r => r.pl1==null||r.pl2==null?null:pick(r.pl2,r.pl1,r.t2,r.t1),
  'Fade bookie profit team': r => r.pl1==null||r.pl2==null?null:pick(r.pl1,r.pl2,r.t2,r.t1,false),
  'Pre-match PL higher wins': r => r.prePl1==null||r.prePl2==null?null:pick(r.prePl1,r.prePl2,r.t1,r.t2),
  'Fade pre-match PL higher': r => r.prePl1==null||r.prePl2==null?null:pick(r.prePl1,r.prePl2,r.t2,r.t1,false),
  'IP PnL higher wins': r => r.ipPnl1==null||r.ipPnl2==null?null:pick(r.ipPnl1,r.ipPnl2,r.t1,r.t2),
  'Fade IP PnL higher': r => r.ipPnl1==null||r.ipPnl2==null?null:pick(r.ipPnl1,r.ipPnl2,r.t2,r.t1,false),

  // ── Lay/back ratio tricks ──
  'Lower back% (lay heavy)': r => pick(r.backPct1??50,r.backPct2??50,r.t1,r.t2,false),
  'Higher V2 lay vol': r => pick(r.v2Lay1,r.v2Lay2,r.t1,r.t2),
  'Lower V2 lay vol (fade lay)': r => pick(r.v2Lay1,r.v2Lay2,r.t2,r.t1,false),
  'Lay/Back ratio lower': r => {
    const r1=r.preLay1>0?r.preBack1/r.preLay1:999, r2=r.preLay2>0?r.preBack2/r.preLay2:999;
    return pick(r1,r2,r.t1,r.t2,false);
  },

  // ── Support / synthetic ──
  'Higher syn support %': r => r.synSup1==null||r.synSup2==null?null:pick(r.synSup1,r.synSup2,r.t1,r.t2),
  'Lower syn support (fade)': r => r.synSup1==null||r.synSup2==null?null:pick(r.synSup1,r.synSup2,r.t2,r.t1,false),
  'Higher syn support money': r => pick(r.synMoney1||0,r.synMoney2||0,r.t1,r.t2),
  'Higher support %': r => r.supPct1==null||r.supPct2==null?null:pick(r.supPct1,r.supPct2,r.t1,r.t2),

  // ── Trap tricks ──
  'Trap high → fade moreBetted': r => r.trap!=='high'||!r.moreBetted?null:fadeMB(r),
  'Trap medium+ → fade moreBetted': r => !['high','medium'].includes(r.trap)||!r.moreBetted?null:fadeMB(r),
  'Trap high → fade loaded (load)': r => {
    if(r.trap!=='high') return null;
    return r.load1pct>0.55?r.t2:r.t1;
  },

  // ── Odds movement ──
  'Odds dropped (last5 < pre5)': r => {
    if(r.pre5_1==null||r.last5_1==null||r.pre5_2==null||r.last5_2==null) return null;
    const d1=r.last5_1-r.pre5_1, d2=r.last5_2-r.pre5_2;
    if(d1<d2) return r.t1; if(d2<d1) return r.t2; return null;
  },
  'Last 5 trades odds fav': r => lowerOdds(r.last5_1,r.last5_2,r.t1,r.t2,0),

  // ── Toss cross-market ──
  'Toss fade moreBetted': r => r.tossFade,
  'Toss MS prediction': r => r.tossMs,
  'Match+Toss fade agree': r => {
    const mf=fadeMB(r); if(!mf||!r.tossFade||mf!==r.tossFade) return null; return mf;
  },

  // ── Combo tricks ──
  'Fade MB + bookie fav agree': r => {
    const f=fadeMB(r); if(!f||!r.bookieFav||r.bookieFav==='balanced'||f!==r.bookieFav) return null; return f;
  },
  'Fade MB + MS disagree with public': r => {
    if(!r.moreBetted||!r.msPred||r.msPred==='No Prediction') return null;
    if(r.msPred===r.moreBetted) return null;
    return fadeMB(r);
  },
  'Fade MB when MS=bookie≠public': r => {
    if(!r.moreBetted||!r.msPred||!r.bookieFav||r.bookieFav==='balanced') return null;
    if(r.msPred!==r.bookieFav||r.msPred===r.moreBetted) return null;
    return fadeMB(r);
  },
  'Risk team wins': r => r.riskTeam||null,
  'Fade risk team': r => r.riskTeam?(r.riskTeam===r.t1?r.t2:r.t1):null,

  // ── Load tricks ──
  'V2 load lower wins (fade heavy)': r => pick(r.v2Total1,r.v2Total2,r.t2,r.t1,false),
  'matchLoadV2 lower % wins': r => {
    if(r.load1==null||r.load2==null) return null;
    return r.load1<=r.load2?r.t1:r.t2;
  },
  'IP back vol higher': r => pick(r.ipBack1,r.ipBack2,r.t1,r.t2),
  'IP lay vol higher': r => pick(r.ipLay1,r.ipLay2,r.t1,r.t2),

  // ── Pre-match vs IP divergence ──
  'IP vol spike team fades': r => {
    const ip1=r.ipBack1+r.ipLay1, ip2=r.ipBack2+r.ipLay2;
    const pre1=r.preBack1+r.preLay1, pre2=r.preBack2+r.preLay2;
    const spike1=pre1>0?ip1/pre1:0, spike2=pre2>0?ip2/pre2:0;
    if(spike1===spike2) return null;
    return spike1>spike2?r.t2:r.t1; // fade team with bigger in-play spike
  },
};

// Advanced composites
const COMPOSITES = {
  'V1: FadeMB only': r => fadeMB(r),
  'V2: FadeMB→MS→pre5': r => fadeMB(r)||(r.msPred&&r.msPred!=='No Prediction'?r.msPred:null)||lowerOdds(r.pre5_1,r.pre5_2,r.t1,r.t2,0.05),
  'V3: FadeMB+bookie agree→pick': r => {
    const f=fadeMB(r);
    if(f&&r.bookieFav&&r.bookieFav!=='balanced'&&f===r.bookieFav) return f;
    return fadeMB(r);
  },
  'V4: FadeMB when MS≠public': r => {
    if(!r.moreBetted) return null;
    if(r.msPred&&r.msPred!=='No Prediction'&&r.msPred===r.moreBetted) return r.moreBetted;
    return fadeMB(r);
  },
  'V5: FadeMB + toss fade agree': r => {
    const f=fadeMB(r);
    if(f&&r.tossFade&&f===r.tossFade) return f;
    return fadeMB(r);
  },
  'V6: FadeMB + fade bookie PL': r => {
    const f=fadeMB(r);
    const fb=r.pl1==null||r.pl2==null?null:pick(r.pl1,r.pl2,r.t2,r.t1,false);
    if(f&&fb&&f===fb) return f;
    return f;
  },
  'V7: Trap→FadeMB→MS': r => {
    if(r.trap==='high'&&r.moreBetted) return fadeMB(r);
    if(r.msPred&&r.msPred!=='No Prediction') return r.msPred;
    return fadeMB(r);
  },
  'V8: Weighted mega': r => {
    const v={}; const add=(t,w)=>{if(t)v[t]=(v[t]||0)+w;};
    add(fadeMB(r),5);
    add(r.msPred&&r.msPred!=='No Prediction'?r.msPred:null,3);
    add(r.bookieFav&&r.bookieFav!=='balanced'?r.bookieFav:null,2);
    add(lowerOdds(r.pre5_1,r.pre5_2,r.t1,r.t2,0.05),2);
    add(r.pl1!=null&&r.pl2!=null?pick(r.pl1,r.pl2,r.t2,r.t1,false):null,2);
    add(r.riskTeam,1);
    add(r.tossFade,2);
    add(r.load1!=null&&r.load2!=null?(r.load1<=r.load2?r.t1:r.t2):null,1);
    const e=Object.entries(v).sort((a,b)=>b[1]-a[1]);
    return e[0]?.[0]||null;
  },
  'V9: FadeMB + MS≠public + bookie': r => {
    if(!r.moreBetted) return fadeMB(r);
    const f=fadeMB(r);
    if(r.msPred&&r.msPred!=='No Prediction'&&r.msPred!==r.moreBetted) {
      if(r.bookieFav&&r.bookieFav!=='balanced'&&(r.bookieFav===f||r.bookieFav===r.msPred)) return f;
      return f;
    }
    if(r.msPred===r.moreBetted) return r.moreBetted;
    return f;
  },
  'V10: Syn support fade + FadeMB': r => {
    const synFade=r.synSup1!=null&&r.synSup2!=null?pick(r.synSup1,r.synSup2,r.t2,r.t1,false):null;
    const f=fadeMB(r);
    if(synFade&&f&&synFade===f) return f;
    return f;
  },
};

(async () => {
  console.log('Deep trick mining — fetching 26 ended + toss cross-data...\n');
  const { data: ml } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  const ended = (Array.isArray(ml) ? ml : []).filter(m => m.status === 'ended');

  const rows = [];
  for (const m of ended) {
    try {
      const [{ data: snap }, tossRes] = await Promise.all([
        axios.get(`${BASE}/api/cricket/snapshot`, { params: { matchId: m.matchId }, timeout: 25000 }),
        axios.get(`${BASE}/api/toss/snapshot`, { params: { matchId: m.matchId }, timeout: 15000 }).catch(() => ({ data: null })),
      ]);
      const actual = inferWinner(snap);
      if (!actual) continue;
      const r = extract(snap, tossRes.data);
      r.actual = actual;
      r.matchName = m.matchName;
      r.matchId = m.matchId;
      rows.push(r);
      process.stdout.write('.');
      await new Promise(x => setTimeout(x, 100));
    } catch { process.stdout.write('x'); }
  }
  console.log(`\n${rows.length} matches loaded\n`);

  const trickResults = Object.entries(TRICKS).map(([n,f]) => score(n,f,rows)).sort((a,b)=>b.acc-a.acc||b.t-a.t);
  console.log('='.repeat(80));
  console.log('NEW TRICKS (accuracy ≥ 50%)');
  console.log('='.repeat(80));
  for (const r of trickResults.filter(x => x.t > 0 && x.acc >= 0.5)) {
    console.log(`  ${(r.acc*100).toFixed(1).padStart(5)}% (${r.c}/${r.t}, skip ${r.skip}) — ${r.name}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('ALL TRICKS (top 20)');
  console.log('='.repeat(80));
  for (const r of trickResults.filter(x=>x.t>0).slice(0,20)) {
    console.log(`  ${(r.acc*100).toFixed(1).padStart(5)}% (${r.c}/${r.t}) — ${r.name}`);
  }

  const compResults = Object.entries(COMPOSITES).map(([n,f]) => score(n,f,rows)).sort((a,b)=>b.acc-a.acc);
  console.log('\n' + '='.repeat(80));
  console.log('COMPOSITE VARIANTS');
  console.log('='.repeat(80));
  for (const r of compResults) {
    console.log(`  ${(r.acc*100).toFixed(1).padStart(5)}% (${r.c}/${r.t}) — ${r.name}`);
  }

  const best = compResults[0];
  console.log('\n' + '='.repeat(80));
  console.log(`BEST COMPOSITE: ${best.name} — ${(best.acc*100).toFixed(1)}% (${best.c}/${best.t})`);
  console.log('='.repeat(80));
  const bestFn = COMPOSITES[best.name.split(': ')[1]?.trim() ? Object.keys(COMPOSITES).find(k=>k.startsWith(best.name.split(' ')[0])) : Object.keys(COMPOSITES)[0]];
  const bestKey = Object.entries(COMPOSITES).sort((a,b)=>{
    const sa=score(a[0],a[1],rows), sb=score(b[0],b[1],rows);
    return sb.acc-sa.acc;
  })[0][0];
  for (const row of rows) {
    const p = COMPOSITES[bestKey](row);
    const ok = p === row.actual;
    console.log(`  ${ok?'✅':'❌'} ${row.matchName.slice(0,40).padEnd(40)} → ${(p||'?').slice(0,22)}`);
  }

  // New discoveries ≥ 84.6%
  console.log('\n' + '='.repeat(80));
  console.log('TRICKS BEATING OR MATCHING Fade MB (84.6%)');
  console.log('='.repeat(80));
  const threshold = 22/26;
  for (const r of trickResults.filter(x => x.t >= 20 && x.acc >= threshold)) {
    console.log(`  🔥 ${(r.acc*100).toFixed(1)}% — ${r.name}`);
  }
  for (const r of compResults.filter(x => x.acc >= threshold)) {
    console.log(`  🔥 ${(r.acc*100).toFixed(1)}% — ${r.name}`);
  }

  fs.writeFileSync('trick_mining_results.json', JSON.stringify({
    testedAt: new Date().toISOString(),
    matchCount: rows.length,
    topTricks: trickResults.filter(x=>x.t>0).slice(0,25).map(r=>({name:r.name,acc:r.acc,c:r.c,t:r.t})),
    composites: compResults.map(r=>({name:r.name,acc:r.acc,c:r.c,t:r.t})),
  }, null, 2));
  console.log('\nSaved trick_mining_results.json');
})();
