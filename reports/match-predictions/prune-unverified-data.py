"""User-authorized cleanup: preserve independently confirmed outcomes, archive everything first."""
import collections
import hashlib
import json
import pathlib
import shutil
from datetime import datetime,timezone

OUT=pathlib.Path(__file__).resolve().parent
ROOT=OUT.parents[1]
DATA=ROOT/'server/data'
def read(p):return json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def usable(r):
    return isinstance(r.get('snapshot'),dict) and bool(r['snapshot']) and r.get('startTime') and r.get('team1') and r.get('team2') and r['team1']!=r['team2'] and not str(r['matchId']).startswith('test-')
def run():
    if (OUT/'cleanup-manifest.json').exists():raise RuntimeError('Cleanup already applied; review the manifest before another cleanup.')
    match_path=DATA/'match_dataset.json';toss_path=DATA/'toss_dataset.json';cache_path=DATA/'ended_matches_cache.json'
    match=read(match_path);toss=read(toss_path);cache=read(cache_path)
    matches=read(OUT/'verified-results.json');tosses=read(OUT/'verified-toss-results.json')
    verified={str(r['matchId']):r for r in matches['matches']}
    verified_toss={str(r['matchId']):r for r in tosses['matches']}
    before_match=match['records'];before_toss=toss['records']
    keep_match=[r for r in before_match if usable(r) and verified.get(str(r['matchId']),{}).get('verification')=='verified']
    keep_toss=[r for r in before_toss if usable(r) and verified_toss.get(str(r['matchId']),{}).get('verification')=='verified']
    assert len(keep_match)==275 and len(keep_toss)==114
    checked_at=datetime.now(timezone.utc).isoformat()
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup=OUT/'backups'/('cleanup-'+stamp)
    backup.mkdir(parents=True)
    paths=[match_path,toss_path,cache_path,DATA/'verified_match_results.json',OUT/'verified-results.json',OUT/'verified-toss-results.json',OUT/'results.json',OUT/'league-wise-results.md',OUT/'unverified-matches.json',OUT/'README.md']
    hashes={}
    for p in paths:
        if p.exists():
            hashes[str(p.relative_to(ROOT))]=digest(p)
            dest=backup/p.relative_to(ROOT);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
    for r in keep_toss:
        v=verified_toss[str(r['matchId'])]
        if r.get('actualWinner')!=v['actualWinner'] or r.get('status')!='verified':
            r.setdefault('resultLabelHistory',[]).append({'recordedAt':checked_at,'previous':{k:r.get(k) for k in ['actualWinner','status','confirmedAt','confirmedByEmail']},'reason':'Independent Cricbuzz toss audit'})
        r['actualWinner']=v['actualWinner'];r['status']='verified'
        r['resultVerification']={k:v.get(k) for k in ['verification','source','sourceUrl','sourceMatchId','sourceStartTime','publishedWinner','decision','resultText']}
        r['resultVerification'].update({'checkedAt':tosses['checkedAt'],'outcome':'toss_winner','matchingRule':tosses['matchingRule']})
    match['records']=keep_match;match['updatedAt']=checked_at
    toss['records']=keep_toss;toss['updatedAt']=checked_at
    ids={str(r['matchId']) for r in keep_match+keep_toss}
    retained_cache={k:v for k,v in cache.items() if str(k) in ids}
    filtered_ledger={**matches,'matches':[r for r in matches['matches'] if str(r['matchId']) in ids],'scope':'Retained records after user-requested verified-data cleanup'}
    filtered_toss={**tosses,'matches':[r for r in tosses['matches'] if str(r['matchId']) in {str(t['matchId']) for t in keep_toss}]}
    assert all(r['verification']=='verified' for r in filtered_ledger['matches'])
    assert len(filtered_ledger['matches'])==len(ids)
    staged={match_path:match,toss_path:toss,cache_path:retained_cache,DATA/'verified_match_results.json':filtered_ledger,DATA/'verified_toss_results.json':filtered_toss,OUT/'verified-results.json':filtered_ledger,OUT/'verified-toss-results.json':filtered_toss,OUT/'unverified-matches.json':{'checkedAt':checked_at,'count':0,'matches':[],'note':'Unverified records removed from active data; original audit retained in cleanup backup.'}}
    # Verify files did not change while preparing the backup and cleanup.
    assert all(digest(ROOT/name)==value for name,value in hashes.items())
    for path,data in staged.items():
        temp=path.with_suffix('.cleanup.tmp');temp.write_text(json.dumps(data,indent=2)+'\n');temp.replace(path)
    old_match={str(r['matchId']):r for r in read(backup/'server/data/match_dataset.json')['records']}
    old_toss={str(r['matchId']):r for r in read(backup/'server/data/toss_dataset.json')['records']}
    protected=['snapshot','predictedWinner','predictionConfidence','predictionReason','predictionTier','matchedRules','predictorVersion','startTime','capturedAt','team1','team2','competitionName']
    assert all(all(r.get(k)==old_match[str(r['matchId'])].get(k) for k in protected) for r in keep_match)
    assert all(all(r.get(k)==old_toss[str(r['matchId'])].get(k) for k in protected) for r in keep_toss)
    manifest={'cleanedAt':checked_at,'backup':str(backup.relative_to(ROOT)),'beforeHashes':hashes,'protectedFields':protected,'protectedFieldsUnchanged':True,'matches':{'before':len(before_match),'kept':len(keep_match),'removed':len(before_match)-len(keep_match),'winners':sum(r['status']=='verified' for r in keep_match),'noResult':sum(r['status']=='abandoned' for r in keep_match)},'tosses':{'before':len(before_toss),'kept':len(keep_toss),'removed':len(before_toss)-len(keep_toss),'correctedExistingWinners':sum(r.get('changedWinner',False) for r in filtered_toss['matches']),'newlyConfirmed':sum(old_toss[str(r['matchId'])]['status']!='verified' for r in keep_toss)},'cache':{'before':len(cache),'kept':len(retained_cache),'removed':len(cache)-len(retained_cache)},'inventory':{'kept':len(ids),'removedIds':sorted(({str(r['matchId']) for r in before_match+before_toss}|set(cache))-ids)},'removedMatchIds':[str(r['matchId']) for r in before_match if str(r['matchId']) not in {str(t['matchId']) for t in keep_match}],'removedTossIds':[str(r['matchId']) for r in before_toss if str(r['matchId']) not in {str(t['matchId']) for t in keep_toss}]}
    (OUT/'cleanup-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:v for k,v in manifest.items() if k in ['backup','matches','tosses','cache']},indent=2))

if __name__=='__main__':run()
