// models/Story.js
const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  url:      { type: String, required: true }, // e.g., /uploads/1699-somefile.jpg
  thumbUrl: { type: String, default: '' },    // small/preview version (optional)
  alt:      { type: String, default: '' }
}, { _id: false });

/* =========================
   NEW: Comments subdocument
   ========================= */
const CommentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, default: 'Anonymous' }, // snapshot of display name
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const StorySchema = new mongoose.Schema({
  // Core
  title:       { type: String, required: true, trim: true, maxlength: 140 },
  slug:        { type: String, unique: true, index: true }, // /blog/:slug
  summary:     { type: String, default: '', maxlength: 300 }, // short teaser
  body:        { type: String, required: true },             // HTML

  // Travel meta (all optional, plain strings)
  airline:     { type: String, default: '' },  // e.g., "Volaris"
  route:       { type: String, default: '' },  // e.g., "SFO → CDMX"
  country:     { type: String, default: '' },  // destination country
  petType:     { type: String, default: '' },  // single pet type for filtering
  petTypes:    { type: [String], default: [] },// extra tags e.g. ["dog","cat"]

  // Photos
  photos:      { type: [PhotoSchema], default: [] },

  // Ownership
  author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName:  { type: String, default: '' }, // snapshot of display name (optional)

  // Soft metadata
  likes:       { type: Number, default: 0 }, // (legacy / optional)

  /* =========================
     NEW: Favorites + Comments
     ========================= */
  favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  favoritesCount: { type: Number, default: 0 },

  comments: { type: [CommentSchema], default: [] },

  // SEO overrides (optional)
  metaTitle:       { type: String, default: '' },
  metaDescription: { type: String, default: '' },
}, {
  timestamps: true // adds createdAt / updatedAt
});

/* ---------- Helpers ---------- */
function baseSlugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['"]/g, '')           // drop quotes
    .replace(/[^a-z0-9\s-]/g, '')   // keep alnum/space/hyphen
    .trim()
    .replace(/\s+/g, '-');          // spaces → hyphens
}

/* ---------- Pre-save: ensure unique slug + keep favoritesCount accurate ---------- */
StorySchema.pre('save', async function(next) {
  try {
    // If no slug (new doc), compute a slug
    if (!this.slug && this.title) {
      const base = baseSlugify(this.title);
      let candidate = base || 'story';
      let n = 0;

      while (await mongoose.models.Story.exists({ slug: candidate })) {
        n += 1;
        candidate = `${base}-${Date.now().toString(36)}${n > 1 ? '-' + n : ''}`;
      }
      this.slug = candidate;
    }

    // Snapshot authorName if empty and author is populated
    if (!this.authorName && this.populated && this.populated('author')) {
      const authorDoc = this.author;
      if (authorDoc && authorDoc.displayName) this.authorName = authorDoc.displayName;
    }

    // Keep favoritesCount consistent
    if (Array.isArray(this.favoritedBy)) {
      this.favoritesCount = this.favoritedBy.length;
    }

    next();
  } catch (err) {
    next(err);
  }
});

/* ---------- Indexes (basic blog search) ---------- */
StorySchema.index({
  title: 'text',
  summary: 'text',
  body: 'text'
}, {
  weights: { title: 4, summary: 2, body: 1 },
  name: 'StoryTextIndex'
});

// Helpful indexes for sorting/filtering
StorySchema.index({ createdAt: -1 });
StorySchema.index({ favoritesCount: -1 });

module.exports = mongoose.model('Story', StorySchema);
