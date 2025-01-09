const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Review = require('../models/review');
const { isLoggedIn } = require('../middleware');
const { saveCurrentUrl } = require('../middleware');

// Add a new review
router.post('/:id/reviews', saveCurrentUrl,isLoggedIn, async (req, res) => {
    try {
        const airline = await Airline.findById(req.params.id);
        if (!airline) {
            req.flash('error', 'Airline not found');
            return res.redirect('/airlines');
        }

        const review = new Review({
            body: req.body.review.body,
            rating: req.body.review.rating,
            author: req.user._id,
        });
        airline.reviews.push(review);
        await review.save();
        await airline.save();
        req.flash('success', 'Review added!');
        res.redirect(`/airlines/${airline._id}`);
    } catch (err) {
        console.error('Error adding review:', err);
        req.flash('error', 'Unable to add review.');
        res.redirect(`/airlines/${req.params.id}`);
    }
});


// Delete a review
router.delete('/:id/reviews/:reviewId', async (req, res) => {
    try {
        const { id, reviewId } = req.params;

        // Remove the review from the airline
        await Airline.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });

        // Delete the review from the database
        await Review.findByIdAndDelete(reviewId);

        req.flash('success', 'Review deleted successfully!');
        res.redirect(`/airlines/${id}`); // Redirect back to the Flights/:id page
    } catch (error) {
        console.error('Error deleting review:', error);
        req.flash('error', 'Unable to delete review.');
        res.redirect(`/airlines/${id}`);
    }
});

module.exports = router;
