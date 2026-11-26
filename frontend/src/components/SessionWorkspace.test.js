import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeSessionMetrics } from '../utils/sessionMetrics.js'

test('session workspace shows complete outcome ranges, per-line settlement and neutral break-even', async (t) => {
  const root=fileURLToPath(new URL('../../',import.meta.url))
  // Keep parallel SSR tests and the active dev server on independent caches.
  const cacheDir=await mkdtemp(join(tmpdir(),'cricedge-vite-session-'))
  t.after(()=>rm(cacheDir,{recursive:true,force:true,maxRetries:10,retryDelay:100}))
  const vite=await createServer({root,cacheDir,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'})
  try {
    const {SessionWorkspace}=await vite.ssrLoadModule('/src/components/SessionWorkspace.jsx')
    const marketName='1st Innings 10 Overs Line'
    const trades=[
      {team:marketName,type:'yes',price:50.5,size:100},
      {team:marketName,type:'no',price:50.5,size:40},
      {team:marketName,type:'yes',price:52.5,size:80},
      {team:marketName,type:'no',price:54.5,size:200},
    ]
    const render=session=>renderToStaticMarkup(createElement(SessionWorkspace,{session}))
    const metrics=computeSessionMetrics({marketName,bestYes:50.5,bestNo:54.5},trades)
    const html=render(metrics)
    assert.match(html,/0–54.*?runs:.*?Bookie loss/)
    assert.match(html,/55\+.*?runs:.*?Bookie profit/)
    assert.match(html,/Line-wise bookie settlement/)
    assert.match(html,/Final session score/)
    assert.match(html,/BOOKIE LOSS/)
    assert.match(html,/>55\+<\/span>/)
    assert.match(html,/Position Sheet &amp; Line Check/)
    assert.match(html,/Bookie favors/)
    assert.match(html,/Bookie P\/L across run scores/)
    assert.doesNotMatch(html,/Expected runs|Session Pick|€-/)
    const invalid=render(computeSessionMetrics({marketName},[...trades,{...trades[0],size:-10}]))
    assert.match(invalid,/Invalid trade data/)
    assert.doesNotMatch(invalid,/Line-wise bookie settlement|BOOKIE PROFIT|BOOKIE LOSS/)
    const zero=render(computeSessionMetrics({marketName},[
      {team:marketName,type:'yes',price:50.5,size:100},
      {team:marketName,type:'no',price:50.5,size:100},
    ]))
    assert.match(zero,/BREAK EVEN/)
    assert.doesNotMatch(zero,/BOOKIE PROFIT|BOOKIE LOSS/)

    const { default: SessionPanel } = await vite.ssrLoadModule('/src/components/SessionPanel.jsx')
    const panelHtml = renderToStaticMarkup(createElement(SessionPanel, {
      t1: 'Dubai Capitals',
      t2: 'Desert Vipers',
      crexData: { scorecard: { tossText: 'Dubai Capitals won the toss and opted to bowl', team1: { name: 'Dubai Capitals', score: '45-1 5.0' }, team2: { name: 'Desert Vipers', score: '160-5 20.0' } } },
      odds: [
        { marketName: '1st Innings 6 Overs Line', bestYes: 48.5, bestNo: 49.5 },
        { marketName: '2nd Innings 6 Overs Line', bestYes: 51.5, bestNo: 52.5 },
      ],
      trades: [
        { team: '1st Innings 6 Overs Line', type: 'back', price: 48.5, size: 100 },
        { team: '2nd Innings 6 Overs Line', type: 'lay', price: 52.5, size: 75 },
      ],
    }))
    assert.match(panelHtml, /Team-wise Sessions/)
    assert.match(panelHtml, /Desert Vipers/)
    assert.match(panelHtml, /Dubai Capitals/)
    assert.match(panelHtml, /aria-selected="true"/)
    assert.match(panelHtml, /role="tabpanel"/)
  } finally { await vite.close() }
})
