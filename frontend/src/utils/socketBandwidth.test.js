import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { applyFeedDelta } from './feedDelta.js'
import { isCompleteMatchBundle } from './matchBundle.js'

function browser(hidden = false) {
  const handlers = new Map(), documentHandlers = new Map()
  const document = { hidden, addEventListener: (event, fn) => documentHandlers.set(event, fn) }
  const socket = {
    connected: false, sent: [], connectCalls: 0, disconnectCalls: 0,
    io: {},
    on(event, fn) { handlers.set(event, [...(handlers.get(event) || []), fn]); return this },
    listeners(event) { return handlers.get(event) || [] },
    emit(event, data) { this.sent.push({ event, data }); return this },
    receive(event, data) { for (const fn of this.listeners(event)) fn(data) },
    connect() { this.connectCalls++; return this },
    disconnect() { this.disconnectCalls++; this.connected = false; this.receive('disconnect'); return this },
  }
  const storage = { getItem: () => null, setItem() {} }
  const source = readFileSync(new URL('../socket.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '').replaceAll('import.meta.env', 'env')
  const context = { env: { DEV: false }, document,
    window: { location: { origin: 'https://offline.test' }, dispatchEvent() {} },
    localStorage: storage, sessionStorage: storage, CustomEvent: class {},
    applyFeedDelta, isCompleteMatchBundle,
    io: (_url, options) => { socket.auth = options.auth; socket.options = options; return socket },
  }
  vm.runInNewContext(`${source}\nthis.api = {getSocket, subscribeMatch, unsubscribeMatch, requestCricketFeed, releaseFeed, updateSocketAuth};`, context)
  const api = context.api
  api.getSocket()
  return { api, socket, document, visibility: () => documentHandlers.get('visibilitychange')() }
}

test('initial connect, reconnect and tab resume restore exactly the currently active subscriptions', () => {
  const { api, socket, document, visibility } = browser()
  api.subscribeMatch('one')
  api.requestCricketFeed()
  assert.equal(socket.sent.length, 0)
  socket.connected = true
  socket.receive('connect')
  assert.deepEqual(socket.sent.map(event => event.event), ['feed:cricket', 'match:subscribe'])
  api.subscribeMatch('one')
  api.requestCricketFeed()
  assert.equal(socket.sent.length, 2)
  document.hidden = true
  visibility()
  assert.equal(socket.disconnectCalls, 1)
  api.unsubscribeMatch('one')
  document.hidden = false
  visibility()
  socket.connected = true
  socket.receive('connect')
  assert.equal(socket.sent.at(-1).event, 'feed:cricket')
  assert.equal(socket.sent.filter(event => event.event === 'match:subscribe').length, 1)
  api.releaseFeed('cricket')
  socket.disconnect()
  const count = socket.sent.length
  socket.connected = true
  socket.receive('connect')
  assert.equal(socket.sent.length, count)
})

test('delta delivery updates existing listeners locally and missing baselines request resync', () => {
  const { api, socket } = browser()
  socket.connected = true
  api.requestCricketFeed()
  const seen = []
  socket.on('cricket:matches', payload => seen.push(payload))
  socket.receive('cricket:matches', { matches: [{ matchId: 'one', price: 2 }], version: 1 })
  const count = socket.sent.length
  socket.receive('feed:delta', { feed: 'cricket', baseVersion: 1, version: 2, changed: [{ matchId: 'one', price: 1.5 }], removed: [] })
  assert.equal(seen.at(-1).matches[0].price, 1.5)
  assert.equal(socket.sent.length, count)
  socket.receive('feed:delta', { feed: 'cricket', baseVersion: 9, version: 10, changed: [], removed: [] })
  assert.equal(socket.sent.at(-1).event, 'feed:cricket')
  assert.equal(socket.sent.at(-1).data.force, true)
})

test('hidden initial tabs do not auto-connect; auth updates retain protocol capabilities', () => {
  const { api, socket, document, visibility } = browser(true)
  assert.equal(socket.options.autoConnect, false)
  api.updateSocketAuth('new-token')
  assert.equal(socket.connectCalls, 0)
  assert.equal(socket.auth.feedDeltas, true)
  document.hidden = false
  visibility()
  assert.equal(socket.connectCalls, 1)
})
