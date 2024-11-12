const express = require('express');
const router = express.Router();
//const User = require('../models/User');
const Regulation = require('../models/regulation');
const { isLoggedIn } = require('../middleware');
const Airline = require('../models/airline');
const { saveCurrentUrl } = require('../middleware');


router.post('/saveFlightToProfile', isLoggedIn, async (req, res) => {
    const { airlineCode } = req.body;  // Get airline code from form submission
    const userId = req.user._id;

    console.log('Received airlineCode:', airlineCode);

    if (!airlineCode) {
        return res.status(400).json({ message: 'Airline code is missing' });
    }

    try {
        // Find the airline regulation by its code instead of using _id
        const airlineRegulation = await Airline.findOne({ airlineCode: airlineCode.trim().toUpperCase() });

        if (!airlineRegulation) {
            return res.status(404).json({ message: 'Airline regulation not found' });
        }

        // Find the user and add the regulation if not already saved.
        const user = await User.findById(userId);
        const regulationExists = user.savedFlightRegulations.some(
            regId => regId.equals(airlineRegulation._id)
        );

        if (!regulationExists) {
            user.savedFlightRegulations.push(airlineRegulation._id);
            await user.save();
            return res.status(200).json({ message: 'Airline regulation saved successfully' });
        } else {
            return res.status(200).json({ message: 'Airline regulation is already saved to your profile' });
        }
    } catch (error) {
        console.error('Error saving regulation:', error);
        return res.status(500).json({ message: 'Failed to save regulation' });
    }
});




router.post('/saveToProfile', saveCurrentUrl, isLoggedIn, async (req, res) => {
    try {
        console.log('Request received, body:', req.body); // Log the request body

        const userId = req.user._id; // Get the logged-in user's ID
        const { regulationId } = req.body; // Get the regulationId from the form

        console.log('Saving regulation with ID:', regulationId, 'for user:', userId);

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
            console.log('Regulation saved successfully');
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


// Route to save regulation to the user's profile upon request
// router.post('/saveToProfile', isLoggedIn, async (req, res) => {
//     try {
//         const userId = req.user._id; // Get the logged-in user's ID
//         const { regulationContent, country, petType } = req.body; // Get the regulation content from the form

//         // Check if the regulation already exists in the database
//         let regulation = await Regulation.findOne({ content: regulationContent, country, petType });

//         if (!regulation) {
//             // If the regulation doesn't exist, save it to the database
//             regulation = new Regulation({ content: regulationContent, country, petType });
//             await regulation.save();
//         }

//         // Find the user and save the regulation to their profile
//         const user = await User.findById(userId);
//         if (!user.savedRegulations.includes(regulation._id)) {
//             user.savedRegulations.push(regulation._id);
//             await user.save();
//         }

//         req.flash('success', 'Regulation saved to your profile');
//         res.redirect('/dashboard'); // Redirect to user's dashboard or other page
//     } catch (error) {
//         console.error('Error saving regulation:', error);
//         req.flash('error', 'Failed to save regulation');
//         res.redirect('back');
//     }
// });




module.exports = router;
