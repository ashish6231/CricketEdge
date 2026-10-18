import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('standalone and embedded toss views show risk-first predictions and confirmed zero-risk fallback', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { TossSnapshotDetails } = await vite.ssrLoadModule('/src/pages/TossDetail.jsx')
    const snap = {
      teamNames:['Alpha','Beta'], competitionName:'World Championship of Legends T20',
      preMatchPnl:{team1:999,team2:-999},preMatchTotalBets:{team1:100,team2:300},
      deepMetrics:{simplePL:{team1_win:999,team2_win:-888},totals:{team1:5678,team2:1234}},
      teams:{
        Alpha:{trades:[{type:'back',size:100,price:2},{type:'lay',size:20,price:3}]},
        Beta:{trades:[{type:'back',size:50,price:2.2},{type:'lay',size:10,price:2}]},
      },
    }
    const render = (isEmbedded=true) => renderToStaticMarkup(createElement(TossSnapshotDetails,{snap,isEmbedded}))
    const standalone=render(false),embedded=render(true)
    for (const html of [standalone,embedded]) {
      assert.match(html, /<h2 class="toss-winner-name">Beta<\/h2>/)
      assert.match(html, /Lower Back \+ Lay Risk Toss Algorithm/)
      assert.match(html, /Combined back \+ lay risk/)
      assert.match(html, /1\/1 condition favors Beta/)
      assert.match(html, /text-profit[^>]*>(?:<strong>)?\+€30(?:\.00)?/)
      assert.match(html, /text-loss[^>]*>(?:<strong>)?−€20(?:\.00)?/)
      assert.match(html, /€1\.23k/)
      assert.match(html, /€5\.68k/)
      assert.doesNotMatch(html, /World Legends Higher Activity|\+€999|−€888/)
    }
    const withoutNavigation = html => html.replace(/<button[^>]*class="toss-detail-back"[\s\S]*?<\/button>/, '').replace(' detail-page','')
    assert.equal(withoutNavigation(standalone),withoutNavigation(embedded))
    for (const league of ['Womens International Twenty20 Matches',"Women's T20 Spring Challenge",'Caribbean Premier League']) {
      snap.competitionName=league
      assert.match(render(), /<h2 class="toss-winner-name">Beta<\/h2>/)
    }
    // South Africa also uses risk first despite its higher-provider fallback.
    snap.competitionName='South Africa T20 Challenge'
    assert.match(render(), /<h2 class="toss-winner-name">Beta<\/h2>/)
    // Confirmed zero risk enables the league's previous rule.
    snap.teams.Alpha.trades=[]
    snap.deepMetrics.totals={team1:100,team2:300}
    const southAfrica=render()
    assert.match(southAfrica, /<h2 class="toss-winner-name">Beta<\/h2>/)
    assert.match(southAfrica, /1\/1 condition favors Beta/)
    const evidence=southAfrica.match(/<section class="toss-market-evidence"[\s\S]*?<\/section>/)[0]
    assert.match(evidence, /Higher total required/)
    assert.match(evidence, /Fallback active/)
    assert.doesNotMatch(evidence, /Must be greater than zero|Current P\/L/)
    snap.competitionName='Caribbean Premier League'
    assert.match(render(), /<h2 class="toss-winner-name">Alpha<\/h2>/)
    assert.match(render(), /2\/2 conditions favor Alpha/)
    snap.deepMetrics.totals={team1:300,team2:100}
    const conflict=render()
    assert.doesNotMatch(conflict,/class="toss-winner-name"/)
    assert.match(conflict,/No pick: both fallback conditions must agree/)
    delete snap.teams.Alpha.trades
    const missing=render()
    assert.doesNotMatch(missing,/class="toss-winner-name"/)
    assert.match(missing,/Prediction evidence/)
    assert.doesNotMatch(missing,/\+€999|−€888/)
  } finally { await vite.close() }
})
