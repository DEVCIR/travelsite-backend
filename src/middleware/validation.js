// backend/middleware/validation.js
const { body, validationResult } = require('express-validator');

exports.validateRequest = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format errors and return response
    const extractedErrors = errors.array().map(err => ({
      [err.param]: err.msg,
    }));

    return res.status(422).json({
      errors: extractedErrors,
    });
  };
};

// Reusable validation schemas
exports.authValidation = {
  requestPasswordReset: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
  ],
  resetPassword: [
    body('token')
      .notEmpty().withMessage('Token is required'),
    body('newPassword')
      .notEmpty().withMessage('New password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ]
};