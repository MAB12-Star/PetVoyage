const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Full checklist visible to all users
const defaultChecklist = {
    "Research your destination country's pet import requirements": {
        "Is an import permit required?": false,
        "Is a microchip required?": false,
        "What vaccinations are required and when should they be administered?": false,
        "Is there a Blood Titer Test (RNATT) test required?": false,
        "Is an internal and internal parasite requirement?": false,
        "Is there a need to make quarantine arrangements?": false,
        "Must my pet arrive as manifest cargo?": false,
    },
    "Get your pet's crate or carrier and start working on acclimation": {
        "Pet carrier must have waterproof bottom, adequate ventilation and be secure.": false,
        "Pet crate for larger cats and dogs must meet IATA requirements.": false,
        "Put lots of familiar things in the crate or carrier including something with your scent.": false,
        "Encourage your pet to rest and nap in its carrier.": false,
        "Leave the door open so your pet can go in and out of the crate or carrier.": false,
        "Take them for drives or walks to someplace fun in their crate or carrier.": false,
        "Spend time praising your pet for loving their crate or carrier.": false,
    },
    "Schedule a visit to see your veterinarian": {
        "Check for health.": false,
        "Have your pet microchipped with a 15-digit ISO 11784/11785 microchip.": false,
        "Verify rabies vaccination expiration.": false,
        "Discuss any titer test or other testing that must be done.": false,
    },
    "Check airline or roadway routes": {
        "Check for road construction or traffic issues if traveling on the ground.": false,
        "If flying, avoid airports that are more challenging to transit (e.g., London, Taiwan).": false,
        "Keep layovers to 2 hours if possible.": false,
        "Do not change airlines—changing planes is okay.": false,
    },
    "Research pet-friendly hotels and services": {
        "Find a pet-friendly hotel and verify pet policies before booking online.": false,
        "Find an animal hospital nearby in case of emergencies.": false,
        "Find pet-friendly parks and restaurants nearby.": false,
    },
    "Get your pet's supplies": {
        "Leash and collar.": false,
        "Name tag with your phone number.": false,
        "Picture of you and your pet in case of separation.": false,
        "Bottled water and a portable water dish.": false,
        "Supply of sealed pet food and treats.": false,
        "Brush and shampoo.": false,
        "Toys, including a special chew bone for the trip.": false,
        "Medication and emergency items (e.g., eye drops, tweezers).": false,
        "Pet harness for the car.": false,
        "Old sheets for covering furniture in hotels.": false,
        "Plastic bags for cleanup.": false,
    },
    "Schedule a trip to the groomer": {
        "A clean pet is a comfortable pet.": false,
    },
};

// GET To-Do List Page
router.get('/', async (req, res) => {
    let toDoList = defaultChecklist; // Default checklist for all users

    // If the user is authenticated, fetch their personal to-do list
    if (req.isAuthenticated()) {
        try {
            const user = await User.findById(req.user._id);
            if (user && user.toDoList) {
                toDoList = { ...defaultChecklist, ...user.toDoList };
            }
        } catch (error) {
            console.error('Error fetching user to-do list:', error);
        }
    }

    // Render the to-do list page
    res.render('regulations/toDoList', { toDoList, isAuthenticated: req.isAuthenticated() });
});

// POST route to update the to-do list
router.post('/update', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { section, task, completed } = req.body;

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update the specific task
        if (user.toDoList[section] && user.toDoList[section].hasOwnProperty(task)) {
            user.toDoList[section][task] = completed;
        } else {
            user.toDoList[section] = { ...(user.toDoList[section] || {}), [task]: completed };
        }

        await user.save();
        res.status(200).json({ success: true, message: 'Task updated successfully' });
    } catch (error) {
        console.error('Error updating to-do list:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

module.exports = router;
