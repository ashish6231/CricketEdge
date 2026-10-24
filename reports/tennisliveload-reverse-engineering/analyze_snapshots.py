"""Offline checks of historical TennisLiveLoad-shaped snapshots; no network/login.

Run from the repository root: python3 reports/tennisliveload-reverse-engineering/analyze_snapshots.py
This tests numeric identities, not access to the provider's implementation.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'reports/match-predictions/backups/pre-match-quality-20261002T151528Z/server/data/match_dataset.json'
OUTPUT = Path(__file__).resolve().parent / 'analysis.json'


def value(obj, path):
    for part in path.split('.'):
        obj = obj[part]
    if isinstance(obj, bool) or not isinstance(obj, (float, int)) or not math.isfinite(obj):
        raise ValueError('Not a finite number')
    return obj


def stats(trades):
    result = dict(back=0, lay=0, back_exposure=0, lay_exposure=0)
    for trade in trades:
        side = str(trade.get('type', trade.get('side', ''))).lower()
        side = {'b': 'back', 'l': 'lay'}.get(side, side)
        size, price = value(trade, 'size'), value(trade, 'price')
        if side not in ('back', 'lay') or size < 0 or price <= 1:
            raise ValueError('Invalid decimal-odds trade')
        result[side] += size
        result[side + '_exposure'] += size * (price - 1)
    return result


# A/B refer to teamNames[0]/teamNames[1], not the favourite/underdog.
# B_A = back stake; L_A = lay stake; EBA/ELA = back/lay exposure.
FORMULAS = [
    ('raw back exposure A', 'deepMetrics.raw.A_back_expo', 'EBA', lambda c: c['EBA']),
    ('raw lay stake A', 'deepMetrics.raw.A_lay_stake', 'L_A', lambda c: c['L_A']),
    ('back exposure A', 'bookmakerExposure.team1.backExposure', 'EBA', lambda c: c['EBA']),
    ('lay exposure A', 'bookmakerExposure.team1.layExposure', 'ELA', lambda c: c['ELA']),
    ('net exposure A', 'bookmakerExposure.team1.netExposure', 'EBA - ELA', lambda c: c['EBA'] - c['ELA']),
    ('exposure summary identity A', 'bookmakerExposure.team1.netExposure', 'summary backExposure - summary layExposure', lambda c: c['summary_back'] - c['summary_lay']),
    ('total bets A', 'deepMetrics.totals.totalBetTeam1', 'raw A_back_expo + raw B_lay_stake', lambda c: c['raw_EBA'] + c['raw_LB']),
    ('total bets B', 'deepMetrics.totals.totalBetTeam2', 'raw B_back_expo + raw A_lay_stake', lambda c: c['raw_EBB'] + c['raw_LA']),
    ('simple P/L A', 'deepMetrics.simplePL.team1_win', 'raw A_lay_stake - raw A_back_expo', lambda c: c['raw_LA'] - c['raw_EBA']),
    ('simple P/L B', 'deepMetrics.simplePL.team2_win', 'raw B_lay_stake - raw B_back_expo', lambda c: c['raw_LB'] - c['raw_EBB']),
    ('derived P/L A', 'deepMetrics.derivedPL.team1_win', '(raw A_lay_stake - raw A_back_expo) - (raw B_lay_stake - raw B_back_expo)', lambda c: c['raw_LA'] - c['raw_EBA'] - c['raw_LB'] + c['raw_EBB']),
    ('derived P/L B', 'deepMetrics.derivedPL.team2_win', 'negative derived P/L A', lambda c: c['raw_LB'] - c['raw_EBB'] - c['raw_LA'] + c['raw_EBA']),
    ('support money A', 'supportMetrics.team1.supportMoney', 'B_A + L_B', lambda c: c['B_A'] + c['L_B']),
    ('support percentage A', 'supportMetrics.team1.support', '100 * (B_A + L_B) / (B_A + L_A + B_B + L_B)', lambda c: 100 * (c['B_A'] + c['L_B']) / (c['B_A'] + c['L_A'] + c['B_B'] + c['L_B'])),
    ('net support A', 'netSupport.teamA.netSupportValue', 'B_A + L_B - ELA', lambda c: c['B_A'] + c['L_B'] - c['ELA']),
    ('sentiment A', 'sentimentScore.teamA.sentimentScore', 'B_A - L_A + L_B - ELB', lambda c: c['B_A'] - c['L_A'] + c['L_B'] - c['ELB']),
    ('net volume support A', 'marketAnalysis.totalNetVolume.team1.totalBet', 'EBA + ELB', lambda c: c['EBA'] + c['ELB']),
    ('normal total bet P/L A', 'marketAnalysis.normalTotalBet.team1.profitLoss', '-EBA + ELA + B_B - L_B', lambda c: -c['EBA'] + c['ELA'] + c['B_B'] - c['L_B']),
    ('normal total bet P/L B', 'marketAnalysis.normalTotalBet.team2.profitLoss', '-EBB + ELB + B_A - L_A', lambda c: -c['EBB'] + c['ELB'] + c['B_A'] - c['L_A']),
    ('team P/L A', 'teams.{A}.pnlIfWins', '-EBA + ELA + B_B - L_B', lambda c: -c['EBA'] + c['ELA'] + c['B_B'] - c['L_B']),
    ('team P/L B', 'teams.{B}.pnlIfWins', '-EBB + ELB + B_A - L_A', lambda c: -c['EBB'] + c['ELB'] + c['B_A'] - c['L_A']),
]


def main():
    raw = SOURCE.read_bytes()
    rows = json.loads(raw)['records']
    results = [{ 'name': name, 'field': field, 'candidate': formula, 'eligible': 0,
                 'matching': 0, 'max_absolute_error': 0, 'mismatch_examples': [] }
               for name, field, formula, _ in FORMULAS]
    times = []
    coverage = {'two_team_snapshots': 0, 'valid_trade_ledgers': 0, 'empty_trade_ledgers': 0}
    for row in rows:
        snap = row.get('snapshot', {})
        if snap.get('serverTime'):
            times.append(snap['serverTime'])
        if len(snap.get('teamNames', [])) != 2:
            continue
        coverage['two_team_snapshots'] += 1
        a_name, b_name = snap['teamNames']
        ctx = {}
        # Validate inter-field identities even when a ledger is unavailable.
        for symbol, path in [('raw_EBA', 'deepMetrics.raw.A_back_expo'), ('raw_EBB', 'deepMetrics.raw.B_back_expo'),
                             ('raw_LA', 'deepMetrics.raw.A_lay_stake'), ('raw_LB', 'deepMetrics.raw.B_lay_stake'),
                             ('summary_back', 'bookmakerExposure.team1.backExposure'),
                             ('summary_lay', 'bookmakerExposure.team1.layExposure')]:
            try:
                ctx[symbol] = value(snap, path)
            except (KeyError, TypeError, ValueError):
                pass
        try:
            a_trades = snap['teams'][a_name]['trades']
            b_trades = snap['teams'][b_name]['trades']
            if not isinstance(a_trades, list) or not isinstance(b_trades, list):
                raise ValueError('Missing trade lists')
            a, b = stats(a_trades), stats(b_trades)
            ctx.update(B_A=a['back'], L_A=a['lay'], EBA=a['back_exposure'], ELA=a['lay_exposure'],
                       B_B=b['back'], L_B=b['lay'], EBB=b['back_exposure'], ELB=b['lay_exposure'])
            coverage['valid_trade_ledgers'] += 1
            if not a_trades and not b_trades:
                coverage['empty_trade_ledgers'] += 1
        except (KeyError, TypeError, ValueError):
            pass
        for result, (_, field, _, calculate) in zip(results, FORMULAS):
            try:
                if field.startswith('teams.{'):
                    name = a_name if '{A}' in field else b_name
                    actual = value(snap['teams'][name], 'pnlIfWins')
                else:
                    actual = value(snap, field)
                expected = calculate(ctx)
                if not math.isfinite(expected):
                    continue
            except (KeyError, TypeError, ValueError, ZeroDivisionError):
                continue
            result['eligible'] += 1
            error = abs(expected - actual)
            result['max_absolute_error'] = max(error, result['max_absolute_error'])
            if math.isclose(expected, actual, rel_tol=1e-8, abs_tol=0.02):
                result['matching'] += 1
            elif len(result['mismatch_examples']) < 3:
                result['mismatch_examples'].append({'matchId': row.get('matchId', snap.get('matchId')),
                                                    'actual': actual, 'expected': expected})
    output = {'source': str(SOURCE.relative_to(ROOT)), 'sha256': hashlib.sha256(raw).hexdigest(),
              'scope': 'Historical cricket snapshots retained by the local application. Not a capture of the live site or its source code.',
              'record_count': len(rows), 'snapshot_time_range': [min(times), max(times)],
              'tolerance': 'absolute 0.02 or relative 1e-8; money fields retain source units',
              'coverage': coverage, 'formulas': results}
    output['fully_matching_candidates'] = sum(r['eligible'] > 0 and r['matching'] == r['eligible'] for r in results)
    output['partially_matching_candidates'] = sum(0 < r['matching'] < r['eligible'] for r in results)
    OUTPUT.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({k: v for k, v in output.items() if k != 'formulas'}, indent=2))
    for result in results:
        print(f"{result['matching']}/{result['eligible']} {result['name']} (max error {result['max_absolute_error']:.6g})")


if __name__ == '__main__':
    main()
