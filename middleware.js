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
// ✅ Redirect old &Pet&Policy URLs to the clean version
// module.exports.redirectOldAirlineLinks = (req, res, next) => {
//     const oldFormatRegex = /^\/airlines\/([^\/]+)&Pet&Policy$/;
//     const match = req.url.match(oldFormatRegex);
  
//     if (match) {
//       const slug = match[1];
//       const updatedUrl = `/airlines/${slug}`;
//       console.log(`Redirecting old URL to clean format: ${req.url} -> ${updatedUrl}`);
//       return res.redirect(301, updatedUrl);
//     }
  
//     next();
//   };
  
module.exports.redirectOldAirlineLinks = (req, res, next) => {
    const oldFormatRegex = /^\/airlines\/([^\/]+)&Pet&Policy$/;
    const match = req.url.match(oldFormatRegex);
  
    if (match) {
      const slug = match[1];
      const updatedUrl = `/airlines/${slug}`;
      res.set('X-Robots-Tag', 'noindex'); // 🚫 Tell Google not to index this redirect
      return res.redirect(301, updatedUrl);
    }
  
    next();
  };
  
// middleware/auth.js
module.exports.ensureAuth = function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  // Remember where they were going, then redirect to login
  req.session.currentPage = req.originalUrl || '/blog';
  return res.redirect('/login');
};

// middleware/index.js
module.exports.ensureAdmin = function ensureAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();

  // not an admin
  if (req.xhr) return res.status(403).json({ error: 'Admins only' });
  req.flash('error', 'Admins only.');
  return res.redirect('/');  // or res.status(403).render('403') if you prefer
};


module.exports.ensureOwner = function ensureOwner(getDoc) {
  return async (req, res, next) => {
    try {
      const doc = await getDoc(req);
      if (!doc) return res.status(404).send('Not found');

      const isOwner = doc.author && req.user && String(doc.author) === String(req.user._id);
      if (!isOwner) return res.status(403).send('Forbidden');

      req.storyDoc = doc;
      next();
    } catch (e) {
      // Gracefully handle invalid ObjectId or similar casting problems
      if (e && e.name === 'CastError') return res.status(404).send('Not found');
      console.error('[ensureOwner] err', e);
      return res.status(500).send('Server error');
    }
  };
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


