module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
         // Log the return URL for debugging

        if (req.xhr) { // If the request is AJAX
            return res.status(401).json({ success: false, error: 'You need to log in to save favorites', redirect: '/login' });
        } else {
            req.flash('error', 'You need to log in to do that');
            return res.redirect('/login');
        }
    }
    next();
};

module.exports.saveCurrentUrl = (req, res, next) => {
    if (!req.isAuthenticated()) {
        const refererUrl = req.get('Referer'); // Get the referring page's URL
        req.session.currentPage = refererUrl // Save the referer URL or fallback to the original URL
        console.log('Saving URL to session:', req.session.currentPage); // Log for debugging purposes
    }
    next();
};

module.exports.thisIsTheURL = (req, res, next) => {
    if (req.session.currentPage) {
        req.redirectUrl = req.session.currentPage; // Set it to be used later in the callback
        console.log('Using saved URL for redirection:', req.redirectUrl);
    } else {
        console.error('No URL found in session');
    }
    next();
};



