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

const { redirectOldAirlineLinks, toDoListMiddleware } = require('./middleware');

mongoose.connect(process.env.mongoKey, {});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error'));
db.once('open', () => {
    console.log('Database Connected');
});

const app = express();
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use(express.json());

// 🔁 SEO Redirect from non-www to www
app.use((req, res, next) => {
    const host = req.headers.host;
    if (host === 'petvoyage.ai') {
        return res.redirect(301, `https://www.petvoyage.ai${req.originalUrl}`);
    }
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

// 🗺 Sitemap route
app.get('/siteMap.xml', (req, res) => {
    res.sendFile(path.join(__dirname, 'siteMap.xml'));
});

// Route for the sitemap
app.get('/sitemap', (req, res) => {
    res.render('sitemap'); // Render the sitemap view (e.g., sitemap.ejs)
});
// 👤 Dashboard
app.get('/dashboard', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const user = await User.findById(req.user._id)
                .populate('savedRegulations')
                .populate('savedFlightRegulations')
                .populate('favoriteAirlines');

            res.render('dashboard', { user });
        } catch (error) {
            console.error('Dashboard Error:', error);
            req.flash('error', 'Unable to load your data.');
            res.redirect('/');
        }
    } else {
        req.flash('error', 'Please log in.');
        res.redirect('/login');
    }
});

// 🏠 Home
app.get('/', (req, res) => {
    res.render('index', { ogUrl: 'https://www.petvoyage.ai/' }); // Canonical
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
