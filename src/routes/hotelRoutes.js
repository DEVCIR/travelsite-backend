// src/routes/hotelRoutes.js
const express = require('express');
const { body, query, param } = require('express-validator');
const hotelController = require('../controllers/hotelController');

const router = express.Router();

// Validation middleware
const searchHotelsValidation = [
    body('location')
        .notEmpty()
        .withMessage('Location is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Location must be between 2 and 100 characters'),
    body('checkIn')
        .notEmpty()
        .withMessage('Check-in date is required')
        .isISO8601()
        .withMessage('Check-in date must be a valid date'),
    body('checkOut')
        .notEmpty()
        .withMessage('Check-out date is required')
        .isISO8601()
        .withMessage('Check-out date must be a valid date'),
    body('guests')
        .optional()
        .isInt({ min: 1, max: 20 })
        .withMessage('Guests must be between 1 and 20'),
    body('rooms')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Rooms must be between 1 and 10'),
    body('radius')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Radius must be between 0 and 100 km'),
    body('minRating')
        .optional()
        .isFloat({ min: 0, max: 5 })
        .withMessage('Minimum rating must be between 0 and 5'),
    body('maxPrice')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Maximum price must be a positive number'),
    body('amenities')
        .optional()
        .isArray()
        .withMessage('Amenities must be an array')
];

const verifyHotelsValidation = [
    body('hotels')
        .isArray({ min: 1 })
        .withMessage('Hotels array is required and must contain at least one hotel'),
    body('hotels.*.name')
        .notEmpty()
        .withMessage('Hotel name is required'),
    body('tripDetails')
        .notEmpty()
        .withMessage('Trip details are required'),
    body('tripDetails.travelers')
        .isInt({ min: 1, max: 20 })
        .withMessage('Number of travelers must be between 1 and 20'),
    body('tripDetails.rooms')
        .isInt({ min: 1, max: 10 })
        .withMessage('Number of rooms must be between 1 and 10')
];

const checkAvailabilityValidation = [
    param('id')
        .notEmpty()
        .withMessage('Hotel ID is required'),
    body('checkIn')
        .notEmpty()
        .withMessage('Check-in date is required')
        .isISO8601()
        .withMessage('Check-in date must be a valid date'),
    body('checkOut')
        .notEmpty()
        .withMessage('Check-out date is required')
        .isISO8601()
        .withMessage('Check-out date must be a valid date'),
    body('guests')
        .isInt({ min: 1, max: 20 })
        .withMessage('Number of guests must be between 1 and 20'),
    body('rooms')
        .isInt({ min: 1, max: 10 })
        .withMessage('Number of rooms must be between 1 and 10')
];

const getAlternativesValidation = [
    query('location')
        .notEmpty()
        .withMessage('Location is required'),
    query('checkIn')
        .notEmpty()
        .withMessage('Check-in date is required')
        .isISO8601()
        .withMessage('Check-in date must be a valid date'),
    query('checkOut')
        .notEmpty()
        .withMessage('Check-out date is required')
        .isISO8601()
        .withMessage('Check-out date must be a valid date'),
    query('guests')
        .optional()
        .isInt({ min: 1, max: 20 })
        .withMessage('Number of guests must be between 1 and 20'),
    query('rooms')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Number of rooms must be between 1 and 10'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 20 })
        .withMessage('Limit must be between 1 and 20')
];

// Routes
/**
 * @route POST /api/hotel/search
 * @desc Search hotels by location and dates
 * @access Public
 */
router.post('/search', searchHotelsValidation, hotelController.searchHotels.bind(hotelController));

/**
 * @route GET /api/hotel/:id
 * @desc Get specific hotel details
 * @access Public
 */
router.get('/:id',
    param('id').notEmpty().withMessage('Hotel ID is required'),
    hotelController.getHotelDetails.bind(hotelController)
);

/**
 * @route POST /api/hotel/verify
 * @desc Verify GPT-recommended hotels against TSS API
 * @access Public
 */
router.post('/verify', verifyHotelsValidation, hotelController.verifyHotels.bind(hotelController));

/**
 * @route GET /api/hotel/alternatives
 * @desc Get alternative hotels when original unavailable
 * @access Public
 */
router.get('/alternatives', getAlternativesValidation, hotelController.getAlternatives.bind(hotelController));

/**
 * @route POST /api/hotel/:id/availability
 * @desc Check hotel availability
 * @access Public
 */
router.post('/:id/availability', checkAvailabilityValidation, hotelController.checkAvailability.bind(hotelController));

/**
 * @route POST /api/hotel/batch
 * @desc Get hotels by multiple IDs
 * @access Public
 */
router.post('/batch',
    body('ids')
        .isArray({ min: 1 })
        .withMessage('Hotel IDs array is required and cannot be empty')
        .custom((ids) => {
            if (!ids.every(id => typeof id === 'string' && id.trim().length > 0)) {
                throw new Error('All hotel IDs must be non-empty strings');
            }
            return true;
        }),
    hotelController.getHotelsByIds.bind(hotelController)
);

// Additional utility routes

/**
 * @route GET /api/hotel/location/:city/:country
 * @desc Get hotels by city and country
 * @access Public
 */
router.get('/location/:city/:country',
    param('city').notEmpty().withMessage('City is required'),
    param('country').notEmpty().withMessage('Country is required'),
    query('minRating').optional().isFloat({ min: 0, max: 5 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    async (req, res) => {
        try {
            const { city, country } = req.params;
            const { minRating, maxPrice, limit } = req.query;

            const Hotel = require('../models/Hotel');
            const hotels = await Hotel.findByLocation(city, country, {
                minRating: minRating ? parseFloat(minRating) : undefined,
                maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
                limit: limit ? parseInt(limit) : 20
            });

            res.json({
                success: true,
                message: 'Hotels retrieved successfully',
                data: {
                    hotels,
                    count: hotels.length,
                    searchParams: { city, country, minRating, maxPrice }
                }
            });
        } catch (error) {
            console.error('Error getting hotels by location:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get hotels',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }
);

/**
 * @route GET /api/hotel/search/:name
 * @desc Search hotels by name
 * @access Public
 */
router.get('/search/:name',
    param('name').notEmpty().withMessage('Hotel name is required'),
    query('location').optional(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    async (req, res) => {
        try {
            const { name } = req.params;
            const { location, limit } = req.query;

            const Hotel = require('../models/Hotel');
            let hotels = await Hotel.searchByName(name, location);

            if (limit) {
                hotels = hotels.limit(parseInt(limit));
            }

            const results = await hotels.exec();

            res.json({
                success: true,
                message: 'Hotels found successfully',
                data: {
                    hotels: results,
                    count: results.length,
                    searchParams: { name, location }
                }
            });
        } catch (error) {
            console.error('Error searching hotels by name:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search hotels',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }
);

module.exports = router;