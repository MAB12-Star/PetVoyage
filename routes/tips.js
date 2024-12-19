const express = require('express');
const router = express.Router();

// Route for About Us page
router.get('/', (req, res) => {
    res.render('regulations/tips'); // Path to aboutUs.ejs in the regulations folder
});

module.exports = router;
