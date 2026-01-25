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
// middleware/auth.js
module.exports.ensureAuth = function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();

  // If SSE or AJAX, return status instead of redirect (prevents opaque "Stream error")
  const wantsJson = req.xhr || (req.headers.accept || "").includes("application/json");
  const isSSE = (req.headers.accept || "").includes("text/event-stream");

  req.session.currentPage = req.originalUrl || "/blog";

  if (isSSE || wantsJson) {
    return res.status(401).json({ ok: false, error: "Login required" });
  }

  return res.redirect("/login");
};

// middleware/index.js
module.exports.ensureAdmin = function ensureAdmin(req, res, next) {
  if (req.user && req.user.role === "admin") return next();

  const wantsJson = req.xhr || (req.headers.accept || "").includes("application/json");
  const isSSE = (req.headers.accept || "").includes("text/event-stream");

  if (isSSE || wantsJson) {
    return res.status(403).json({ ok: false, error: "Admins only" });
  }

  req.flash("error", "Admins only.");
  return res.redirect("/");
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

// Convert full URL or path into a clean pathname string (no domain, no query, no trailing slash)
function normalizeToPath(input = '') {
  const s = String(input).trim();
  if (!s) return '';

  // full URL -> pathname
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s);
      const path = u.pathname || '/';
      return path.replace(/\/+$/, '') || '/';
    } catch {
      // if URL parsing fails, just fall through
    }
  }

  // if they typed "country/" without leading slash, normalize it
  const path = s.startsWith('/') ? s : '/' + s;

  // remove trailing slashes (except root)
  return path.replace(/\/+$/, '') || '/';
}

function pageRuleMatches(rule, currentPath) {
  const r = normalizeToPath(rule);
  const p = normalizeToPath(currentPath);

  if (!r) return false;
  if (r === '*') return true;

  // Support BOTH formats:
  // 1) "/country/*"
  // 2) "/country/"  (treat trailing slash as "prefix match")
  const isPrefixRule = r.endsWith('/*') || rule.trim().endsWith('/');

  if (r.endsWith('/*')) {
    const prefix = r.slice(0, -2); // remove "/*"
    return p === prefix || p.startsWith(prefix + '/');
  }

  if (rule.trim().endsWith('/')) {
    // If user typed "/country/" we treat as prefix match
    const prefix = normalizeToPath(r + 'x').slice(0, -1); // cheap way to ensure no trailing slash
    return p === prefix || p.startsWith(prefix + '/');
  }

  // exact match
  return p === r;
}

function pageMatches(adPages, req) {
  // If pages is blank, treat as "all pages"
  if (!adPages) return true;

  const pagesArr = Array.isArray(adPages)
    ? adPages
    : String(adPages).split(',').map(s => s.trim()).filter(Boolean);

  if (pagesArr.includes('*')) return true;

  // Use request PATH (no domain) for reliable matching across prod/dev
  const currentPath = stripQuery(req.originalUrl || req.path || '/'); // "/country/Albania"

  return pagesArr.some(rule => pageRuleMatches(rule, currentPath));
}





module.exports.attachAds = async (req, res, next) => {
  try {
    // ✅ Skip ALL admin agent endpoints (SSE + preview/countries/etc.)
    if (req.originalUrl.startsWith("/admin/agent")) {
      return next();
    }

    // ✅ Skip SSE streams anywhere (extra safety)
    const accept = String(req.headers.accept || "");
    const isSSE =
      accept.includes("text/event-stream") ||
      req.path.startsWith("/admin/agent/stream") ||
      req.originalUrl.startsWith("/admin/agent/stream");

    if (isSSE) {
      return next();
    }

    // ✅ Load active ads
    const activeAds = await Ad.find({ active: true }).lean();

    // ✅ Filter ads that match this page
    const matching = activeAds.filter((ad) => pageMatches(ad.pages, req));

    // ✅ Group by placement(s)
    const adsByPlacement = {};
    for (const ad of matching) {
      const placements =
        Array.isArray(ad.placements) && ad.placements.length
          ? ad.placements
          : ad.placement
            ? [ad.placement]
            : [];

      for (const place of placements) {
        if (!place) continue;
        if (!adsByPlacement[place]) adsByPlacement[place] = [];
        adsByPlacement[place].push(ad);
      }
    }

    // console.log("[attachAds]", req.originalUrl);

    res.locals.adsByPlacement = adsByPlacement;

    res.locals.getAd = (placement) => {
      const list = adsByPlacement[placement] || [];
      if (!list.length) return null;
      return list[Math.floor(Math.random() * list.length)];
    };

    res.locals.getAds = (placement) => adsByPlacement[placement] || [];

    return next();
  } catch (e) {
    console.error("[attachAds] failed:", e);

    res.locals.adsByPlacement = {};
    res.locals.getAd = () => null;
    res.locals.getAds = () => [];

    return next();
  }
};

