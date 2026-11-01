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

test('green toss cards show matched volume instead of exposure and refresh from new feed props',async t=>{
  const root=fileURLToPath(new URL('../../',import.meta.url))
  const cacheDir=await mkdtemp(join(tmpdir(),'cricedge-toss-cards-'))
  t.after(()=>rm(cacheDir,{recursive:true,force:true}))
  const vite=await createServer({root,cacheDir,configFile:false,plugins:[react()],optimizeDeps:{noDiscovery:true,include:[]},
    server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'})
  try {
    const {default:Card}=await vite.ssrLoadModule('/src/components/TossMarketCard.jsx')
    const match={matchId:'test',matchName:'New Zealand v India',competitionName:'International Twenty20 Matches',tossLoad:{
      totalMatched:11000,available:true,
      team1:{name:'New Zealand',odds:1.98,liquidity:3000000,money:4800.50,netExposure:-24919.34},
      team2:{name:'India',odds:1.98,liquidity:3000000,money:6199.50,netExposure:25711.24},
    }}
    const render=()=>renderToStaticMarkup(createElement(Card,{match,isLive:true,startLabel:'12:30 (1 Nov)'}))
    const html=render()
    assert.match(html,/Which Team Will Win The Toss/);assert.match(html,/€11K/)
    assert.match(html,/New Zealand odds[^>]*>1\.98/);assert.match(html,/India available liquidity[^>]*>3M/)
    assert.match(html,/New Zealand matched money[^>]*>€4,800\.50/)
    assert.match(html,/India matched money[^>]*>€6,199\.50/)
    assert.match(html,/Matched volume/)
    assert.doesNotMatch(html,/exposure|24,919|25,711|is-negative|is-positive/)
    assert.doesNotMatch(html,/50%|support/)
    match.tossLoad.team1.odds=2.04;match.tossLoad.team1.money=5100.25
    assert.match(render(),/New Zealand odds[^>]*>2\.04/);assert.match(render(),/€5,100\.25/)
    delete match.tossLoad
    const empty=render()
    assert.match(empty,/Waiting for market data/);assert.doesNotMatch(empty,/€0\.00|50%/)
  } finally {await vite.close()}
})
