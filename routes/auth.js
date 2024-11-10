const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user');
const router = express.Router();


// Configure Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.passportClientId,
    //"923014366335-e9hatqrk3fu2mh5079tdsfca0kqn2558.apps.googleusercontent.com",
    clientSecret: process.env.passportClientSecret,
    //"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",
    callbackURL: "http://www.petvoyage.ai/google/callback",
    passReqToCallback: true,
}, async function (request, accessToken, refreshToken, profile, done) {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            console.log('User Found:', user);  // Fixed syntax for console.log
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

        return done(null, user);  // Corrected 'err' to 'user' in the callback
    } catch (err) {
        console.error("Error during authentication:", err);  // Fixed syntax
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
    // Save the current URL to session before starting Google authentication
    req.session.currentPage = req.headers.referer || req.originalUrl;
    console.log('Saving URL to session:', req.session.currentPage);

    // Explicitly save the session to persist `currentPage` before authentication
    req.session.save((err) => {
        if (err) {
            console.error('Error saving session before Google auth:', err);
            return res.redirect('/'); // Redirect to home or show an error page if saving fails
        }

        // Proceed to authenticate with Google after ensuring session is saved
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
        console.log("Session after auth:", req.session);
        console.log("Value of `req.session.currentPage`:", req.session.currentPage);

        // Use the saved URL from the session, fallback to dashboard if not found
        const redirectUrl = req.session.currentPage || '/dashboard';
        delete req.session.currentPage; // Clean up after redirect to avoid reusing it

        console.log('Redirecting to:', redirectUrl); // Log the redirect URL for debugging
        res.redirect(redirectUrl);
    }
);







// Route to Log Out
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Route to render the login page
router.get('/login', (req, res) => {

console.log(req.session.currentPage)
    res.render('login');  // Corrected 'sender' to 'render'
});

module.exports = router;
