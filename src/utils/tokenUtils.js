// backend/utils/tokenUtils.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Generate JWT token
const generateToken = (payload, expiresIn) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken
};