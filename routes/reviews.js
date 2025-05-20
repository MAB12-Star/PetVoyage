const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Review = require('../models/review');
const { isLoggedIn } = require('../middleware');
const { saveCurrentUrl } = require('../middleware');

// Add a new review
router.post('/:slug/reviews', saveCurrentUrl, isLoggedIn, async (req, res) => {
    try {
        const airline = await Airline.findOne({ slug: req.params.slug });
        if (!airline) {
            req.flash('error', 'Airline not found');
            return res.redirect('/airlines');
        }

        const review = new Review({
            body: req.body.review.body,
            rating: req.body.review.rating,
            author: req.user._id,
        });

        await review.save();
airline.reviews.push(review._id); // Just reference the review
await Airline.updateOne(
  { _id: airline._id },
  { $push: { reviews: review._id } }
);


        req.flash('success', 'Review added!');
        res.redirect(`/airlines/${airline.slug}&Pet&Policy`);
    } catch (err) {
        console.error('Error adding review:', err);
        req.flash('error', 'Unable to add review.');
        res.redirect(`/airlines/${req.params.slug}&Pet&Policy`);
    }
});



// Delete a review using slug
router.delete('/slug/:slug/reviews/:reviewId', async (req, res) => {
    try {
        const { slug, reviewId } = req.params;

        // Find the airline by slug
        const airline = await Airline.findOne({ slug });
        if (!airline) {
            req.flash('error', 'Airline not found');
            return res.redirect('/airlines');
        }

        // Remove the review from the airline's reviews array
        await Airline.findByIdAndUpdate(airline._id, { $pull: { reviews: reviewId } });

        // Delete the review from the reviews collection
        await Review.findByIdAndDelete(reviewId);

        req.flash('success', 'Review deleted successfully!');
        res.redirect(`/airlines/${slug}&Pet&Policy`);
    } catch (error) {
        console.error('Error deleting review:', error);
        req.flash('error', 'Unable to delete review.');
        res.redirect(`/airlines/${req.params.slug}&Pet&Policy`);
    }
});

module.exports = router;
