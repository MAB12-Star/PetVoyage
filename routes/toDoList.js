const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Default checklist structure
const STARTER_LIST = {
  "To-Do": [
    "Research your destination country's pet import requirements (<a href='/getCountryRegulationList' class='link-primary'>View Country Policies</a>)",
    "Check airline or roadway routes (<a href='/regulations/airlineList' class='link-primary'>Airline Policies</a>)",
    "Find a vet for your health certificate (<a href='/findAVet' class='link-primary'>Find a Vet</a>)",
    "Purchase an airline-approved carrier (<a href='https://petsvoyage.myshopify.com/collections/carriers' class='link-success'>Shop Now</a>)",
  ],
  "in-progress": [],
  "completed": [],
};


// GET To-Do List Page
// routes/toDoList.js
router.get('/', async (req, res) => {
  let toDoListForView = STARTER_LIST; // default for guests

  if (req.isAuthenticated()) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.render('regulations/toDoList', { toDoList: STARTER_LIST, isAuthenticated: false });
      }

      // Safely read Map (Map vs plain object)
      const m = user.toDoList;
      const saved = {
        "To-Do": (m?.get ? m.get("To-Do") : m?.["To-Do"]) || [],
        "in-progress": (m?.get ? m.get("in-progress") : m?.["in-progress"]) || [],
        "completed": (m?.get ? m.get("completed") : m?.["completed"]) || [],
      };

      const isEmpty =
        (saved["To-Do"]?.length || 0) +
        (saved["in-progress"]?.length || 0) +
        (saved["completed"]?.length || 0) === 0;

      // First login with empty list? Seed from defaults and persist.
      if (isEmpty) {
        user.toDoList = new Map(Object.entries(STARTER_LIST));
        await user.save();
        toDoListForView = STARTER_LIST;
      } else {
        toDoListForView = saved;
      }
    } catch (error) {
      console.error('Error fetching user to-do list:', error);
      toDoListForView = STARTER_LIST;
    }
  }

  res.render('regulations/toDoList', { toDoList: toDoListForView, isAuthenticated: req.isAuthenticated() });
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
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ensure sections exist
    if (!user.toDoList.has("To-Do")) user.toDoList.set("To-Do", []);
    if (!user.toDoList.has("in-progress")) user.toDoList.set("in-progress", []);
    if (!user.toDoList.has("completed")) user.toDoList.set("completed", []);

    const fromTasks = user.toDoList.get(fromSection) || [];
    const toTasks   = user.toDoList.get(toSection)   || [];

    // Remove from 'fromSection' if present
    const idx = fromTasks.indexOf(task);
    if (idx > -1) fromTasks.splice(idx, 1);

    // Add to 'toSection' if not already there
    if (!toTasks.includes(task)) toTasks.push(task);

    user.toDoList.set(fromSection, fromTasks);
    user.toDoList.set(toSection, toTasks);

    await user.save();

    res.status(200).json(Object.fromEntries(user.toDoList));
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Add a task
router.post('/add', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: 'No task provided' });

  try {
    const user = await User.findById(req.user._id);
    const list = user.toDoList.get('To-Do') || [];
    list.push(task);
    user.toDoList.set('To-Do', list);
    await user.save();
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// Reset to defaults
router.post('/reset', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await User.findById(req.user._id);
    user.toDoList = new Map(Object.entries(defaultChecklist));
    await user.save();
    res.redirect('/toDoList');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset' });
  }
});
// ======================
// Document Upload Routes
// ======================
const multer = require('multer');
const path = require('path');

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/docs/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// POST: Upload Pet Travel Document
router.post('/uploadDoc', upload.single('doc'), async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.uploadedDocs.push({
      name: req.file.originalname,
      url: `/uploads/docs/${req.file.filename}`,
    });

    await user.save();
    res.redirect('/toDoList');
  } catch (err) {
    console.error('Error uploading document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});


module.exports = router;
