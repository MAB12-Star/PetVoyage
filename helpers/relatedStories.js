const Story = require('../models/story');
const exact = value => new RegExp('^' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
module.exports = async function relatedStories({ country, airlineSlug, airlineName } = {}) {
  const matches = [];
  if (country) matches.push({ country: exact(country) });
  if (airlineSlug) matches.push({ airlineSlug: String(airlineSlug) });
  if (airlineName) matches.push({ airline: exact(airlineName), $or: [{airlineSlug: {$exists:false}}, {airlineSlug:null}, {airlineSlug:''}] });
  if (!matches.length) return [];
  return Story.find({ $or: matches }).select('title slug summary photos authorName createdAt country airline airlineSlug')
    .sort({ createdAt: -1 }).limit(3).lean();
};
