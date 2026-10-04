"""Verify toss outcomes from exact matched Cricbuzz fixture headers, not match winners."""
import collections
import importlib.util
import json
import pathlib
import re
from datetime import datetime,timezone

OUT=pathlib.Path(__file__).resolve().parent
ROOT=OUT.parents[1]
spec=importlib.util.spec_from_file_location('match_verifier',OUT/'verify-results.py')
verifier=importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
fixtures={str(r['matchId']):r for r in json.loads((OUT/'toss-source-fixtures.json').read_text())}
records=json.loads((ROOT/'server/data/toss_dataset.json').read_text())['records']
results=[]
decoder=json.JSONDecoder()
for r in records:
    row={'matchId':str(r['matchId']),'savedWinner':r.get('actualWinner'),'savedPrediction':r.get('predictedWinner'),'verification':'unverified','reason':'No usable snapshot or exact approved source fixture'}
    f=fixtures.get(str(r['matchId']))
    if f:
        file=pathlib.Path('/private/tmp/toss-verification')/(str(f['sourceMatchId'])+'.html')
        html=file.read_text() if file.exists() else ''
        segments=[]
        for m in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>',html):
            try:
                segment=json.loads(m[1])
                if len(segment)>1 and isinstance(segment[1],str):segments.append(segment[1])
            except (ValueError,IndexError):pass
        raw=''.join(segments)
        headers=[]
        for m in re.finditer(r'"matchHeader":',raw):
            try:
                h=decoder.raw_decode(raw[m.end():])[0]
                if str(h.get('matchId'))==str(f['sourceMatchId']):headers.append(h)
            except ValueError:pass
        if headers:
            h=headers[0]
            expected=verifier.pair(r['team1'],r['team2'])
            published=verifier.pair(h.get('team1',{}).get('name'),h.get('team2',{}).get('name'))
            if expected!=published:raise ValueError('Header fixture mismatch: '+row['matchId'])
            toss=h.get('tossResults') or {}
            name=toss.get('tossWinnerName')
            winner=next((t for t in [r['team1'],r['team2']] if name and verifier.normalize(name)==verifier.normalize(t)),None)
            row.update({'source':'Cricbuzz','sourceUrl':f['sourceUrl'],'sourceMatchId':f['sourceMatchId'],'sourceStartTime':h.get('matchStartTimestamp'),'publishedWinner':name,'decision':toss.get('decision')})
            if winner:
                row.update({'verification':'verified','actualWinner':winner,'reason':'Published toss winner in exact matched fixture header','resultText':f"{name} won the toss; decision: {toss.get('decision') or 'not stated'}",'changedWinner':bool(r.get('actualWinner')) and verifier.normalize(r['actualWinner'])!=verifier.normalize(winner)})
            else:row['reason']='Official match header does not name a toss winner'
        else:row['reason']='Public Cricbuzz match header unavailable'
    results.append(row)
ledger={'checkedAt':datetime.now(timezone.utc).isoformat(),'matchingRule':'Exact fixture from independently verified match-result mapping; both header teams must match via explicit aliases. Toss winner must be explicitly named in tossResults, independently from match result.','matches':results}
(OUT/'verified-toss-results.json').write_text(json.dumps(ledger,indent=2)+'\n')
print('TOSS RESULTS',dict(collections.Counter(r['verification'] for r in results)))
print('CORRECTED EXISTING TOSS LABELS',sum(r.get('changedWinner',False) for r in results))
print('UNVERIFIED',[(r['matchId'],r['reason']) for r in results if r['verification']!='verified'])
