const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Default checklist structure
const defaultChecklist = {
    "To-Do": [
        "Research your destination country's pet import requirements",
        "Get your pet's crate or carrier and start working on acclimation",
        "Schedule a visit to see your veterinarian",
        "Check airline or roadway routes",
        "Research pet-friendly hotels and services",
        "Get your pet's supplies",
        "Schedule a trip to the groomer",
    ],
    "In Progress": [],
    "Completed": [],
};

// GET To-Do List Page
router.get('/', async (req, res) => {
    let toDoList = defaultChecklist; // Default checklist for all users

    if (req.isAuthenticated()) {
        try {
            const user = await User.findById(req.user._id);
            if (user && user.toDoList) {
                console.log('User toDoList from DB:', user.toDoList);  // Log user's current toDoList
                toDoList = {
                    "To-Do": user.toDoList.get("To-Do") || defaultChecklist["To-Do"],
                    "In Progress": user.toDoList.get("In Progress") || [],
                    "Completed": user.toDoList.get("Completed") || [],
                };
            } else {
                console.log('No user data found or no toDoList in DB');  // Log if no data found
            }
        } catch (error) {
            console.error('Error fetching user to-do list:', error);
        }
    }

    console.log('Rendering toDoList:', toDoList);  // Log the toDoList being rendered
    res.render('regulations/toDoList', { toDoList, isAuthenticated: req.isAuthenticated() });
});

// POST route to update the to-do list
router.post('/update', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { task, fromSection, toSection } = req.body;

    // Log the incoming data to verify it's correct
    console.log('Received task update:', { task, fromSection, toSection });

    // Check if task or sections are undefined
    if (!task || !fromSection || !toSection) {
        return res.status(400).json({ error: 'Invalid data received' });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Ensure the sections are present in the Map
        if (!user.toDoList.get(fromSection)) {
            user.toDoList.set(fromSection, []);
        }
        if (!user.toDoList.get(toSection)) {
            user.toDoList.set(toSection, []);
        }

        // Log current toDoList before updating
        console.log('Before updating toDoList:', user.toDoList);

        // Remove task from the previous section and add it to the new section
        user.toDoList.get(fromSection).pull(task);  // `pull` is used to remove an item
        user.toDoList.get(toSection).push(task);    // `push` is used to add the item to the new section

        // Log after updating
        console.log('After updating toDoList:', user.toDoList);

        await user.save();  // Save the updated list to the database
        console.log('User toDoList saved to DB:', user.toDoList);  // Log after saving

        res.status(200).json({ success: true, message: 'Task updated successfully' });
    } catch (error) {
        console.error('Error updating to-do list:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});


module.exports = router;
