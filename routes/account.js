// routes/account.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

const User = require('../models/User');
const { ensureAuth } = require('../middleware');

// GET /account/profile – show profile settings page
router.get('/profile', ensureAuth, async (req, res) => {
  try {
    const dbUser = await User.findById(req.user._id).select('+passwordHash');
    const hasPassword = !!dbUser.passwordHash;

    res.render('account/profile', {
      user: dbUser,
      hasPassword
    });
  } catch (err) {
    console.error('Profile load error:', err);
    req.flash('error', 'Unable to load your profile.');
    res.redirect('/dashboard');
  }
});

// POST /account/profile – update profile + optional password change
router.post('/profile', ensureAuth, async (req, res) => {
  const { displayName, email, currentPassword, newPassword, confirmPassword } = req.body;

  const fail = (msg) => {
    req.flash('error', msg);
    return res.redirect('/account/profile');
  };

  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return fail('User not found.');

    // --- 1) Update basic profile fields ---
    if (displayName) user.displayName = displayName.trim();
    if (email) user.email = email.trim().toLowerCase();

    // --- 2) Handle password change / set ---
    const anyPasswordField =
      (currentPassword && currentPassword.trim()) ||
      (newPassword && newPassword.trim()) ||
      (confirmPassword && confirmPassword.trim());

    if (anyPasswordField) {
      const hasPassword = !!user.passwordHash;
      const newPass = (newPassword || '').trim();
      const confirmPass = (confirmPassword || '').trim();
      const currentPass = (currentPassword || '').trim();

      // basic checks
      if (!newPass || !confirmPass) {
        return fail('Please enter and confirm your new password.');
      }
      if (newPass !== confirmPass) {
        return fail('New passwords do not match.');
      }
      if (newPass.length < 8) {
        return fail('Password must be at least 8 characters long.');
      }

      // if they already have a password, require current password
      if (hasPassword) {
        if (!currentPass) {
          return fail('Please enter your current password.');
        }

        const ok = await bcrypt.compare(currentPass, user.passwordHash);
        if (!ok) {
          return fail('Current password is incorrect.');
        }
      }

      // all good – set / change password
      const salt = await bcrypt.genSalt(12);
      user.passwordHash = await bcrypt.hash(newPass, salt);
    }

    await user.save();

    req.flash('success', 'Profile updated successfully.');
    res.redirect('/account/profile');
  } catch (err) {
    console.error('Profile update error:', err);

    // Handle duplicate email nicely
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      req.flash('error', 'That email is already in use by another account.');
    } else {
      req.flash('error', 'Unable to update your profile. Please try again.');
    }

    res.redirect('/account/profile');
  }
});

module.exports = router;
