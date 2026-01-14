const User = require('./models/User'); 

// middleware/randomReview.js
const Review  = require('./models/review');

// middleware/featuredStory.js
const Story = require('./models/story');

const Ad = require('./models/ad'); // <-- adjust if your file name is Ad.js or ad.js


module.exports.attachFeaturedStory = async (req, res, next) => {
  try {
    const [doc] = await Story.aggregate([
      { $match: { title: { $exists: true, $ne: '' } } },
      { $sample: { size: 1 } },
      { $project: { title: 1, slug: 1, summary: 1, body: 1, photos: { $slice: ['$photos', 1] } } }
    ]);
    res.locals.favStory = doc || null;
  } catch (e) {
    console.error('[attachFeaturedStory] failed:', e);
    res.locals.favStory = null;
  }
  next();
};


module.exports.attachRandomReview = async function attachRandomReview(req, res, next) {
  try {
    const [doc] = await Review.aggregate([
      { $match: { airline: { $exists: true, $ne: null } } }, // only reviews that link to an airline
      { $sample: { size: 1 } },
      {
        $lookup: {
          from: 'airlines',
          localField: 'airline',
          foreignField: '_id',
          as: 'airline'
        }
      },
      { $unwind: '$airline' }, // now safe to require an airline
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author'
        }
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          body: 1,
          rating: 1,
          createdAt: 1,
          'airline._id': 1,
          'airline.slug': 1,
          'airline.name': 1,
          'airline.airlineCode': 1,
          'author.displayName': 1
        }
      }
    ]);

    res.locals.favReview = doc || null;
    next();
  } catch (e) {
    console.error('[attachRandomReview] failed:', e);
    res.locals.favReview = null;
    next();
  }
};


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
               // console.log('User toDoList from DB:', user.toDoList);
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

// -----------------------------
// Helpers for Ad matching
// -----------------------------

function stripQuery(url = '') {
  return String(url).split('?')[0];
}

function normalizeUrl(url = '') {
  const u = stripQuery(String(url).trim());
  return u.endsWith('/') && u.length > 1 ? u.slice(0, -1) : u;
}

function pageMatches(adPages, req) {
  // If pages is blank, treat as "all pages"
  if (!adPages) return true;

  // Accept string (comma-separated) OR array
  const pagesArr = Array.isArray(adPages)
    ? adPages
    : String(adPages)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

  // If user put "*" anywhere -> all pages
  if (pagesArr.includes('*')) return true;

  // Compare against path + full URL variants
  const reqPath = normalizeUrl(req.baseUrl + req.path);       // "/country/Albania"
  const reqOrig = normalizeUrl(req.originalUrl);              // "/country/Albania?petType=Dog"
  const reqNoQ  = normalizeUrl(stripQuery(req.originalUrl));  // "/country/Albania"

  for (const raw of pagesArr) {
    const p = normalizeUrl(raw);

    // allow wildcard: "/country/*"
    if (p.endsWith('*')) {
      const prefix = normalizeUrl(p.slice(0, -1));
      if (reqPath.startsWith(prefix) || reqNoQ.startsWith(prefix)) return true;
      continue;
    }

    // allow a trailing slash entry to mean "startsWith"
    if (raw.endsWith('/')) {
      if (reqPath.startsWith(p) || reqNoQ.startsWith(p)) return true;
      continue;
    }

    // allow storing full URLs OR just paths
    if (p.startsWith('http')) {
      // match by path portion only
      // (so localhost vs prod doesn't break matching)
      try {
        const u = new URL(p);
        const pathOnly = normalizeUrl(u.pathname);
        if (reqPath === pathOnly || reqNoQ === pathOnly) return true;
      } catch (_) {}
    } else {
      // exact path match
      if (reqPath === p || reqNoQ === p || reqOrig === p) return true;
    }
  }

  return false;
}

module.exports.attachAds = async (req, res, next) => {
  try {
    // ✅ YOUR ADMIN USES "active" BOOLEAN
    const activeAds = await Ad.find({ active: true }).lean();

    // ✅ Filter ads that match this page
    const matching = activeAds.filter(ad => pageMatches(ad.pages, req));

    // ✅ Group by each placement in "placements" array (or fallback)
    const adsByPlacement = {};
    for (const ad of matching) {
      const placements = Array.isArray(ad.placements) && ad.placements.length
        ? ad.placements
        : (ad.placement ? [ad.placement] : []);

      for (const place of placements) {
        if (!place) continue;
        if (!adsByPlacement[place]) adsByPlacement[place] = [];
        adsByPlacement[place].push(ad);
      }
    }

    res.locals.adsByPlacement = adsByPlacement;

    res.locals.getAd = (placement) => {
      const list = adsByPlacement[placement] || [];
      if (!list.length) return null;
      return list[Math.floor(Math.random() * list.length)];
    };

    res.locals.getAds = (placement) => adsByPlacement[placement] || [];

    // ✅ temporary debug (remove after)
    // console.log('[attachAds]', req.originalUrl, Object.keys(adsByPlacement));

    next();
  } catch (e) {
    console.error('[attachAds] failed:', e);
    res.locals.adsByPlacement = {};
    res.locals.getAd = () => null;
    res.locals.getAds = () => [];
    next();
  }
};

