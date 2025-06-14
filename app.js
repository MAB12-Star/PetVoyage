require('dotenv').config();

const User = require('./models/User'); 
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const ExpressError = require('./utils/ExpressError');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');

const regulations = require('./routes/regulations');
const flightRoutes = require('./routes/flights');
const auth = require('./routes/auth');
const favoritesRoutes = require('./routes/favorites');
const aboutUs = require('./routes/aboutUs');
const contactUs = require('./routes/contactUs');
const tips = require('./routes/tips');
const toDoListRoutes = require('./routes/toDoList');
const reviewsRoutes = require('./routes/reviews');
const airlineRoutes = require('./routes/airlines');
const petVoyageAi = require('./routes/petVoyageAi');
const findAVet = require('./routes/findAVet');
const blog = require('./routes/blog');
const beeline = require('./routes/beeline');
const countryRegulationListRoutes = require('./routes/countryRegulationList');

const airlineList = require('./routes/airlineList');

const mainRoutes = require('./routes/main');

const { redirectOldAirlineLinks } = require('./middleware');
const { toDoListMiddleware } = require('./middleware');


const MongoStore = require('connect-mongo');
// Ensure correct path and case

// MongoDB connection using MONGO_URI from .env
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
app.use(express.json()); // Enable JSON parsing for POST requests


// Session configuration using the MongoDB URI from .env
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'defaultSecret', // Use SESSION_SECRET from .env or fallback to 'defaultSecret'
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.mongoKey, // Use the MongoDB URI for session store
        touchAfter: 24 * 3600 // Lazy update after a day
    }),
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 1 week
        maxAge: 1000 * 60 * 60 * 24 * 7,
    }
};

app.use(session(sessionConfig));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.currentUser = req.user || null; // Set to null if user is not authenticated
    res.locals.success = req.flash('success'); // Success message
    res.locals.error = req.flash('error'); // Error message
    next();
});

app.use((req, res, next) => {
  
    next();
});

app.use(toDoListMiddleware);
// Use routes
app.use('/', auth);
app.use('/auth', auth);
app.use('/regulations', regulations);
app.use('/flights', flightRoutes); // General flight-related routes
app.use('/favorites', favoritesRoutes);
app.use('/aboutUs', aboutUs);
app.use('/findAVet', findAVet);
app.use('/contactUs', contactUs);
app.use('/blog', blog);
app.use('/tips', tips);
app.use('/', petVoyageAi);
app.use('/regulations/airlineList', airlineList);
app.use('/', countryRegulationListRoutes);


app.use(redirectOldAirlineLinks);

app.use('/beeline', beeline);



app.use('/', airlineRoutes);
app.use('/toDoList', toDoListRoutes);
app.use((req, res, next) => {
    res.locals.user = req.user; // Assuming you use Passport.js for authentication
    next();
});
// Mount review routes under flights
app.use('/airlines', reviewsRoutes); // Ensure reviewsRoutes is properly imported



  


app.get('/dashboard', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const user = await User.findById(req.user._id)
                .populate('savedRegulations')
                .populate('savedFlightRegulations')
                .populate('favoriteAirlines');
            
            res.render('dashboard', { user });
        } catch (error) {
            console.error('Error retrieving user data:', error);
            req.flash('error', 'Unable to retrieve your saved regulations');
            res.redirect('/');
        }
    } else {
        req.flash('error', 'You need to log in first!');
        res.redirect('/login');
    }
});
// Route for serving sitemap
app.get('/siteMap.xml', (req, res) => {
    res.sendFile(path.join(__dirname, 'siteMap.xml'));
  });

app.get('/', (req, res) => {
    res.render('index');
});




app.get('regulations/newSearch', (req, res) => {
  
    res.render('/regulations/newSearch', { currentPage: 'newSearch' });
  });

// Route for the sitemap
app.get('/sitemap', (req, res) => {
    res.render('sitemap'); // Render the sitemap view (e.g., sitemap.ejs)
});

app.all('*', (req, res, next) => {
    next(new ExpressError('Page Not Found', 404));
});

app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'Something went wrong';
    res.status(statusCode).render('error', { err });
});

app.listen(3000, () => {
    console.log('Serving on port 3000');
});



  
