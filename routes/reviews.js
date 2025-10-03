// routes/airlines.js
const express = require('express');
const router = express.Router();
const Airline = require('../models/airline');
const Review = require('../models/review');
const { isLoggedIn } = require('../middleware');
const { saveCurrentUrl } = require('../middleware');

// SHOW airline (ensure this matches how you mount the router)
// e.g., app.use('/airlines', airlinesRouter)
router.get('/:slug', async (req, res, next) => {
  try {
    const airline = await Airline.findOne({ slug: req.params.slug })
      .populate({
        path: 'reviews',
        options: { sort: { createdAt: -1 } },
        populate: { path: 'author', select: 'name username' }
      });

    if (!airline) {
      req.flash('error', 'Airline not found');
      return res.redirect('/airlines');
    }

    // Defensive: ensure array for template
    airline.reviews = airline.reviews || [];
    return res.render('regulations/showAirline', { airline, currentUser: req.user });
  } catch (err) {
    return next(err);
  }
});

// CREATE review
router.post('/:slug/reviews', isLoggedIn, saveCurrentUrl, async (req, res) => {
  try {
    const airline = await Airline.findOne({ slug: req.params.slug });
    if (!airline) {
      req.flash('error', 'Airline not found');
      return res.redirect('/airlines');
    }

    const rating = Number(req.body?.review?.rating) || 0;
    const body = (req.body?.review?.body || '').trim();
    if (!body) {
      req.flash('error', 'Please enter a review.');
      return res.redirect(`/airlines/${airline.slug}`);
    }

    const review = new Review({
      body,
      rating,
      author: req.user._id,
      airline: airline._id, // back-reference for virtuals/queries
    });
    await review.save();

    // Atomic write; avoid dupes
    await Airline.updateOne(
      { _id: airline._id },
      { $addToSet: { reviews: review._id } }
    );

    req.flash('success', 'Review added!');
    return res.redirect(`/airlines/${airline.slug}`);
  } catch (err) {
    console.error('Error adding review:', err);
    req.flash('error', 'Unable to add review.');
    return res.redirect(`/airlines/${req.params.slug}`);
  }
});

// DELETE review (by slug + reviewId)
router.delete('/slug/:slug/reviews/:reviewId', isLoggedIn, async (req, res) => {
  try {
    const { slug, reviewId } = req.params;

    const airline = await Airline.findOne({ slug });
    if (!airline) {
      req.flash('error', 'Airline not found');
      return res.redirect('/airlines');
    }

    // Only allow the author (or admins if you add a check) to delete
    const review = await Review.findById(reviewId);
    if (!review) {
      req.flash('error', 'Review not found');
      return res.redirect(`/airlines/${slug}`);
    }
    if (String(review.author) !== String(req.user._id)) {
      req.flash('error', 'You do not have permission to delete this review.');
      return res.redirect(`/airlines/${slug}`);
    }

    // Pull from airline + delete the review
    await Airline.updateOne({ _id: airline._id }, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);

    req.flash('success', 'Review deleted successfully!');
    return res.redirect(`/airlines/${slug}`);
  } catch (error) {
    console.error('Error deleting review:', error);
    req.flash('error', 'Unable to delete review.');
    return res.redirect(`/airlines/${req.params.slug}`);
  }
});

module.exports = router;
