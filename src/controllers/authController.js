// backend/controllers/authController.js
const User = require('../models/User');
const { sendResetEmail } = require('../services/emailService');
const { generateToken, verifyToken } = require('../utils/tokenUtils');

exports.requestPasswordReset = async (req, res) => {
  try {
    // No need to check for email presence here - validation middleware handles it
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      // Security: return same message whether user exists or not
      return res.status(200).json({ 
        message: 'If an account exists, a reset link has been sent to your email' 
      });
    }
    
    const resetToken = generateToken(
      { userId: user._id, purpose: 'password_reset' },
      '1h'
    );
    
    await sendResetEmail(email, resetToken);
    
    res.status(200).json({ 
      message: 'If an account exists, a reset link has been sent to your email'
    });
    console.log('step1');
    
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Error processing your request' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    // Validation middleware already checked for required fields
    const { token, newPassword } = req.body;
    
    const decoded = verifyToken(token);
    
    if (!decoded || decoded.purpose !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
};