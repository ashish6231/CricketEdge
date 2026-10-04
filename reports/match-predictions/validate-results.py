"""Reconcile saved corrections, source evidence, score totals, and full inventory coverage."""
import collections
import hashlib
import importlib.util
import json
import pathlib

OUT=pathlib.Path(__file__).resolve().parent
ROOT=OUT.parents[1]
spec=importlib.util.spec_from_file_location('verify_results',OUT/'verify-results.py')
verify=importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
report=json.loads((OUT/'results.json').read_text())
ledger=json.loads((OUT/'verified-results.json').read_text())
quality_path=OUT/'pre-match-quality-cleanup.json'
if quality_path.exists():
    import math
    quality=json.loads(quality_path.read_text())
    match_data=json.loads((ROOT/'server/data/match_dataset.json').read_text())
    toss_data=json.loads((ROOT/'server/data/toss_dataset.json').read_text())
    cache=json.loads((ROOT/'server/data/ended_matches_cache.json').read_text())
    active_ids={str(r['matchId']) for r in match_data['records']+toss_data['records']}
    assert len(active_ids)==quality['inventory']['kept']
    assert {str(r['matchId']) for r in report['rows']}==active_ids=={str(r['matchId']) for r in ledger['matches']}
    assert sum(l['total'] for l in report['leagues'])==len(active_ids)
    assert len(match_data['records'])==quality['matches']['kept']
    assert len(toss_data['records'])==quality['tosses']['kept']
    assert not (active_ids & set(quality['inventory']['removedIds']))
    finite=lambda x: isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
    for name,data in [('match_dataset.json',match_data),('toss_dataset.json',toss_data)]:
        old=json.loads((ROOT/quality['backup']/'server/data'/name).read_text())
        by_id={str(r['matchId']):r for r in old['records']}
        for r in data['records']:
            assert r==by_id[str(r['matchId'])],('Retained row modified',r['matchId'])
            snap=r['snapshot'];total=0
            assert len(snap['teamNames'])>=2 and snap['teamNames'][0]!=snap['teamNames'][1]
            for key in ['team1','team2']:
                vol=snap['preMatchVolume'][key]
                assert all(finite(vol[k]) and vol[k]>=0 for k in ['back','lay'])
                assert finite(snap['preMatchPnl'][key])
                if snap.get('preMatchTotalBets'):assert finite(snap['preMatchTotalBets'][key]) and snap['preMatchTotalBets'][key]>=0
                total+=vol['back']+vol['lay']
            assert total>0,('Both teams zero',r['matchId'])
            assert r['resultVerification']['verification']=='verified'
            assert r['resultVerification']['sourceUrl'].startswith('https://')
            if r['actualWinner']!='No Result':assert verify.normalize(r['actualWinner']) in {verify.normalize(r['team1']),verify.normalize(r['team2'])}
    old_cache=json.loads((ROOT/quality['backup']/'server/data/ended_matches_cache.json').read_text())
    assert cache=={k:v for k,v in old_cache.items() if k in active_ids}
    for file,digest in quality['afterHashes'].items():assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,file
    for file,digest in quality['beforeHashes'].items():assert hashlib.sha256((ROOT/quality['backup']/file).read_bytes()).hexdigest()==digest,file
    assert (ROOT/'server/data/verified_match_results.json').read_bytes()==(OUT/'verified-results.json').read_bytes()
    assert (ROOT/'server/data/verified_toss_results.json').read_bytes()==(OUT/'verified-toss-results.json').read_bytes()
    for field in ['saved','current','pageStart','live']:
        score=report['totals'][field]
        assert score['correct']+score['wrong']==score['scored']
        for metric in ['correct','wrong']:assert sum(l[field][metric] for l in report['leagues'])==score[metric]
    assert report['totals']['independentlyUnresolved']==0
    assert report['totals']['current']['scored']==quality['matches']['winners']
    print(f"PASS: input-quality cleanup, {len(match_data['records'])} match records, {len(toss_data['records'])} toss records, {len(active_ids)} IDs; source evidence, unchanged retained rows, backup hashes and score totals reconciled.")
    print('Saved:',report['totals']['saved'],'Current:',report['totals']['current'])
    raise SystemExit(0)
cleanup=(OUT/'cleanup-manifest.json').exists()
manifest=json.loads((OUT/('cleanup-manifest.json' if cleanup else 'save-manifest.json')).read_text())
saved=json.loads((ROOT/'server/data/match_dataset.json').read_text())
original=json.loads((ROOT/manifest['backup']/('server/data/match_dataset.json' if cleanup else 'match_dataset.json')).read_text())
real=[r for r in report['rows'] if not r['fixture']]
assert len(real)==(manifest['inventory']['kept'] if cleanup else 431)
assert len(report['leagues'])==(35 if cleanup else 45)
assert len({r['matchId'] for r in real})==len(real)
assert {r['matchId'] for r in real}=={r['matchId'] for r in ledger['matches']}
assert sum(l['total'] for l in report['leagues'])==len(real)
for field in ['saved','current','pageStart','live']:
    s=report['totals'][field]
    assert s['correct']+s['wrong']==s['scored']
    assert sum(l[field]['correct'] for l in report['leagues'])==s['correct']
    assert sum(l[field]['wrong'] for l in report['leagues'])==s['wrong']
for r in real:
    v=r['resultVerification']
    if v['verification']=='verified':
        assert v['sourceUrl'].startswith('https://') and v['resultText']
        if v['outcome']=='winner':
            assert verify.normalize(r['actualWinner']) in {verify.normalize(r['team1']),verify.normalize(r['team2'])}
            for prediction,verdict in [('savedPrediction','savedVerdict'),('currentPrediction','currentVerdict')]:
                expected='No prediction' if not r[prediction] else 'Correct' if verify.normalize(r[prediction])==verify.normalize(r['actualWinner']) else 'Wrong'
                assert r[verdict]==expected,(r['matchId'],prediction)
        else:assert not r['actualVerified'] and r['savedVerdict']=='Unscored'
    else:assert r['actualWinner'] is None and r['savedVerdict']=='Unscored'
original_by_id={str(r['matchId']):r for r in original['records']}
for b in saved['records']:
    a=original_by_id[str(b['matchId'])]
    assert all(a.get(k)==b.get(k) for k in manifest['protectedFields'])
    if str(b['matchId']).startswith('test-'):assert a==b;continue
    v=b['resultVerification']
    if v['verification']!='verified':assert b['status']=='pending' and b['actualWinner'] is None
    if b['status']=='abandoned':assert b['actualWinner']=='No Result' and b['predictionCorrect'] is None
if cleanup:
    toss=json.loads((ROOT/'server/data/toss_dataset.json').read_text())
    old_toss=json.loads((ROOT/manifest['backup']/'server/data/toss_dataset.json').read_text())
    old_toss_by_id={str(r['matchId']):r for r in old_toss['records']}
    assert len(saved['records'])==manifest['matches']['kept']==275
    assert len(toss['records'])==manifest['tosses']['kept']==114
    for r in toss['records']:
        assert r['status']=='verified' and r['resultVerification']['verification']=='verified'
        assert r['resultVerification']['outcome']=='toss_winner'
        assert r['resultVerification']['sourceUrl'].startswith('https://www.cricbuzz.com/')
        assert r['actualWinner'] in [r['team1'],r['team2']]
        assert all(r.get(k)==old_toss_by_id[str(r['matchId'])].get(k) for k in manifest['protectedFields'])
    assert all(r['resultVerification']['verification']=='verified' for r in saved['records'])
    assert all(not str(r['matchId']).startswith('test-') for r in saved['records']+toss['records'])
    ids={str(r['matchId']) for r in saved['records']+toss['records']}
    cache=json.loads((ROOT/'server/data/ended_matches_cache.json').read_text())
    old_cache=json.loads((ROOT/manifest['backup']/'server/data/ended_matches_cache.json').read_text())
    assert cache=={k:v for k,v in old_cache.items() if k in ids}
    assert not (set(manifest['inventory']['removedIds'])&ids)
    assert report['totals']['independentlyUnresolved']==0
    assert report['totals']['tossSaved']['scored']==113
    assert report['totals']['saved']=={'correct':196,'wrong':54,'scored':250,'accuracy':78.4}
else:
    for name,digest in manifest['unchangedSources'].items():
        assert hashlib.sha256((ROOT/'server/data'/name).read_bytes()).hexdigest()==digest
assert (ROOT/'server/data/verified_match_results.json').read_bytes()==(OUT/'verified-results.json').read_bytes()
sources=collections.Counter(v['source'] for v in ledger['matches'] if v['verification']=='verified')
print(f"PASS: {len(real)} matches; {len(report['leagues'])} league groups; source evidence, scores, preserved predictions/snapshots, cleanup, no-result flags, and backup reconciled.")
print('Confirmed source counts:',dict(sources))
print('Saved:',report['totals']['saved'],'Current:',report['totals']['current'])
