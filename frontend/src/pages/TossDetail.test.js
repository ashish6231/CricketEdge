import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'

test('standalone and embedded toss sections settle the same ledger and refresh changed trades', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { TossSnapshotDetails } = await vite.ssrLoadModule('/src/pages/TossDetail.jsx')
    const snap = {
      teamNames: ['Alpha', 'Beta'], competitionName: 'World Championship of Legends T20',
      preMatchVolume: { team1: { back: 300, lay: 30 }, team2: { back: 100, lay: 1 } },
      preMatchTotalBets: { team1: 300, team2: 100 },
      preMatchPnl: { team1: -200, team2: 250 },
      bookmakerExposure: { team1: { netExposure: 200 }, team2: { netExposure: 80 } },
      deepMetrics: { simplePL: { team1_win: 999, team2_win: -888 } },
      advancedMetrics: { team1: { back: 100, lay: 20 }, team2: { back: 50, lay: 10 } },
      teams: {
        Alpha: { trades: [{ type: 'back', size: 100, price: 2 }, { type: 'lay', size: 20, price: 3 }] },
        Beta: { trades: [{ type: 'back', size: 50, price: 2.2 }, { type: 'lay', size: 10, price: 2 }] },
      },
    }
    const render = isEmbedded => renderToStaticMarkup(createElement(TossSnapshotDetails, { snap, isEmbedded }))
    const standalone = render(false), embedded = render(true)
    for (const html of [standalone, embedded]) {
      assert.match(html, /Per-odds Trades/)
      assert.match(html, /−€20/)
      assert.match(html, /\+€30/)
      assert.match(html, /\+€60/)
      assert.match(html, /World Legends Support &amp; Activity Toss Algorithm/)
      assert.doesNotMatch(html, /\+€999|−€888/)
    }
    const withoutNavigation = html => html.replace(/<button[^>]*class="toss-detail-back"[\s\S]*?<\/button>/, '')
      .replace(' detail-page', '').replace('space-y-4 "', 'space-y-4"')
    assert.equal(withoutNavigation(standalone), withoutNavigation(embedded))

    snap.teams.Alpha.trades[0].size = 200
    assert.match(render(true), /−€120/)
    assert.match(render(true), /\+€130/)
    delete snap.teams.Alpha.trades
    const missingLedger = render(true)
    assert.match(missingLedger, /Unavailable/)
    assert.doesNotMatch(missingLedger, /\+€999|−€888/)

    const audit = JSON.parse(fs.readFileSync(new URL('../../../reports/legends-toss-analysis/re-evaluation/inputs.json', import.meta.url), 'utf8'))
    const failure = audit.rows.find(row => row.matchId === '36194408')
    const revised = renderToStaticMarkup(createElement(TossSnapshotDetails, {
      snap: { ...failure.snapshot, competitionName: failure.competitionName }, isEmbedded: true,
    }))
    assert.match(revised, /<h2 class="toss-winner-name">Australia Legends<\/h2>/)
    assert.match(revised, /1\.34x back lead is below 3x/)
    assert.match(revised, /Unvalidated/)
    assert.doesNotMatch(revised, /Medium Risk|🟡<\/span><span>Medium<\/span>/)
    const evidence = revised.match(/<section class="toss-market-evidence"[\s\S]*?<\/section>/)?.[0]
    assert.ok(evidence, 'Legends toss evidence is always rendered')
    assert.doesNotMatch(evidence, /<details|<summary/)
    assert.match(evidence, /2\/2 core signals favor Australia Legends/)
    assert.match(evidence, /Corrected support[\s\S]*?<td>53%<\/td><td>47%<\/td>/)
    assert.match(evidence, /Pre-match activity[\s\S]*?<td>53%<\/td><td>47%<\/td>/)
    assert.match(evidence, /Pressure \(−€55\.98\)/)
    assert.match(evidence, /Net exposure[\s\S]*?\+€578\.34[\s\S]*?\+€499\.67/)
    assert.match(evidence, /Lay\/back ratio[\s\S]*?14\.29%[\s\S]*?2\.02%/)
    assert.match(evidence, /Back lead[\s\S]*?1\.34×[\s\S]*?0\.75×/)

    // Match consensus and the matched-money headline must not supply toss evidence.
    const changedToss = { ...structuredClone(failure.snapshot), competitionName: failure.competitionName,
      preMatchTotalBets: { team1: 100, team2: 300 },
      marketEvidence: { support: { pct1: 99, pct2: 1 } } }
    const changedHtml = renderToStaticMarkup(createElement(TossSnapshotDetails, { snap: changedToss, isEmbedded: true }))
    const changedEvidence = changedHtml.match(/<section class="toss-market-evidence"[\s\S]*?<\/section>/)[0]
    assert.match(changedEvidence, /Pre-match activity[\s\S]*?<td>25%<\/td><td>75%<\/td>/)
    assert.match(changedEvidence, /Core signals disagree/)
    assert.match(changedEvidence, /No toss pick/)
    assert.doesNotMatch(changedHtml, /Toss Winner Prediction/)
    assert.doesNotMatch(changedEvidence, /99%/)

    delete changedToss.preMatchPnl
    delete changedToss.preMatchTotalBets
    const abstained = renderToStaticMarkup(createElement(TossSnapshotDetails, { snap: changedToss, isEmbedded: false }))
    const missingEvidence = abstained.match(/<section class="toss-market-evidence"[\s\S]*?<\/section>/)?.[0]
    assert.ok(missingEvidence, 'Evidence stays visible when the toss algorithm abstains')
    assert.match(missingEvidence, /Pre-match activity[\s\S]*?<td>—<\/td><td>—<\/td>/)
    assert.match(missingEvidence, /No toss pick/)

    const otherLeague = renderToStaticMarkup(createElement(TossSnapshotDetails, {
      snap: { ...failure.snapshot, competitionName: 'Caribbean Premier League' }, isEmbedded: true,
    }))
    assert.doesNotMatch(otherLeague, /class="toss-market-evidence"/)

    const withoutContext = structuredClone(failure.snapshot)
    withoutContext.competitionName = failure.competitionName
    delete withoutContext.preMatchPnl
    delete withoutContext.bookmakerExposure
    const withoutContextHtml = renderToStaticMarkup(createElement(TossSnapshotDetails, { snap: withoutContext, isEmbedded: true }))
    assert.match(withoutContextHtml, /World Legends Support &amp; Activity Toss Algorithm/)
    assert.match(withoutContextHtml, /<h2 class="toss-winner-name">Australia Legends<\/h2>/)
    assert.doesNotMatch(withoutContextHtml, /back lead below/)
  } finally {
    await vite.close()
  }
})
