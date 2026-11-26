import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('toss detail uses the MatchDetail layout and enforces all four exposure values before predicting', async (t) => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const cacheDir = await mkdtemp(join(tmpdir(), 'cricedge-vite-toss-'))
  t.after(() => rm(cacheDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const vite = await createServer({ root, cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { TossSnapshotDetails } = await vite.ssrLoadModule('/src/pages/TossDetail.jsx')
    const comparison = {
      teamNames: ['Alpha', 'Beta'],
      competitionName: 'Global T20 Canada',
      totalMatched: 11000,
      advancedMetrics: { team1: { back: 100, lay: 20 }, team2: { back: 60, lay: 40 } },
      teams: {
        Alpha: { trades: [{ type: 'back', price: 2, size: 100, updatedAt: 10 }, { type: 'lay', price: 2, size: 20, updatedAt: 11 }] },
        Beta: { trades: [{ type: 'back', price: 2, size: 60, updatedAt: 10 }, { type: 'lay', price: 2, size: 40, updatedAt: 11 }] },
      },
      runners: [{ name: 'Alpha', back: 1.98, backSize: 2000 }, { name: 'Beta', back: 2.04, backSize: 1000 }],
    }

    const detailHtml = renderToStaticMarkup(createElement(TossSnapshotDetails, { snap: comparison, isEmbedded: true }))
    assert.match(detailHtml, /Toss Load/)
    assert.match(detailHtml, /Market overview/)
    assert.match(detailHtml, /Period data/)
    assert.match(detailHtml, /Betfair Market Graphs/)
    assert.match(detailHtml, /Toss Market Graphs/)
    assert.match(detailHtml, /Price, Exchange Available and Traded/)
    assert.match(detailHtml, /Last price matched:/)
    assert.match(detailHtml, /Odds &amp; Volume/)
    assert.match(detailHtml, /Price &amp; Volume/)
    assert.match(detailHtml, /Price Ladder/)
    assert.match(detailHtml, /Bookie P\/L/)
    assert.match(detailHtml, /−€60\.00/)
    assert.match(detailHtml, /\+€60\.00/)

    const resulted = renderToStaticMarkup(createElement(TossSnapshotDetails, {
      snap: { ...comparison, serverTime: Date.now(), tossText: 'Toss Winner: Alpha (opt to Bowl)' },
      isEmbedded: false,
    }))
    assert.match(resulted, /Toss: Alpha/)
    assert.match(resulted, /Rule-selected team \(not the result\)/)
    assert.match(resulted, /<h2>Beta<\/h2>/)

    const highVolume = renderToStaticMarkup(createElement(TossSnapshotDetails, { snap: { ...comparison, totalMatched: 5000000 }, isEmbedded: true }))
    assert.match(highVolume, /<h2>Beta<\/h2>/)

    const snap = {
      teamNames: ['Alpha', 'Beta'],
      competitionName: 'World Championship of Legends T20',
      preMatchPnl: { team1: 999, team2: -999 },
      preMatchTotalBets: { team1: 100, team2: 300 },
      deepMetrics: { totals: { team1: 5678, team2: 1234 } },
      teams: {
        Alpha: { trades: [{ type: 'back', size: 100, price: 2 }, { type: 'lay', size: 20, price: 3 }] },
        Beta: { trades: [{ type: 'back', size: 50, price: 2.2 }, { type: 'lay', size: 10, price: 2 }] },
      },
    }
    const render = (isEmbedded = true) => renderToStaticMarkup(createElement(TossSnapshotDetails, { snap, isEmbedded }))
    const standalone = render(false), embedded = render(true)
    for (const html of [standalone, embedded]) {
      assert.match(html, /<h2>Beta<\/h2>/)
      assert.match(html, /5,678\.00/)
      assert.match(html, /1,234\.00/)
      assert.match(html, /−€20\.00/)
      assert.match(html, /\+€30\.00/)
    }
    assert.match(standalone, /match-detail-toolbar/)
    assert.doesNotMatch(embedded, /match-detail-toolbar/)

    for (const league of ['Womens International Twenty20 Matches', 'WBBL', 'One Day Internationals', 'Test Matches', "Women's T20 Spring Challenge", 'Caribbean Premier League', 'South Africa T20 Challenge']) {
      snap.competitionName = league
      assert.match(render(), /<h2>Beta<\/h2>/)
    }

    const completeTeams = structuredClone(snap.teams)
    snap.teams = structuredClone(completeTeams)
    snap.teams.Alpha.trades = []
    for (const isEmbedded of [false, true]) {
      const incomplete = render(isEmbedded)
      assert.doesNotMatch(incomplete, /match-v2-prediction/)
    }

    snap.teams = structuredClone(completeTeams)
    snap.teams.Beta.trades = structuredClone(snap.teams.Alpha.trades)
    assert.doesNotMatch(render(), /match-v2-prediction/)
    delete snap.teams.Alpha.trades
    assert.doesNotMatch(render(), /match-v2-prediction/)

    const { default: MarketWorkbench } = await vite.ssrLoadModule('/src/components/MarketWorkbench.jsx')
    const dualSourceSnap = {
      teamNames: ['Dubai Capitals', 'Desert Vipers'],
      competitionName: 'International League T20',
      inPlayPnl: { team1: -633.67, team2: 694.02 },
      teams: {
        'Dubai Capitals': { pnlIfWins: -633.67, trades: [{ type: 'back', size: 100, price: 2 }] },
        'Desert Vipers': { pnlIfWins: 694.02, trades: [] },
      },
    }
    const tossOverviewHtml = renderToStaticMarkup(createElement(MarketWorkbench, { snapshot: dualSourceSnap, isToss: true }))
    assert.match(tossOverviewHtml, /−€633\.67/)
    assert.match(tossOverviewHtml, /\+€694\.02/)

    const matchOverviewHtml = renderToStaticMarkup(createElement(MarketWorkbench, { snapshot: dualSourceSnap, isToss: false }))
    assert.match(matchOverviewHtml, /−€100\.00/)
    assert.doesNotMatch(matchOverviewHtml, /\+€100\.00/)
    assert.doesNotMatch(matchOverviewHtml, /\+€694\.02/)

    const matchSimplePlSnap = {
      ...dualSourceSnap,
      deepMetrics: { simplePL: { team1_win: -412.5, team2_win: 185.25 } },
    }
    const matchSimplePlHtml = renderToStaticMarkup(createElement(MarketWorkbench, { snapshot: matchSimplePlSnap, isToss: false }))
    assert.match(matchSimplePlHtml, /−€412\.50/)
    assert.match(matchSimplePlHtml, /\+€185\.25/)
    assert.match(matchOverviewHtml, /Match Market Graphs/)
    assert.match(matchOverviewHtml, /Price, Exchange Available and Traded/)
    assert.match(matchOverviewHtml, /Odds &amp; Volume/)
    assert.match(matchOverviewHtml, /Peak 2\.00/)
  } finally {
    await vite.close()
  }
})
