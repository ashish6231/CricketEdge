import test from 'node:test'
import assert from 'node:assert/strict'
import { feedsForPath, formatAge, getDelayNotice } from './feedHealth.js'

const health = feeds => ({ success: true, feeds })

test('each live page watches only its own feed', () => {
  assert.deepEqual(feedsForPath('/tennis'), ['tennis'])
  assert.deepEqual(feedsForPath('/tennis/match/123'), ['tennis'])
  assert.deepEqual(feedsForPath('/cricket/match/9'), ['cricket'])
  assert.deepEqual(feedsForPath('/toss'), ['toss'])
  assert.deepEqual(feedsForPath('/session/match/1'), ['session'])
  assert.deepEqual(feedsForPath('/tennisx'), [])
  assert.deepEqual(feedsForPath('/profile'), [])
})

test('a notice appears only when the page feed is stale', () => {
  const data = health({ tennis: { stale: true, ageMs: 25 * 60000 }, cricket: { stale: false, ageMs: 1000 } })
  assert.match(getDelayNotice(data, '/tennis'), /25 min ago/)
  assert.equal(getDelayNotice(data, '/cricket'), null)
  assert.equal(getDelayNotice(data, '/profile'), null)
  assert.equal(getDelayNotice(null, '/tennis'), null)
  assert.match(getDelayNotice(health({ tennis: { stale: true, ageMs: null } }), '/tennis'), /^Live data is delayed\./)
})

test('ages read naturally', () => {
  assert.equal(formatAge(30000), 'less than a minute')
  assert.equal(formatAge(5 * 60000), '5 min')
  assert.equal(formatAge(60 * 60000), '1 hr')
  assert.equal(formatAge(135 * 60000), '2 hrs 15 min')
  assert.equal(formatAge(null), null)
})
