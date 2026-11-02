import { finiteNumber, getTradeStats, timestamp, tradeTimestamp, splitMatchOutcomes, calcSimpleBookiePl } from './bookiePl.mjs';
import { providerStartTime, getExplicitPreMatchProviderTotals } from './providerTotals.mjs';

const positive = value => finiteNumber(value) != null && Number(value) > 0;
const close = (a,b) => finiteNumber(a)!=null && finiteNumber(b)!=null
  && Math.abs(Number(a)-Number(b))<=Math.max(.02,Math.abs(Number(b))*1e-8);
const keyFor = (names,name) => `team${names.indexOf(name)+1}`;
export function hasCompleteExposure(exposure,names,volume=null) {
  const {t1,t2}=splitMatchOutcomes(names);
  return [t1,t2].every(name=>{
    const key=keyFor(names,name),value=exposure?.[key],declared=volume?.[key];
    return names?.includes(name) && ['backExposure','layExposure'].every(side=>positive(value?.[side]))
      && value.backComplete!==false && value.layComplete!==false
      && (!declared || (close(value.backStake,declared.back) && close(value.layStake,declared.lay)));
  });
}
export function isPreMatchCapture(capture,start=null) {
  return [1,2,3].includes(capture?.version) && capture.mode==='pre-match'
    && ['waiting','locked'].includes(capture.state)
    && (start==null || timestamp(capture.startTime)===start);
}

/** Recover a two-outcome provider's frozen ledger, without live metrics or
 * assumed prices. T_A = back liability A + lay stake B;
 * settlement P/L A = -back liability A + lay liability A + back stake B - lay stake B.
 * These identities are checked against retained complete pre-start ledgers. */
export function recoverPreMatchProviderExposure(snapshot) {
  const names=snapshot?.teamNames;
  if(snapshot?.error || !Array.isArray(names) || names.length!==2 || splitMatchOutcomes(names).drawName)return null;
  const fields=names.map((_,index)=>{
    const key=`team${index+1}`,volume=snapshot.preMatchVolume?.[key];
    return {back:finiteNumber(volume?.back),lay:finiteNumber(volume?.lay),
      total:finiteNumber(snapshot.preMatchTotalBets?.[key]),pnl:finiteNumber(snapshot.preMatchPnl?.[key])};
  });
  if(fields.some(value=>Object.values(value).some(number=>number==null)
    || value.back<0 || value.lay<0 || value.total<0))return null;
  const exposure={};
  for(const [index,own] of fields.entries()) {
    const other=fields[1-index];
    let back=own.total-other.lay;
    let lay=own.pnl+back-other.back+other.lay;
    // Only round floating-point residue at zero; inconsistent ledgers fail closed.
    if(back < -1e-7 || lay < -1e-7 || !Number.isFinite(back) || !Number.isFinite(lay))return null;
    back=Math.max(0,back);lay=Math.max(0,lay);
    if((own.back===0 && back>1e-7) || (own.lay===0 && lay>1e-7))return null;
    exposure[`team${index+1}`]={backExposure:positive(back)?back:null,layExposure:positive(lay)?lay:null,
      netExposure:null,backStake:own.back,layStake:own.lay,recordedTrades:null,
      backComplete:true,layComplete:true,source:'provider-period-ledger'};
  }
  return exposure;
}
function remap(source,oldNames,names) {
  return Object.fromEntries(names.map((name,index)=>{
    const value=source?.[keyFor(oldNames,name)] ?? null;
    return [`team${index+1}`,value && typeof value==='object' ? {...value} : value];
  }));
}

/** Lock one coherent observation only after all four team exposures are > 0.
 * After kickoff, keep waiting for late-arriving PRE-start history only.
 * Never infer missing liabilities from P/L, odds summaries or previous partials. */
export function capturePreMatchExposure(snapshot,previous=null,{now=null}={}) {
  if (!snapshot || snapshot.error || snapshot._seeded) return snapshot;
  const start=providerStartTime(snapshot),names=snapshot.teamNames;
  if (start==null || !Array.isArray(names) || names.length<2) return snapshot;
  const previousCapture=previous?.preMatchCapture ?? ([1,2,3].includes(previous?.version) ? previous : null);
  for (const saved of [previousCapture,snapshot.preMatchCapture]) {
    if (!isPreMatchCapture(saved,start) || saved.state!=='locked'
      || timestamp(saved.lockedAt)==null
      || saved.teamNames?.length!==names.length || !names.every(name=>saved.teamNames.includes(name))
      || !hasCompleteExposure(saved.exposure,saved.teamNames,saved.volume)) continue;
    const locked={...saved,version:3,teamNames:names,
      exposure:remap(saved.exposure,saved.teamNames,names),pnl:remap(saved.pnl,saved.teamNames,names),
      volume:remap(saved.volume,saved.teamNames,names),bets:remap(saved.bets,saved.teamNames,names),
      providerTotals:remap(saved.providerTotals,saved.teamNames,names),
      sources:saved.sources ? {pnl:remap(saved.sources.pnl,saved.teamNames,names),volume:remap(saved.sources.volume,saved.teamNames,names)} : undefined};
    for(const value of Object.values(locked.exposure))if(value && positive(value.backExposure) && positive(value.layExposure))
      value.netExposure=Number(value.backExposure)-Number(value.layExposure);
    locked.pnl=Object.fromEntries(names.map((name,index)=>{
      const value=locked.exposure[`team${index+1}`];
      return [`team${index+1}`,positive(value?.backExposure) && value.backComplete!==false
        ? calcSimpleBookiePl(value.backExposure,finiteNumber(locked.volume?.[`team${index+1}`]?.lay) ?? value.layStake) : null];
    }));
    locked.sources={...locked.sources,pnl:Object.fromEntries(names.map((_,index)=>[`team${index+1}`,locked.exposureSource==='provider-period-ledger'?'provider-period-ledger':'recorded']))};
    return {...snapshot,preMatchCapture:locked,preMatchExposure:locked.exposure};
  }
  const observedAt=timestamp(snapshot.serverTime ?? snapshot.updatedAt) ?? now ?? Date.now();
  const capturedAt=now ?? observedAt;
  function observe() {
    const exposure={},stats={};
    for (const [index,name] of names.entries()) {
      const trades=snapshot.teams?.[name]?.trades;
      if (!Array.isArray(trades) || trades.some(row=>tradeTimestamp(row)==null)) continue;
      const rows=trades.filter(row=>(observedAt==null || tradeTimestamp(row)<=observedAt)
        && tradeTimestamp(row)<start);
      const values=getTradeStats(rows);
      if (values.invalid || !rows.length) continue;
      stats[name]=values;
      const volume=snapshot.preMatchVolume?.[`team${index+1}`];
      exposure[`team${index+1}`]={backExposure:positive(values.tBackLiab)?values.tBackLiab:null,
        layExposure:positive(values.tLayLiab)?values.tLayLiab:null,
        netExposure:null,backStake:values.tBack,layStake:values.tLay,recordedTrades:rows.length,
        backComplete:finiteNumber(volume?.back)!=null?close(values.tBack,volume.back):undefined,
        layComplete:finiteNumber(volume?.lay)!=null?close(values.tLay,volume.lay):undefined};
    }
    return {exposure,stats};
  }
  const mode='pre-match',observation=observe();
  const recovered=recoverPreMatchProviderExposure(snapshot);
  if(recovered)for(const [key,value] of Object.entries(recovered)) {
    value.recordedTrades=observation.exposure[key]?.recordedTrades ?? null;
    observation.exposure[key]=value;
  }
  const ready=hasCompleteExposure(observation.exposure,names);
  const {exposure,stats}=observation;
  if (ready) for (const value of Object.values(exposure)) {
    if (positive(value.backExposure) && positive(value.layExposure))
      value.netExposure=value.backExposure-value.layExposure;
  }
  const volume={},pnl={},bets={},providerTotals={},sources={pnl:{},volume:{}};
  const emptyProvider=!Object.values(snapshot.preMatchVolume||{}).some(value=>Number(value?.back)>0 || Number(value?.lay)>0);
  const totals=getExplicitPreMatchProviderTotals(snapshot);
  for (const [index,name] of names.entries()) {
    const key=`team${index+1}`,values=stats[name];
    const useProvider=snapshot.preMatchVolume?.[key] && !emptyProvider;
    volume[key]=useProvider
      ? snapshot.preMatchVolume[key] : values ? {back:values.tBack,lay:values.tLay} : null;
    const value=exposure[key];
    pnl[key]=positive(value?.backExposure) && value.backComplete!==false
      ? calcSimpleBookiePl(value.backExposure,finiteNumber(volume[key]?.lay) ?? value.layStake) : null;
    bets[key]=!emptyProvider ? finiteNumber(snapshot.preMatchTotalBets?.[key]) : null;
    providerTotals[key]=totals?.[index] ?? null;
    if(emptyProvider && providerTotals[key]===0)providerTotals[key]=null;
    sources.pnl[key]=pnl[key]!=null?(recovered?'provider-period-ledger':'recorded'):'unavailable';
    sources.volume[key]={back:useProvider?'provider':'recorded',lay:useProvider?'provider':'recorded'};
  }
  const capture={version:3,state:ready?'locked':'waiting',startTime:start,teamNames:names,
    lockedAt:ready?capturedAt:null,observedAt,mode,
    capturedAfterStart:ready && capturedAt>=start,
    exposure,volume,pnl,bets,providerTotals,sources,exposureSource:recovered?'provider-period-ledger':'recorded'};
  return {...snapshot,preMatchExposure:exposure,preMatchCapture:capture};
}
