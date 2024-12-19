const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const router = express.Router();

// Determine the callback URL dynamically based on the environment
const callbackURL = process.env.NODE_ENV === 'production'
    ? "http://www.petvoyage.ai/google/callback"
    : "http://localhost:3000/google/callback";

// Configure Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.passportClientId,
    clientSecret: process.env.passportClientSecret,
    callbackURL: callbackURL,
    passReqToCallback: true,
}, async function (request, accessToken, refreshToken, profile, done) {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            console.log('User Found:', user);
            user.displayName = profile.displayName;
            user.email = profile.emails[0].value;
            await user.save();
        } else {
            console.log("Creating new user with ID:", profile.id);
            user = new User({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails[0].value
            });
            await user.save();
        }

        return done(null, user);
    } catch (err) {
        console.error("Error during authentication:", err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id).then(user => {
        done(null, user);
    });
});

// Route to initiate Google authentication
router.get('/google', (req, res, next) => {
    req.session.currentPage = req.headers.referer || req.originalUrl;
    console.log('Saving URL to session:', req.session.currentPage);

    req.session.save((err) => {
        if (err) {
            console.error('Error saving session before Google auth:', err);
            return res.redirect('/');
        }

        passport.authenticate('google', {
            scope: ['profile', 'email']
        })(req, res, next);
    });
});

// Callback route for Google to redirect to after authentication
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        console.log('User authenticated successfully:', req.user);

        const redirectUrl = req.session.currentPage || '/dashboard';
        delete req.session.currentPage;

        console.log('Redirecting to:', redirectUrl);
        res.redirect(redirectUrl);
    }
);

// Route to log out
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Route to render the login page
router.get('/login', (req, res) => {
    console.log(req.session.currentPage);
    res.render('login');
});

module.exports = router;
