const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const LocalStrategy = require('passport-local').Strategy;   // 👈 NEW
const bcrypt = require('bcrypt');                           // 👈 NEW
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
        const email = profile.emails?.[0]?.value?.toLowerCase() || null;

        let user = await User.findOne({
          $or: [
            { googleId: profile.id },
            ...(email ? [{ email }] : []),
          ],
        });

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            displayName: profile.displayName || 'New User',
            email,
          });
        } else {
          user.googleId = profile.id;
          user.displayName = profile.displayName || user.displayName;
          if (email) user.email = email;
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
   LOCAL STRATEGY (email/password)
========================= */

passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',      // we log in with email
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        email = (email || '').toLowerCase().trim();
        const user = await User.findOne({ email });

        if (!user || !user.passwordHash) {
          // Either no user OR only OAuth account with no password
          return done(null, false, { message: 'Invalid email or password.' });
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          return done(null, false, { message: 'Invalid email or password.' });
        }

        return done(null, user);
      } catch (err) {
        console.error('Local auth error:', err);
        return done(err);
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

// LOCAL LOGIN HANDLER
router.post(
  '/login',
  (req, res, next) => {
    // store redirect so LocalStrategy can also use it
    if (req.session && req.session.currentPage) {
      req.session.redirectUrl = req.session.currentPage;
    }
    next();
  },
  passport.authenticate('local', {
    failureRedirect: '/auth/login',
    failureFlash: true,
  }),
  (req, res) => {
    const redirectUrl = req.session.redirectUrl || '/dashboard';
    delete req.session.redirectUrl;
    delete req.session.currentPage;
    res.redirect(redirectUrl);
  }
);


// LOGOUT
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/');
  });
});

/* =========================
   LOCAL AUTH ROUTES
========================= */

// SIGNUP PAGE
router.get('/register', (req, res) => {
  res.render('register');      // we’ll create this view next
});

// SIGNUP HANDLER
router.post('/register', async (req, res, next) => {
  try {
    let { displayName, email, password, confirmPassword } = req.body;

    displayName = (displayName || '').trim();
    email = (email || '').toLowerCase().trim();

    if (!displayName || !email || !password || !confirmPassword) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/auth/register');
    }

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/auth/register');
    }

    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters.');
      return res.redirect('/auth/register');
    }

    // Does a user already exist with this email?
    const existing = await User.findOne({ email });
    if (existing) {
      // If they already have an account (Google/Facebook or local)
      req.flash('error', 'An account with that email already exists. Please log in.');
      return res.redirect('/auth/login');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      displayName,
      email,
      passwordHash,
      // role defaults to 'user'
    });

    // Log them in immediately
    req.login(user, (err) => {
      if (err) return next(err);
      const redirectUrl = req.session.redirectUrl || '/dashboard';
      delete req.session.redirectUrl;
      return res.redirect(redirectUrl);
    });
  } catch (err) {
    console.error('Register error:', err);
    req.flash('error', 'Unable to create account. Try again.');
    return res.redirect('/auth/register');
  }
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
  thisIsTheURL,
  passport.authenticate('facebook', { failureRedirect: '/auth/login' }),
  (req, res) => {
    const redirectUrl = req.redirectUrl || '/dashboard';
    delete req.session.currentPage;
    res.redirect(redirectUrl);
  }
);

module.exports = router;
