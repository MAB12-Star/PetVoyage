const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const router = express.Router();
const { saveCurrentUrl, thisIsTheURL } = require('../middleware');

console.log('FACEBOOK_APP_ID FROM ENV =', process.env.FACEBOOK_APP_ID);

const isProd = process.env.NODE_ENV === 'production';

/* =========================
   CALLBACK URLS
========================= */

const googleCallbackURL =
  process.env.GOOGLE_CALLBACK_URL ||
  (isProd
    ? 'https://www.petvoyage.ai/auth/google/callback'
    : 'http://localhost:3000/auth/google/callback');

const facebookCallbackURL =
  process.env.FACEBOOK_CALLBACK_URL ||
  (isProd
    ? 'https://www.petvoyage.ai/auth/facebook/callback'
    : 'http://localhost:3000/auth/facebook/callback');

/* =========================
   GOOGLE STRATEGY
========================= */

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.passportClientId,
      clientSecret: process.env.passportClientSecret,
      callbackURL: googleCallbackURL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            displayName: profile.displayName,
            email: profile.emails?.[0]?.value,
          });
        } else {
          user.displayName = profile.displayName;
          user.email = profile.emails?.[0]?.value;
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        console.error('Google auth error:', err);
        return done(err, null);
      }
    }
  )
);

/* =========================
   FACEBOOK STRATEGY
========================= */

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: facebookCallbackURL,
      profileFields: ['id', 'displayName', 'emails', 'name'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;

        let user = await User.findOne({
          $or: [
            { facebookId: profile.id },
            ...(email ? [{ email }] : []),
          ],
        });

        if (!user) {
          user = await User.create({
            facebookId: profile.id,
            displayName: profile.displayName,
            email,
          });
        } else {
          user.facebookId = profile.id;
          user.displayName = profile.displayName || user.displayName;
          if (email) user.email = email;
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        console.error('Facebook auth error:', err);
        return done(err, null);
      }
    }
  )
);

/* =========================
   SERIALIZE / DESERIALIZE
========================= */

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id).then(user => done(null, user));
});

/* =========================
   AUTH ROUTES
========================= */

// LOGIN PAGE
router.get('/login', saveCurrentUrl, (req, res) => {
  res.render('login');
});

// LOGOUT
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/');
  });
});

/* ===== GOOGLE ===== */

router.get('/google', (req, res, next) => {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })(req, res, next);
});

router.get(
  '/google/callback',
  thisIsTheURL,
  passport.authenticate('google', { failureRedirect: '/auth/login' }),
  (req, res) => {
    const redirectUrl = req.redirectUrl || '/dashboard';
    delete req.session.currentPage;
    res.redirect(redirectUrl);
  }
);

/* ===== FACEBOOK ===== */

router.get('/facebook', (req, res, next) => {
  passport.authenticate('facebook', {
    scope: ['email'],
    authType: 'rerequest',
  })(req, res, next);
});

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/auth/login' }),
  (req, res) => {
    const redirectUrl = req.redirectUrl || '/dashboard';
    delete req.session.currentPage;
    res.redirect(redirectUrl);
  }
);

module.exports = router;
