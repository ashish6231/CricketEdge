import test from 'node:test'
import assert from 'node:assert/strict'
import config from './vite.config.js'

test('development and test API and websocket proxies follow the configured backend URL', () => {
  for (const mode of ['development','test','production']) {
    const expected = mode === 'production' ? 'https://api.cricedge.in' : 'http://localhost:5001'
    const resolved = config({ mode })
    assert.equal(resolved.server.proxy['/api'].target,expected,mode)
    assert.equal(resolved.server.proxy['/socket.io'].target,expected,mode)
    assert.equal(resolved.server.proxy['/socket.io'].ws,true)
  }
})
