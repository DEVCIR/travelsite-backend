const { body, param, query } = require('express-validator');

// Validation for creating a trip
const validateCreateTrip = [
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date')
    .custom((value) => {
      if (new Date(value) < new Date()) {
        throw new Error('Start date cannot be in the past');
      }
      return true;
    }),
  
  body('fromLocation')
    .trim()
    .notEmpty()
    .withMessage('From location is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('From location must be between 2 and 100 characters'),
  
  body('toDestination')
    .trim()
    .notEmpty()
    .withMessage('To destination is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('To destination must be between 2 and 100 characters'),
  
  body('maxDrivingDistance')
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage('Max driving distance must be between 100 and 1000 km'),
  
  body('evRange')
    .optional()
    .isInt({ min: 50, max: 800 })
    .withMessage('EV range must be between 50 and 800 km'),
  
  body('hotelRequired')
    .optional()
    .isBoolean()
    .withMessage('Hotel required must be a boolean value'),
  
  body('travelers')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Number of travelers must be between 1 and 10'),
  
  body('rooms')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Number of rooms must be between 1 and 5'),
  
  body('stops')
    .optional()
    .isArray({ max: 5 })
    .withMessage('Maximum 5 stops allowed'),
  
  body('stops.*.location')
    .if(body('stops').exists())
    .trim()
    .notEmpty()
    .withMessage('Stop location is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Stop location must be between 2 and 100 characters'),
  
  body('stops.*.coordinates.latitude')
    .if(body('stops.*.coordinates').exists())
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('stops.*.coordinates.longitude')
    .if(body('stops.*.coordinates').exists())
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

// Validation for updating a trip
const validateUpdateTrip = [
  param('id')
    .isMongoId()
    .withMessage('Invalid trip ID format'),
  
  body('tripDetails.startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  body('tripDetails.fromLocation')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('From location cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('From location must be between 2 and 100 characters'),
  
  body('tripDetails.toDestination')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('To destination cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('To destination must be between 2 and 100 characters'),
  
  body('tripDetails.maxDrivingDistance')
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage('Max driving distance must be between 100 and 1000 km'),
  
  body('tripDetails.evRange')
    .optional()
    .isInt({ min: 50, max: 800 })
    .withMessage('EV range must be between 50 and 800 km'),
  
  body('status')
    .optional()
    .isIn(['draft', 'planned', 'booked', 'completed', 'cancelled'])
    .withMessage('Invalid status value')
];

// Validation for getting trip by ID
const validateGetTripById = [
  param('id')
    .isMongoId()
    .withMessage('Invalid trip ID format')
];

// Validation for deleting trip
const validateDeleteTrip = [
  param('id')
    .isMongoId()
    .withMessage('Invalid trip ID format')
];

// Validation for updating trip status
const validateUpdateTripStatus = [
  param('id')
    .isMongoId()
    .withMessage('Invalid trip ID format'),
  
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['draft', 'planned', 'booked', 'completed', 'cancelled'])
    .withMessage('Invalid status value')
];

// Validation for getting user trips with query parameters
const validateGetUserTrips = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('status')
    .optional()
    .isIn(['draft', 'planned', 'booked', 'completed', 'cancelled'])
    .withMessage('Invalid status filter')
];

module.exports = {
  validateCreateTrip,
  validateUpdateTrip,
  validateGetTripById,
  validateDeleteTrip,
  validateUpdateTripStatus,
  validateGetUserTrips
};