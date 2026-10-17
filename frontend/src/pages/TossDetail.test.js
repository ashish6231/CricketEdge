import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('standalone and embedded toss sections settle the same ledger and refresh changed trades', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { TossSnapshotDetails } = await vite.ssrLoadModule('/src/pages/TossDetail.jsx')
    const snap = {
      teamNames: ['Alpha', 'Beta'], competitionName: 'World Championship of Legends T20',
      preMatchVolume: { team1: { back: 300, lay: 30 }, team2: { back: 100, lay: 1 } },
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
      assert.match(html, /World Legends Exposure &amp; Lay Toss Algorithm/)
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
  } finally {
    await vite.close()
  }
})
