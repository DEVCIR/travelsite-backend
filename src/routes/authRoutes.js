// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRequest } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth'); // Your existing auth middleware
const { authValidation } = require('../middleware/validation'); // New validation
const jwt = require('jsonwebtoken');
require('dotenv').config();
const User = require('../models/User');

// Request password reset link
router.post(
  '/request-reset',
  validateRequest(authValidation.requestPasswordReset),
  authController.requestPasswordReset
);


// Reset password with token
router.post(
  '/reset-password',
  validateRequest(authValidation.resetPassword),
  authController.resetPassword
);

// Verify reset token
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    console.log('Received token:', token);
    console.log('Using JWT_SECRET:', process.env.JWT_SECRET);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);
    
    if (decoded.purpose !== 'password_reset') {
      console.log('Invalid token purpose');
      return res.status(400).json({ valid: false, message: 'Invalid token purpose' });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('User not found');
      return res.status(404).json({ valid: false, message: 'User not found' });
    }
    
    console.log('Token is valid');
    res.json({ valid: true });
  } catch (error) {
    console.error('Token verification failed:', error.message);
    res.status(400).json({ 
      valid: false, 
      message: 'Invalid or expired token',
      error: error.message // Include the actual error
    });
  }
});

router.get('/test-secret', (req, res) => {
  try {
    const testToken = jwt.sign({ test: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const verified = jwt.verify(testToken, process.env.JWT_SECRET);
    res.json({ success: true, verified });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});


// Protected route example using your existing authenticate middleware
router.get('/protected-route', authenticate, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

module.exports = router;