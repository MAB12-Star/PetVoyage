const express = require('express');
const router = express.Router();
const User = require('../models/User');


function ensureToDoSections(user) {
  if (!user.toDoList) user.toDoList = new Map();
  if (!user.toDoList.has("To-Do")) user.toDoList.set("To-Do", []);
  if (!user.toDoList.has("in-progress")) user.toDoList.set("in-progress", []);
  if (!user.toDoList.has("completed")) user.toDoList.set("completed", []);
}

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
// routes/toDoList.js
router.get('/', async (req, res) => {
  let toDoListForView = STARTER_LIST;

  if (req.isAuthenticated()) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.render('regulations/toDoList', {
          toDoList: STARTER_LIST,
          isAuthenticated: false,
          user: null,                    // ✅ add this
        });
      }

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

      if (isEmpty) {
        user.toDoList = new Map(Object.entries(STARTER_LIST));
        await user.save();
        toDoListForView = STARTER_LIST;
      } else {
        toDoListForView = saved;
      }

      return res.render('regulations/toDoList', {
        toDoList: toDoListForView,
        isAuthenticated: true,
        user,                           // ✅ add this
      });

    } catch (error) {
      console.error('Error fetching user to-do list:', error);
    }
  }

  // guest render
  res.render('regulations/toDoList', {
    toDoList: toDoListForView,
    isAuthenticated: req.isAuthenticated(),
    user: req.user || null,            // ✅ add this
  });
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
// Add a task
router.post('/add', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: 'No task provided' });

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.toDoList) user.toDoList = new Map();
    if (!user.toDoList.has('To-Do')) user.toDoList.set('To-Do', []);
    if (!user.toDoList.has('in-progress')) user.toDoList.set('in-progress', []);
    if (!user.toDoList.has('completed')) user.toDoList.set('completed', []);

    const list = user.toDoList.get('To-Do') || [];
    list.push(task);
    user.toDoList.set('To-Do', list);
    await user.save();

    res.status(200).json(Object.fromEntries(user.toDoList)); // ✅ return updated list
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add task' });
  }
});



// Delete a single task from a section
router.post('/deleteTask', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const { task, section } = req.body;
  if (!task || !section) return res.status(400).json({ error: 'Missing task or section' });

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    ensureToDoSections(user);
    const list = user.toDoList.get(section) || [];
    const idx = list.indexOf(task);
    if (idx > -1) list.splice(idx, 1);
    user.toDoList.set(section, list);

    await user.save();
    return res.status(200).json({ ok: true, toDoList: Object.fromEntries(user.toDoList) });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Delete a single uploaded document by URL (or name)
router.post('/deleteDoc', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

  const { url, name } = req.body; // prefer url since it's unique
  if (!url && !name) return res.status(400).json({ error: 'Missing url or name' });

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!Array.isArray(user.uploadedDocs)) user.uploadedDocs = [];

    const before = user.uploadedDocs.length;
    user.uploadedDocs = user.uploadedDocs.filter(d => {
      if (url) return d.url !== url;
      return d.name !== name;
    });

    if (user.uploadedDocs.length === before) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await user.save();
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
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

// Serve uploads if you haven't already:
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

    // Grab custom display name from the form
    const rawName = (req.body.docName || '').trim();

    // Fallback to original filename if custom name is empty
    const displayName = rawName.length ? rawName : (req.file?.originalname || 'Untitled');

    // (Optional) cap length to something reasonable
    const safeName = displayName.slice(0, 120);

    if (!Array.isArray(user.uploadedDocs)) user.uploadedDocs = [];

    user.uploadedDocs.push({
      name: safeName,                                 // the name you’ll show in the list
      original: req.file?.originalname || safeName,   // keep original too (optional)
      url: `/uploads/docs/${req.file.filename}`,      // where the file lives
      // (Optional) store mime or uploadedAt:
      // mime: req.file.mimetype,
      // uploadedAt: new Date(),
    });

    await user.save();
    res.redirect('/toDoList');
  } catch (err) {
    console.error('Error uploading document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});



module.exports = router;
