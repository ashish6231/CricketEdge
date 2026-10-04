"""Save independently verified results without changing predictions or snapshots."""
import collections
import datetime
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / 'server/data'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run():
    ledger = json.loads((OUT/'verified-results.json').read_text())
    verified = {r['matchId']:r for r in ledger['matches']}
    target = DATA/'match_dataset.json'
    before = json.loads(target.read_text())
    untouched = {name:sha(DATA/name) for name in ['toss_dataset.json','ended_matches_cache.json']}
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = OUT/'backups'/stamp
    backup.mkdir(parents=True)
    shutil.copy2(target, backup/'match_dataset.json')
    original_hash = sha(target)
    changed = []
    for r in before['records']:
        if str(r['matchId']).startswith('test-'):continue
        v = verified[str(r['matchId'])]
        previous = {k:r.get(k) for k in ['actualWinner','status','predictionCorrect','confirmedByEmail']}
        confirmed = v['verification']=='verified'
        r['actualWinner'] = v['actualWinner'] if confirmed and v['outcome']=='winner' else 'No Result' if confirmed and v['outcome']=='no_result' else None
        r['status'] = 'verified' if confirmed and v['outcome']=='winner' else 'abandoned' if confirmed and v['outcome']=='no_result' else 'pending'
        r['predictionCorrect'] = v['savedVerdict']=='Correct' if confirmed and v['outcome']=='winner' and r.get('predictedWinner') else None
        if any(previous[k]!=r.get(k) for k in ['actualWinner','status','predictionCorrect']):
            r.setdefault('resultLabelHistory',[]).append({'recordedAt':ledger['checkedAt'],'previous':previous,'reason':'Independent official result audit'})
            changed.append(str(r['matchId']))
        r['resultVerification'] = {k:v.get(k) for k in ['verification','outcome','publishedWinner','resultText','source','sourceUrl','sourceMatchId','sourceStartTime','timeDifferenceHours']}
        r['resultVerification']['checkedAt'] = ledger['checkedAt']
        r['resultVerification']['matchingRule'] = ledger['matchingRule']
    original = json.loads((backup/'match_dataset.json').read_text())
    protected = ['predictedWinner','predictionTier','predictionConfidence','snapshot','startTime','capturedAt','team1','team2','matchName','competitionName']
    assert len(original['records'])==len(before['records'])
    assert all(all(a.get(k)==b.get(k) for k in protected) for a,b in zip(original['records'],before['records']))
    before['updatedAt'] = ledger['checkedAt']
    temp = target.with_suffix('.verified.tmp')
    temp.write_text(json.dumps(before,indent=2)+'\n')
    temp.replace(target)
    (DATA/'verified_match_results.json').write_text(json.dumps(ledger,indent=2)+'\n')
    assert all(sha(DATA/name)==value for name,value in untouched.items())
    manifest = {'checkedAt':ledger['checkedAt'],'backup':str(backup.relative_to(ROOT)),'originalSha256':original_hash,'updatedSha256':sha(target),'unchangedSources':untouched,'protectedFields':protected,'protectedFieldsUnchanged':True,'changedLabels':changed,'records':len(before['records']),'verificationCounts':dict(collections.Counter(r['verification'] for r in ledger['matches']))}
    (OUT/'save-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))

if __name__=='__main__':run()
