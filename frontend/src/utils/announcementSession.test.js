import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowAnnouncement, markAnnouncementShown } from './announcementSession.js'

const session = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('announcement appears on a fresh visit and stays hidden after refresh, even before dismissal', () => {
  const storage = session()
  assert.equal(shouldShowAnnouncement(storage), true)
  markAnnouncementShown(storage)
  assert.equal(shouldShowAnnouncement(storage), false)
  assert.equal(shouldShowAnnouncement(storage), false)
  assert.equal(shouldShowAnnouncement(session()), true)
})

test('blocked session storage does not crash the announcement', () => {
  const storage = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  assert.equal(shouldShowAnnouncement(storage), true)
  assert.doesNotThrow(() => markAnnouncementShown(storage))
})

test('completed-only notice has its own visit state and does not repeat on refresh', () => {
  const storage = session()
  markAnnouncementShown(storage)
  assert.equal(shouldShowAnnouncement(storage, 'access'), true)
  markAnnouncementShown(storage, 'access')
  assert.equal(shouldShowAnnouncement(storage, 'access'), false)
  assert.equal(shouldShowAnnouncement(session(), 'access'), true)
})
