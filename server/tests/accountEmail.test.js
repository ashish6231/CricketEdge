const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGmailEmail } = require('../shared/accountEmail.mjs');

test('requires an exact Gmail domain and a nonempty well-formed username', () => {
  for (const email of ["'@bhnnbvnmm", '@gmail.com', 'person@yahoo.com', 'person@gmail.com.evil',
    'person@sub.gmail.com', 'person@@gmail.com', 'first..last@gmail.com', '.person@gmail.com',
    'person.@gmail.com', 'two names@gmail.com', 'person@gmail.com\nextra', 'person@gmailXcom',
    null, undefined, 123, {}, ['person@gmail.com'], `${'a'.repeat(65)}@gmail.com`]) {
    assert.equal(normalizeGmailEmail(email), null, String(email));
  }
});

test('normalizes case and surrounding spaces while preserving dots and plus tags', () => {
  assert.equal(normalizeGmailEmail('  First.Last@GMAIL.COM  '), 'first.last@gmail.com');
  assert.equal(normalizeGmailEmail('first.last+cricedge@gmail.com'), 'first.last+cricedge@gmail.com');
});
