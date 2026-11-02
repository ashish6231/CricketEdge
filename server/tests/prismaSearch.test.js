const test = require('node:test');
const assert = require('node:assert/strict');
const { userSearchFilters } = require('../lib/prismaSearch');

test('MariaDB user search uses supported contains filters without Prisma mode', () => {
  const filters = userSearchFilters('  Test2Hyy  ');
  assert.deepEqual(filters, [
    { name: { contains: 'Test2Hyy' } },
    { email: { contains: 'Test2Hyy' } },
  ]);
  assert.equal(JSON.stringify(filters).includes('mode'), false);
  assert.deepEqual(userSearchFilters('   '), []);
});
