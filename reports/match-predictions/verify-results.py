"""Match saved fixtures to independently published results; never infer a winner from odds."""
import collections
import datetime
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent
ALIASES = {
    'glasgowcosmics':'glasgowcosmic',
    'puranidelhi6':'puranidilli6',
    'antiguabarbudafalco':'antiguaandbarbudafalcons', 'antiguabarbudafalc':'antiguaandbarbudafalcons',
    'antiguabarbudafalcs':'antiguaandbarbudafalcons', 'antiguabarbudafalcons':'antiguaandbarbudafalcons',
    'stlucia':'saintlucia', 'stluciakings':'saintluciakings',
    'stkittsnevispats':'stkittsandnevispatriots', 'stkittsandnevispat':'stkittsandnevispatriots',
    'stkittsnevispatriots':'stkittsandnevispatriots', 'ludhianalion':'ludhianalions',
    'hongkong':'hongkongchina', 'hongkongw':'hongkongchinawomen',
    'lycakovaikings':'vidakovaikings', 'rubytrichywarriors':'trichygrandcholas',
    'tiruppurtamizhans':'idreamtiruppurtamizhans', 'maduraipanthers':'siechemmaduraipanthers',
    'queenslandbulls':'queensland', 'tasmaniatigers':'tasmania', 'newsouthwalesblues':'newsouthwales',
    'northwestdragons':'northwest', 'gardenroutebadgers':'southwestern districts',
    'lancashirethunderw':'lancashirewomen', 'theblazew':'theblaze',
    'newssouthwalesbreakersw':'newsouthwaleswomen', 'newsouthwalesbreakersw':'newsouthwaleswomen',
    'queenslandfirew':'queenslandwomen', 'southafricaemerging':'southafricaemergingplayers',
    'indiaunder19':'indiau19', 'australiaunder19':'australiau19', 'englandunder19':'englandu19', 'pakistanunder19':'pakistanu19',
    'salemspartans':'skmsalemspartans', 'cayman':'caymanislands',
    'northwestdragons':'northwesteastvaalrenaultdragons',
    'easterncapelinyathi':'border', 'easterncapeiinyathi':'border',
    'kanpursuperstar':'kanpursuperstars', 'noidasuperkings':'noidakings',
    'northamptonshirewomen':'northamptonshiresteelbackswomen',
    'rotterdamcricketclub':'rcc', 'svkampongcricket':'kampong',
    'englandunder19s':'englandu19', 'pakistanunder19s':'pakistanu19',
    'sharjahwarriorzdev':'sharjahwarriorzdevelopment', 'gulfgiantsdev':'gulfgiantsdevelopment',
    'dubaicapitalsdev':'dubaicapitalsdevelopment', 'desertvipersdev':'desertvipersdevelopment',
    'desertvipersdevelopme':'desertvipersdevelopment', 'miemiratesdev':'miemiratesdevelopment',
}

def normalize(name):
    name = re.sub(r'\s*\(Game\s*[12]\)\s*', '', str(name or ''), flags=re.I)
    key = re.sub(r'[^a-z0-9]', '', name.lower())
    if key.endswith('w') and len(key)>2:
        key = key[:-1]+'women'
    # Explicit saved aliases are applied before and after the W suffix conversion.
    original = re.sub(r'[^a-z0-9]', '', name.lower())
    value = ALIASES.get(original, ALIASES.get(key, key))
    return re.sub(r'[^a-z0-9]', '', value)

def pair(a,b):
    return tuple(sorted([normalize(a),normalize(b)]))

def date_ms(value):
    if isinstance(value,(int,float)):return int(value)
    if not value:return None
    try:return int(datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000)
    except (ValueError,AttributeError):return None

def outcome(match):
    status=match.get('status','')
    low=status.lower()
    # A team must be named as the winner in the published result, not just in commentary.
    winners=[]
    for key in ['team1','team2']:
        name=match[key]['teamName']
        sname=match[key].get('teamSName','')
        n=normalize(name)
        for m in re.finditer(r'([^()]+?)\s+(?:won|win|beat)\b',status,re.I):
            candidate=m.group(1).strip()
            if normalize(candidate)==n or (sname and normalize(candidate)==normalize(sname)):
                winners.append(name)
    if len(set(winners))==1:return 'winner',winners[0]
    if any(x in low for x in ['abandoned','no result','cancelled']):return 'no_result',None
    if 'draw' in low:return 'draw',None
    if 'tied' in low:return 'tie',None
    return 'unfinished',None

def run():
    baseline=OUT/'initial-results.json'
    if not baseline.exists():baseline.write_bytes((OUT/'results.json').read_bytes())
    audit=json.loads(baseline.read_text())
    active_ids=set()
    for name in ['match_dataset.json','toss_dataset.json']:
        active_ids.update(str(r['matchId']) for r in json.loads((ROOT/'server/data'/name).read_text())['records'])
    active_ids.update(json.loads((ROOT/'server/data/ended_matches_cache.json').read_text()).keys())
    catalog=json.loads((OUT/'source-results.json').read_text())
    if (OUT/'fallback-results.json').exists():catalog+=json.loads((OUT/'fallback-results.json').read_text())
    by_pair=collections.defaultdict(list)
    for m in catalog:
        if m.get('team1',{}).get('teamName') and m.get('team2',{}).get('teamName'):
            by_pair[pair(m['team1']['teamName'],m['team2']['teamName'])].append(m)
    checked=[]
    for r in audit['rows']:
        if r['fixture']:continue
        if r['matchId'] not in active_ids:continue
        matches=by_pair.get(pair(r.get('team1'),r.get('team2')),[])
        if r['league']=='ILT20 Development Tournament' and r.get('team1')=='Abu Dhabi Knight Riders' or r['league']=='ILT20 Development Tournament' and r.get('team2')=='Abu Dhabi Knight Riders':
            names=[('Abu Dhabi Knight Riders Development' if t=='Abu Dhabi Knight Riders' else t) for t in [r.get('team1'),r.get('team2')]]
            matches=by_pair.get(pair(*names),[])
        dt=date_ms(r.get('startTime'))
        timed=[m for m in matches if dt and abs(int(m['startDate'])-dt)<=18*3600000]
        # Restrict pair matches by format where league metadata unambiguously determines it.
        league=r['league'].lower()
        if league=='test matches' or league=='first class matches':
            timed=[m for m in matches if dt and m.get('matchFormat') in ['TEST','FIRSTCLASS','FIRST_CLASS','FC'] and int(m['startDate'])-3600000<=dt<=int(m.get('endDate') or m['startDate'])+3600000]
        elif 'one day' in league or 'd50' in league or 'limited overs' in league or 'premier cup' in league:
            timed=[m for m in timed if m.get('matchFormat') in ['ODI','LISTA','OTHER','LIST_A']]
        elif 't20' in league or 'twenty20' in league or 'premier league' in league or 'hundred' in league:
            timed=[m for m in timed if m.get('matchFormat') in ['T20','T20I','HUNDRED','HUN','T10']]
        unique={str(m.get('matchId') or m['sourceUrl']):m for m in timed}
        if len(unique)>1:
            # Deduplicate the same published fixture across providers without losing doubleheaders.
            priority={'Cricbuzz':0,'ECB official':1,'KNCB official':1,'League official':1,'ICC official':2,'League official report':3}
            dedup=[]
            for m in sorted(unique.values(),key=lambda m:priority.get(m['source'],4)):
                mk,mw=outcome(m)
                if not any(c['source']!=m['source'] and abs(int(c['startDate'])-int(m['startDate']))<=30*60000 and outcome(c)[0]==mk and normalize(outcome(c)[1])==normalize(mw) for c in dedup):dedup.append(m)
            unique={str(c['matchId']):c for c in dedup}
            if len(unique)>1:
                ranked=sorted(unique.values(),key=lambda m:abs(int(m['startDate'])-dt))
                d0=abs(int(ranked[0]['startDate'])-dt);d1=abs(int(ranked[1]['startDate'])-dt)
                if (d0<=3600000 and d1-d0>=2*3600000) or (d0<=15*60000 and d1-d0>=45*60000):unique={str(ranked[0]['matchId']):ranked[0]}
        result={
            'matchId':r['matchId'],'league':r['league'],'matchName':r['matchName'],
            'savedStartTime':r.get('startTime'),'savedWinner':r.get('actualWinner'),
            'savedPrediction':r.get('savedPrediction'),'currentPrediction':r.get('currentPrediction'),
            'sourceCount':len(unique),'candidateCount':len(matches),
        }
        if len(unique)==1:
            m=next(iter(unique.values()));kind,winner=outcome(m)
            local_winner=next((t for t in [r.get('team1'),r.get('team2')] if normalize(t)==normalize(winner)),None) if winner else None
            if r['league']=='ILT20 Development Tournament' and winner=='Abu Dhabi Knight Riders Development':local_winner='Abu Dhabi Knight Riders'
            result.update({'verification':'verified' if kind in ['winner','no_result','draw','tie'] else 'unfinished',
                'outcome':kind,'actualWinner':local_winner,'publishedWinner':winner,'resultText':m.get('status'),
                'source':m['source'],'sourceUrl':m['sourceUrl'],'sourceMatchId':m.get('matchId'),
                'sourceSeries':m.get('seriesName'),'sourceStartTime':int(m['startDate']),
                'timeDifferenceHours':round((int(m['startDate'])-dt)/3600000,2) if dt else None,
                'changedWinner':kind=='winner' and normalize(r.get('actualWinner'))!=normalize(local_winner),
                'savedVerdict':('Correct' if normalize(r.get('savedPrediction'))==normalize(local_winner) else 'Wrong') if kind=='winner' and r.get('savedPrediction') else 'Unscored',
                'currentVerdict':('Correct' if normalize(r.get('currentPrediction'))==normalize(local_winner) else 'Wrong') if kind=='winner' and r.get('currentPrediction') else 'Unscored',
            })
            if kind=='winner' and not local_winner:raise ValueError('Winner could not be mapped to saved team: '+r['matchId'])
        else:
            result.update({'verification':'ambiguous' if len(unique)>1 else 'missing_date' if not dt else 'not_found',
                'outcome':None,'actualWinner':None,'publishedWinner':None,'savedVerdict':'Unscored','currentVerdict':'Unscored',
                'nearestCandidates':[{'sourceUrl':m['sourceUrl'],'date':int(m['startDate']),'series':m.get('seriesName'),'teams':[m['team1']['teamName'],m['team2']['teamName']],'result':m.get('status')} for m in sorted(matches,key=lambda m:abs(int(m['startDate'])-(dt or 0)))[:3]],
            })
        checked.append(result)
    output={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'matchingRule':'Both teams via explicit aliases, compatible format, unique fixture within 18 hours; multi-day records must fall within the published fixture range. Concordant results from different providers within 30 minutes are deduplicated, preferring Cricbuzz. Multiple candidates require a closest start within one hour and a two-hour gap to the next candidate, or within 15 minutes with a 45-minute gap. Conflicting results stay unresolved.','matches':checked}
    (OUT/'verified-results.json').write_text(json.dumps(output,indent=2)+'\n')
    print('VERIFICATION',collections.Counter(r['verification'] for r in checked))
    print('OUTCOMES',collections.Counter(r['outcome'] for r in checked if r['verification']=='verified'))
    print('WINNER CORRECTIONS',sum(r.get('changedWinner',False) for r in checked))
    for league in sorted({r['league'] for r in checked}):
        rows=[r for r in checked if r['league']==league]
        print(league,len(rows),collections.Counter(r['verification'] for r in rows))
    print('WRONG CURRENT',[(r['matchId'],r['league'],r['currentPrediction'],r['publishedWinner']) for r in checked if r['currentVerdict']=='Wrong'])

if __name__=='__main__':run()
