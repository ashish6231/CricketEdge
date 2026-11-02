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

test('standalone and embedded toss views require all four exposure values before predicting', async (t) => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  // SSR tests must not replace the running development server's dependency cache.
  const cacheDir = await mkdtemp(join(tmpdir(), 'cricedge-vite-toss-'))
  t.after(() => rm(cacheDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const vite = await createServer({ root, cacheDir, configFile:false, plugins:[react()], optimizeDeps:{noDiscovery:true,include:[]}, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { TossSnapshotDetails } = await vite.ssrLoadModule('/src/pages/TossDetail.jsx')
    const {default:TossMarketCard}=await vite.ssrLoadModule('/src/components/TossMarketCard.jsx')
    const comparison={teamNames:['Alpha','Beta'],competitionName:'Global T20 Canada',totalMatched:11000,
      advancedMetrics:{team1:{back:100,lay:20},team2:{back:60,lay:40}},
      teams:{Alpha:{trades:[{type:'back',price:2,size:100,updatedAt:10},{type:'lay',price:2,size:20,updatedAt:11}]},
        Beta:{trades:[{type:'back',price:2,size:60,updatedAt:10},{type:'lay',price:2,size:40,updatedAt:11}]}},
      runners:[{name:'Alpha',back:1.98,backSize:2000},{name:'Beta',back:2.04,backSize:1000}]}
    const cardHtml=renderToStaticMarkup(createElement(TossMarketCard,{match:{matchId:'same-snapshot',matchName:'Alpha v Beta',snapshot:comparison}}))
    const detailHtml=renderToStaticMarkup(createElement(TossSnapshotDetails,{snap:comparison,isEmbedded:true}))
    for(const html of [cardHtml,detailHtml]) {
      assert.match(html,/Alpha odds[^>]*>1\.98/)
      assert.match(html,/Beta odds[^>]*>2\.04/)
      assert.match(html,/Total matched[\s\S]*?€11K/)
      assert.match(html,/€120\.00/)
      assert.match(html,/€100\.00/)
    }
    const resulted=renderToStaticMarkup(createElement(TossSnapshotDetails,{snap:{...comparison,
      serverTime:Date.now(),tossText:'Toss Winner: Alpha (opt to Bowl)'},isEmbedded:true}))
    assert.match(resulted,/Reported toss winner: Alpha/)
    assert.match(resulted,/Rule-selected team \(not the result\)/)
    assert.match(resulted,/<h2 class="toss-winner-name">Beta<\/h2>/)
    assert.doesNotMatch(resulted,/Predicted toss winner/)
    assert.match(resulted,/Latest recorded trade/)
    const highVolume=renderToStaticMarkup(createElement(TossSnapshotDetails,{snap:{...comparison,totalMatched:5000000},isEmbedded:true}))
    assert.match(highVolume,/<h2 class="toss-winner-name">Beta<\/h2>/)
    assert.doesNotMatch(highVolume,/Volume [Rr]eversal|reversal applied|Final rule pick/)
    assert.match(highVolume,/Bookie P\/L/)
    assert.match(highVolume,/−€80\.00/)
    assert.match(highVolume,/−€20\.00/)
    const snap = {
      teamNames:['Alpha','Beta'], competitionName:'World Championship of Legends T20',
      preMatchPnl:{team1:999,team2:-999},preMatchTotalBets:{team1:100,team2:300},
      deepMetrics:{totals:{team1:5678,team2:1234}},
      teams:{
        Alpha:{trades:[{type:'back',size:100,price:2},{type:'lay',size:20,price:3}]},
        Beta:{trades:[{type:'back',size:50,price:2.2},{type:'lay',size:10,price:2}]},
      },
    }
    const render = (isEmbedded=true) => renderToStaticMarkup(createElement(TossSnapshotDetails,{snap,isEmbedded}))
    const standalone=render(false),embedded=render(true)
    for (const html of [standalone,embedded]) {
      assert.match(html, /<h2 class="toss-winner-name">Beta<\/h2>/)
      assert.match(html, /Lower Net Exposure Toss Algorithm/)
      assert.match(html, /Net exposure \(Back − Lay\)/)
      assert.match(html, /1\/1 condition favors Beta/)
      assert.match(html, /text-loss[^>]*>(?:<strong>)?−€80(?:\.00)?/)
      assert.match(html, /text-loss[^>]*>(?:<strong>)?−€50(?:\.00)?/)
      assert.match(html, /P\/L = Lay stake − Back exposure/)
      assert.match(html, /€1,234\.00/)
      assert.match(html, /€5,678\.00/)
      assert.doesNotMatch(html, /World Legends Higher Activity|\+€999|−€888/)
    }
    const withoutNavigation = html => html.replace(/<button[^>]*class="toss-detail-back"[\s\S]*?<\/button>/, '').replace(' detail-page','')
    assert.equal(withoutNavigation(standalone),withoutNavigation(embedded))
    for (const league of ['Womens International Twenty20 Matches','WBBL','One Day Internationals','Test Matches']) {
      snap.competitionName=league
      const html=render()
      assert.match(html, /<h2 class="toss-winner-name">Alpha<\/h2>/)
      assert.match(html, /Higher Net Exposure Toss Algorithm/)
      assert.match(html, /Higher net exposure wins/)
      assert.match(html, /higher net exposure/)
    }
    for (const league of ["Women's T20 Spring Challenge",'Caribbean Premier League','South Africa T20 Challenge']) {
      snap.competitionName=league
      assert.match(render(), /<h2 class="toss-winner-name">Beta<\/h2>/)
      assert.match(render(), /Lower net exposure wins/)
    }
    const originalNames=snap.teamNames
    const originalTeams=snap.teams
    snap.teamNames=['Brampton Blazers','Mississauga Skyhawks']
    snap.competitionName='Global T20 Canada'
    snap.teams={
      'Brampton Blazers':{trades:[{type:'back',price:2,size:59311.35},{type:'lay',price:2,size:2658149.95}]},
      'Mississauga Skyhawks':{trades:[{type:'back',price:2,size:2703616.48},{type:'lay',price:2,size:12774.31}]},
    }
    for (const isEmbedded of [false,true]) {
      const global=render(isEmbedded)
      assert.match(global,/<h2 class="toss-winner-name">Brampton Blazers<\/h2>/)
      assert.match(global,/Brampton Blazers has the lower net exposure/)
      assert.match(global,/class="is-selected">−€25,98,838\.60/)
      assert.match(global,/\+€26,90,842\.17/)
      assert.doesNotMatch(global,/combined exposure/)
    }
    snap.teamNames=originalNames
    snap.teams=originalTeams
    const completeTeams=structuredClone(snap.teams)
    for (const league of ['WBBL','WODI','Caribbean Premier League']) {
      snap.competitionName=league
      for (const name of ['Alpha','Beta']) {
        for (const type of ['back','lay']) {
          snap.teams=structuredClone(completeTeams)
          snap.teams[name].trades.find(trade => trade.type===type).size=0
          for (const isEmbedded of [false,true]) {
            const incomplete=render(isEmbedded)
            assert.match(incomplete,/Toss prediction unavailable/)
            assert.match(incomplete,/Prediction data is incomplete, can&#x27;t predict\./)
            assert.doesNotMatch(incomplete,/class="toss-winner-name"|condition favors/)
          }
        }
      }
    }
    snap.teams=structuredClone(completeTeams)
    snap.teams.Beta.trades=structuredClone(snap.teams.Alpha.trades)
    const tied=render()
    assert.doesNotMatch(tied,/class="toss-winner-name"/)
    assert.match(tied,/No pick: net exposure is equal/)
    assert.doesNotMatch(tied,/Prediction data is incomplete/)
    delete snap.teams.Alpha.trades
    const missing=render()
    assert.doesNotMatch(missing,/class="toss-winner-name"/)
    assert.match(missing,/Prediction evidence/)
    assert.match(missing,/Prediction data is incomplete, can&#x27;t predict\./)
    assert.doesNotMatch(missing,/\+€999|−€888/)
  } finally { await vite.close() }
})
