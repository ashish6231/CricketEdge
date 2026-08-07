const passport = require('passport');
const prisma = require('../db/prisma');
const { getApiPublicUrl } = require('../lib/publicUrl');

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) { done(err, null); }
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${getApiPublicUrl()}/api/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
      if (!user) {
        user = await prisma.user.findUnique({ where: { email: profile.emails[0].value } });
        if (user) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId: profile.id, authProvider: 'google', avatar: user.avatar || profile.photos[0]?.value || '' }
          });
        } else {
          user = await prisma.user.create({
            data: {
              googleId: profile.id, email: profile.emails[0].value,
              name: profile.displayName, avatar: profile.photos[0]?.value || '',
              authProvider: 'google', isVerified: true,
              subPlanSlug: 'free', subStatus: 'active'
            }
          });
        }
      }
      if (user.status === 'banned') return done(null, false, { message: 'Account banned' });
      if (user.status === 'suspended') return done(null, false, { message: 'Account suspended' });
      done(null, user);
    } catch (err) { done(err, null); }
  }));
} else {
  console.log('⚠️  Google OAuth not configured.');
}

module.exports = passport;
