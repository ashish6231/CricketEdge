// In-memory user store for fallback when MongoDB is unavailable

const users = [];

function findOne(query) {
  return Promise.resolve(users.find(u => {
    if (query.email) return u.email === query.email.toLowerCase();
    if (query.googleId) return u.googleId === query.googleId;
    if (query._id) return u._id === query._id;
    return false;
  }) || null);
}

function findById(id) {
  return Promise.resolve(users.find(u => u._id === id) || null);
}

async function create(data) {
  const user = {
    _id: 'user_' + Date.now(),
    ...data,
    status: 'active',
    preferences: { oddsFormat: 'decimal', language: 'en', notifications: { email: true, push: true } },
    createdAt: new Date(),
    updatedAt: new Date()
  };
  users.push(user);
  return user;
}

function deleteOne(query) {
  const idx = users.findIndex(u => u.email === query.email);
  if (idx > -1) users.splice(idx, 1);
  return Promise.resolve({ deletedCount: idx > -1 ? 1 : 0 });
}

// Seed — no demo users, only called if MongoDB unavailable
async function seedDemo() {
  // No seeded users — users register via /api/auth/register
}

module.exports = { findOne, findById, create, deleteOne, users, seedDemo };
