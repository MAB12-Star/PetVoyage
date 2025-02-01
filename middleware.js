const User = require('./models/User'); 
module.exports.saveCurrentUrl = (req, res, next) => {
    console.log('saveCurrentUrl middleware is running');

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

module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
         // Log the return URL for debugging

        if (req.xhr) { // If the request is AJAX
            return res.status(401).json({ success: false, error: 'You need to log in to save favorites', redirect: '/login' });
        } else {
            req.flash('error', 'You need to log in to do that');
            return res.redirect('back');
        }
    }
    next();
};
// Redirect old airline links to the new format
module.exports.redirectOldAirlineLinks = (req, res, next) => {
    const airlineSlugRegex = /^\/airlines\/([a-zA-Z0-9-]+)$/; // Match old URL structure like /airlines/sunwing-airlines
    const match = req.url.match(airlineSlugRegex);

    if (match) {
        const slug = match[1]; // Extract the slug from the URL
        const updatedUrl = `/airlines/${slug}&Pet&Policy`; // Redirect to the updated URL format
        console.log(`Redirecting old URL to new format: ${req.url} -> ${updatedUrl}`); // Log for debugging
        return res.redirect(301, updatedUrl); // Use 301 (Permanent Redirect) for SEO purposes
    }

    next(); // If no match, proceed to the next middleware or route
};




module.exports.toDoListMiddleware = async (req, res, next) => {
    let toDoList = {
        "To-Do": [
            "Research your destination country's pet import requirements",
            "Get your pet's crate or carrier and start working on acclimation",
            "Schedule a visit to see your veterinarian",
            "Check airline or roadway routes",
            "Research pet-friendly hotels and services",
            "Get your pet's supplies",
            "Schedule a trip to the groomer",
        ],
        "in-progress": [],
        "completed": [],
    };

    let isAuthenticated = req.isAuthenticated(); // ✅ Store authentication status

    if (isAuthenticated) {
        try {
            const user = await User.findById(req.user._id);
            if (user && user.toDoList) {
                console.log('User toDoList from DB:', user.toDoList);
                toDoList = {
                    "To-Do": user.toDoList.get("To-Do") || [],
                    "in-progress": user.toDoList.get("in-progress") || [],
                    "completed": user.toDoList.get("completed") || [],
                };
            }
        } catch (error) {
            console.error('Error fetching user to-do list:', error);
        }
    }

    res.locals.toDoList = toDoList; 
    res.locals.isAuthenticated = isAuthenticated; // ✅ Now available in all templates
    next();
};


