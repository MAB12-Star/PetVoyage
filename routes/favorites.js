const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Regulation = require('../models/regulation');
const { isLoggedIn } = require('../middleware');
const Airline = require('../models/airline');
const { saveCurrentUrl } = require('../middleware');


router.post('/saveAirlineToFavorites', saveCurrentUrl, isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const { airlineId, link, airlineCode, airlineName, petPolicyURL, petPolicySummary } = req.body;

        if (!airlineId || !link) {
            console.error('Required fields are missing.');
            return res.status(400).json({ message: 'Airline ID and link are required.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error('User not found.');
            return res.status(404).json({ message: 'User not found.' });
        }

        // Check if the airline already exists in the favorites
        const airlineExists = user.favoriteAirlines.some(
            (favorite) => String(favorite.airlineId) === String(airlineId)
        );

        if (!airlineExists) {
            // Add the new favorite airline
            user.favoriteAirlines.push({
                airlineId,
                link,
                airlineCode,
                airlineName,
                petPolicyURL,
                petPolicySummary,
            });

            await user.save();

           
            return res.status(200).json({ message: 'Airline added to favorites.' });
        }

        console.log('Airline already in favorites.');
        return res.status(200).json({ message: 'Airline already in favorites.' });
    } catch (error) {
        console.error('Error saving airline to favorites:', error);
        return res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});



router.post('/saveFlightToProfile', saveCurrentUrl, isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id; // Get user ID from the authenticated user
        const { airlineCode } = req.body; // Get airlineCode from the request body

      

        // Find the user in the database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Find the airline using airlineCode
        const airline = await Airline.findOne({ airlineCode });
        if (!airline) {
            return res.status(404).json({ message: 'Airline not found.' });
        }

        // Check if the airline is already saved in the user's profile
        if (!user.savedFlightRegulations.includes(airline._id)) {
            user.savedFlightRegulations.push(airline._id);
            await user.save(); // Save the updated user data

            return res.status(200).json({ message: 'Flight regulation saved successfully.' });
        }

        // If the airline is already saved, return a different message
        return res.status(200).json({ message: 'Flight regulation is already saved to your profile.' });
    } catch (error) {
        console.error('Error saving flight regulation:', error);
        return res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});



router.post('/saveAirlineToProfile', saveCurrentUrl, isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id; // Get the logged-in user's ID
        const { airlineCode } = req.body; // Extract airlineCode from the request body

      

        // Find the user and airline
        const user = await User.findById(userId);
        const airline = await Airline.findOne({ airlineCode });

        if (!airline) {
            return res.status(404).json({ message: 'Airline not found.' });
        }

        // Check if the airline is already saved
        if (!user.savedFlightRegulations.includes(airline._id)) {
            user.savedFlightRegulations.push(airline._id); // Add the airline to the savedFlightRegulations array
            await user.save(); // Save the updated user document

  
            return res.status(200).json({ message: 'Flight regulation saved successfully.' });
        }

        console.log('Flight regulation already exists in the user profile');
        return res.status(200).json({ message: 'Flight regulation is already saved to your profile.' });
    } catch (error) {
        console.error('Error saving flight regulation:', error);
        return res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});




router.post('/saveToProfile', saveCurrentUrl, isLoggedIn, async (req, res) => {
    try {
     

        const userId = req.user._id; // Get the logged-in user's ID
        const { regulationId } = req.body; // Get the regulationId from the form


        // Fetch the regulation by its ID
        const regulation = await Regulation.findById(regulationId);
        if (!regulation) {
            return res.status(404).json({ message: 'Regulation not found' });
        }

        // Find the user and check if the regulation is already saved
        const user = await User.findById(userId);
        if (!user.savedRegulations.includes(regulationId)) {
            user.savedRegulations.push(regulationId); // Add regulation to the user's saved list
            await user.save(); // Save the updated user document

            
       
            return res.status(200).json({ message: 'Regulation saved to your profile' });
        } else {
            console.log('Regulation already exists in the user profile');
            return res.status(200).json({ message: 'Regulation is already saved to your profile' });
        }
    } catch (error) {
        console.error('Error saving regulation:', error);
        return res.status(500).json({ message: 'Something went wrong' });
    }
});


// // Route to delete a saved regulation from user's profile
router.delete('/:regulationId', isLoggedIn, async (req, res) => {
    const { regulationId } = req.params;

    try {
        // Find the logged-in user
        const user = await User.findById(req.user._id);

        // Remove the regulation from the user's saved regulations array
        user.savedRegulations = user.savedRegulations.filter(id => id.toString() !== regulationId);

        // Save the updated user document
        await user.save();

        req.flash('success', 'Regulation removed from your profile');
        res.redirect('/dashboard'); // Redirect to the user's dashboard after deletion
    } catch (error) {
        console.error('Error removing regulation:', error);
        req.flash('error', 'Could not remove the regulation');
        res.redirect('/dashboard');
    }
});

// Route to delete a saved flight regulation from user's profile
router.delete('/deleteFlight/:flightId', isLoggedIn, async (req, res) => {
    const { flightId } = req.params;

    try {
        // Find the logged-in user
        const user = await User.findById(req.user._id);

        // Remove the flight regulation from the user's savedFlightRegulations array
        user.savedFlightRegulations = user.savedFlightRegulations.filter(id => id.toString() !== flightId);

        // Save the updated user document
        await user.save();

        req.flash('success', 'Flight regulation removed from your profile');
        res.redirect('/dashboard'); // Redirect to the user's dashboard after deletion
    } catch (error) {
        console.error('Error removing flight regulation:', error);
        req.flash('error', 'Could not remove the flight regulation');
        res.redirect('/dashboard');
    }
});

// Route to delete a saved favorite airline from user's profile
router.delete('/deleteAirline/:airlineId', isLoggedIn, async (req, res) => {
    const { airlineId } = req.params;

    try {
        // Find the logged-in user
        const user = await User.findById(req.user._id);

        // Remove the airline from the user's favoriteAirlines array
        user.favoriteAirlines = user.favoriteAirlines.filter(
            (favorite) => favorite.airlineId.toString() !== airlineId
        );

        // Save the updated user document
        await user.save();

        req.flash('success', 'Favorite airline removed from your profile');
        res.redirect('/dashboard'); // Redirect to the user's dashboard after deletion
    } catch (error) {
        console.error('Error removing favorite airline:', error);
        req.flash('error', 'Could not remove the favorite airline');
        res.redirect('/dashboard');
    }
});





module.exports = router;
