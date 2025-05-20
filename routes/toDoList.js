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
    "in-progress": [],
    "completed": [],
};

// GET To-Do List Page
router.get('/', async (req, res) => {
    let toDoList = defaultChecklist; // Default checklist for all users

    if (req.isAuthenticated()) {
        try {
            const user = await User.findById(req.user._id);
            if (user && user.toDoList) {
               // console.log('User toDoList from DB:', user.toDoList);
                toDoList = {
                    "To-Do": user.toDoList.get("To-Do") || [],
                    "in-progress": user.toDoList.get("in-progress") || [],
                    "completed": user.toDoList.get("completed") || [],
                };
            } else {
                console.log('No user data found or no toDoList in DB');
            }
        } catch (error) {
            console.error('Error fetching user to-do list:', error);
        }
    }

 
    res.render('regulations/toDoList', { toDoList, isAuthenticated: req.isAuthenticated() });
});

// POST route to update the to-do list
router.post('/update', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { task, fromSection, toSection } = req.body;

 

    if (!task || !fromSection || !toSection) {
        return res.status(400).json({ error: 'Invalid data received' });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.toDoList.has(fromSection)) user.toDoList.set(fromSection, []);
        if (!user.toDoList.has(toSection)) user.toDoList.set(toSection, []);

        const fromTasks = user.toDoList.get(fromSection);
        const toTasks = user.toDoList.get(toSection);

        const taskIndex = fromTasks.indexOf(task);
        if (taskIndex > -1) {
            fromTasks.splice(taskIndex, 1);
            toTasks.push(task);
        }

        user.toDoList.set(fromSection, fromTasks);
        user.toDoList.set(toSection, toTasks);

        await user.save();

      
        res.status(200).json(Object.fromEntries(user.toDoList)); // Convert Map to JSON object
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

module.exports = router;
