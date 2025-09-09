const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { authenticate } = require('../middleware/auth');
const {
  validateCreateTrip,
  validateUpdateTrip,
  validateGetTripById,
  validateDeleteTrip,
  validateUpdateTripStatus,
  validateGetUserTrips
} = require('../middleware/tripValidation');

// All trip routes require authentication
router.use(authenticate);

// GET /api/trips - Get all trips for authenticated user
router.get('/',
  validateGetUserTrips,
  tripController.getUserTrips
);

// POST /api/trips - Create a new trip
router.post('/',
  validateCreateTrip,
  tripController.createTrip
);

// GET /api/trips/:id - Get specific trip by ID
router.get('/:id',
  validateGetTripById,
  tripController.getTripById
);

// PUT /api/trips/:id - Update specific trip
router.put('/:id',
  validateUpdateTrip,
  tripController.updateTrip
);

// DELETE /api/trips/:id - Delete specific trip
router.delete('/:id',
  validateDeleteTrip,
  tripController.deleteTrip
);

// PATCH /api/trips/:id/status - Update trip status only
router.patch('/:id/status',
  validateUpdateTripStatus,
  tripController.updateTripStatus
);

// New AI and hotel routes
router.post('/:id/generate-itinerary',
  tripController.generateItinerary
);

router.get('/:tripId/hotels/:hotelId',
  tripController.getHotelDetails
);

module.exports = router;