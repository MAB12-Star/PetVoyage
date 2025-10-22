
require('dotenv').config();

const mongoose = require('mongoose');
const Airline = require('./models/airline');
const Review  = require('./models/review');

(async () => {
  await mongoose.connect(process.env.mongoKey);

  const airlines = await Airline.find({ reviews: { $exists: true, $ne: [] } }, { reviews: 1 }).lean();

  let updates = 0;
  for (const a of airlines) {
    for (const reviewId of a.reviews) {
      const r = await Review.findById(reviewId, { airline: 1 });
      if (r && !r.airline) {
        r.airline = a._id;
        await r.save();
        updates++;
      }
    }
  }

  console.log('Backfilled reviews:', updates);
  await mongoose.disconnect();
})();
