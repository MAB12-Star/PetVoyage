require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const MongoStore = require('connect-mongo');

const ExpressError = require('./utils/ExpressError');
const User = require('./models/User');

// Routes
const auth = require('./routes/auth');
const regulations = require('./routes/regulations');
const flightRoutes = require('./routes/flights');
const favoritesRoutes = require('./routes/favorites');
const aboutUs = require('./routes/aboutUs');
const contactUs = require('./routes/contactUs');
const tips = require('./routes/tips');
const toDoListRoutes = require('./routes/toDoList');
const reviewsRoutes = require('./routes/reviews');
const airlineRoutes = require('./routes/airlines');
const airlineList = require('./routes/airlineList');
const countryRegulationListRoutes = require('./routes/countryRegulationList');
const blog = require('./routes/blog');
const findAVet = require('./routes/findAVet');
// top with other routes
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');





const { redirectOldAirlineLinks, toDoListMiddleware } = require('./middleware');
const e = require('connect-flash');

mongoose.connect(process.env.mongoKey, {});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error'));
db.once('open', () => {
    console.log('Database Connected');
    console.log('[MONGO] connecting to:', process.env.mongoKey.replace(/\/\/.*@/, '//<redacted>@'));

});

const app = express();
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use(express.json());

const IS_DEV  = process.env.NODE_ENV === 'development';
const IS_PROD = process.env.NODE_ENV === 'production';

// Enforce canonical ONLY in prod
if (IS_PROD) {
  app.set('trust proxy', true); // only needed behind nginx/proxy in prod
  app.use((req, res, next) => {
    const desiredHost = process.env.CANONICAL_HOST || 'www.petvoyage.ai';
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isHttps || req.headers.host !== desiredHost) {
      return res.redirect(301, `https://${desiredHost}${req.originalUrl}`);
    }
    next();
  });
}

// Always provide an absolute URL for templates (works in dev & prod)
app.use((req, res, next) => {
  res.locals.safeOgUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  res.locals.ogUrl = null;
  next();
});



// Minimal: build a URL for templates, no redirects
app.use((req, res, next) => {
    try {
      const u = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
      res.locals.safeOgUrl = u.toString();
    } catch {
      res.locals.safeOgUrl = 'https://localhost:3000/';
    }
    res.locals.ogUrl = null;
    next();
  });
  
  

// 📦 Session config
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'defaultSecret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.mongoKey,
        touchAfter: 24 * 3600
    }),
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7
    }
};
app.use(session(sessionConfig));
app.use(flash());

// 🔐 Auth
app.use(passport.initialize());
app.use(passport.session());

// 🌐 Globals
app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// 🧠 Middleware
app.use(toDoListMiddleware);

// 🛣 Routes
// in app.js/server.js
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/ai', aiRoutes); // AI route near the top
app.use('/', auth);
app.use('/auth', auth);
app.use('/regulations', regulations);
app.use('/flights', flightRoutes);
app.use('/favorites', favoritesRoutes);
app.use('/aboutUs', aboutUs);
app.use('/findAVet', findAVet);
app.use('/contactUs', contactUs);
app.use('/blog', blog);
app.use('/tips', tips);
app.use('/toDoList', toDoListRoutes);
app.use('/regulations/airlineList', airlineList);
app.use('/', countryRegulationListRoutes);
app.use(redirectOldAirlineLinks); // 🔁 Legacy redirect middleware
app.use('/', airlineRoutes);
app.use('/airlines', reviewsRoutes); // ✅ for nested reviews
// ... after other app.use(...)
app.use('/admin', adminRoutes);


// 🗺 Sitemap route
app.get('/siteMap.xml', (req, res) => {
    res.sendFile(path.join(__dirname, 'siteMap.xml'));
});

// Route for the sitemap
app.get('/sitemap', (req, res) => {
    res.render('sitemap'); // Render the sitemap view (e.g., sitemap.ejs)
});
// app.js (or wherever your routes live)
const Review = require('./models/review');
const Story  = require('./models/story'); // <-- use your actual Story model path/name

// 👤 Dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'Please log in.');
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.user._id)
      .populate('savedRegulations')
      .populate('savedFlightRegulations')
      .populate('favoriteAirlines');

    // Fetch items the user owns
    const myReviews = await Review.find({ author: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: 'airline', select: 'name airlineCode slug' }) // optional, if you stored it
      .lean();

    const myStories = await Story.find({ author: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.render('dashboard', { user, myReviews, myStories });
  } catch (error) {
    console.error('Dashboard Error:', error);
    req.flash('error', 'Unable to load your data.');
    res.redirect('/');
  }
});


// 🏠 Home
app.get('/', (req, res) => {
    res.render('index');
  });
  

// ❌ 404 Handler
app.all('*', (req, res, next) => {
    next(new ExpressError('Page Not Found', 404));
});

// ⚠️ Error Handler
app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'Something went wrong';
    res.status(statusCode).render('error', { err });
});

// 🚀 Start Server
app.listen(3000, () => {
    console.log('Serving on port 3000');
});
