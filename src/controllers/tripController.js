const Trip = require('../models/Trip');
const { validationResult } = require('express-validator');
const aiService = require('../services/aiService');
const hotelService = require('../services/hotelService');

class TripController {

    // Create a new trip
    async createTrip(req, res) {
        try {
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const userId = req.userId; // From Clerk authentication
            const tripData = req.body;

            // Create new trip
            const newTrip = new Trip({
                userId,
                tripDetails: {
                    startDate: tripData.startDate,
                    fromLocation: tripData.fromLocation,
                    toDestination: tripData.toDestination,
                    stops: tripData.stops || [],
                    maxDrivingDistance: tripData.maxDrivingDistance || 500,
                    evRange: tripData.evRange || 300,
                    hotelRequired: tripData.hotelRequired !== false, 
                    travelers: tripData.travelers || 2,
                    rooms: tripData.rooms || 1
                },
                status: 'draft'
            });

            const savedTrip = await newTrip.save();

            res.status(201).json({
                success: true,
                message: 'Trip created successfully',
                data: {
                    trip: savedTrip
                }
            });

        } catch (error) {
            console.error('Error creating trip:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Generate AI itinerary for a trip
    async generateItinerary(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;

            // Find the trip
            const trip = await Trip.findOne({ _id: id, userId });
            if (!trip) {
                return res.status(404).json({
                    success: false,
                    message: 'Trip not found'
                });
            }

            // Generate itinerary using AI
            console.log('Generating AI itinerary for trip:', id);
            const aiItinerary = await aiService.generateTripItinerary(trip);

            // Verify hotels if hotel required
            let verifiedHotels = [];
            if (trip.tripDetails.hotelRequired && aiItinerary.hotels.length > 0) {
                console.log('Verifying hotels with API...');
                verifiedHotels = await hotelService.verifyAndSearchHotels(
                    aiItinerary.hotels,
                    trip.tripDetails
                );
            }

            // Update trip with generated route
            const updatedTrip = await Trip.findByIdAndUpdate(
                id,
                {
                    $set: {
                        generatedRoute: {
                            totalDistance: aiItinerary.totalDistance,
                            totalDuration: aiItinerary.totalDuration,
                            waypoints: aiItinerary.waypoints,
                            hotels: verifiedHotels,
                            chargingStations: aiItinerary.chargingStations
                        },
                        aiGenerated: true,
                        status: 'planned',
                        updatedAt: Date.now()
                    }
                },
                { new: true }
            ).select('-__v');

            res.status(200).json({
                success: true,
                message: 'Itinerary generated successfully',
                data: {
                    trip: updatedTrip,
                    aiResponse: aiItinerary.rawResponse
                }
            });

        } catch (error) {
            console.error('Error generating itinerary:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate itinerary',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get hotel details
    async getHotelDetails(req, res) {
        try {
            const { tripId, hotelId } = req.params;
            const userId = req.userId;

            // Verify trip ownership
            const trip = await Trip.findOne({ _id: tripId, userId });
            if (!trip) {
                return res.status(404).json({
                    success: false,
                    message: 'Trip not found'
                });
            }

            // Get hotel details from API
            const hotelDetails = await hotelService.getHotelDetails(hotelId);

            res.status(200).json({
                success: true,
                data: {
                    hotel: hotelDetails
                }
            });

        } catch (error) {
            console.error('Error getting hotel details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get hotel details'
            });
        }
    }

    // Get all trips for a user
    async getUserTrips(req, res) {
        try {
            const userId = req.userId;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const status = req.query.status;

            // Build query
            const query = { userId };
            if (status) query.status = status;

            // Execute query with pagination
            const trips = await Trip.find(query)
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .select('-__v');

            const total = await Trip.countDocuments(query);

            res.status(200).json({
                success: true,
                data: {
                    trips,
                    pagination: {
                        page,
                        limit,
                        total,
                        pages: Math.ceil(total / limit)
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching user trips:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Get specific trip by ID
    async getTripById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;

            const trip = await Trip.findOne({ _id: id, userId }).select('-__v');

            if (!trip) {
                return res.status(404).json({
                    success: false,
                    message: 'Trip not found'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    trip
                }
            });

        } catch (error) {
            console.error('Error fetching trip:', error);

            // Handle invalid ObjectId
            if (error.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid trip ID format'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Update trip
    async updateTrip(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { id } = req.params;
            const userId = req.userId;
            const updateData = req.body;

            // Find and update trip
            const trip = await Trip.findOneAndUpdate(
                { _id: id, userId },
                {
                    $set: {
                        tripDetails: updateData.tripDetails,
                        generatedRoute: updateData.generatedRoute,
                        status: updateData.status,
                        updatedAt: Date.now()
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            ).select('-__v');

            if (!trip) {
                return res.status(404).json({
                    success: false,
                    message: 'Trip not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Trip updated successfully',
                data: {
                    trip
                }
            });

        } catch (error) {
            console.error('Error updating trip:', error);

            if (error.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid trip ID format'
                });
            }

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: Object.values(error.errors).map(err => ({
                        field: err.path,
                        message: err.message
                    }))
                });
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Delete trip
    async deleteTrip(req, res) {
        try {
            const { id } = req.params;
            const userId = req.userId;

            const trip = await Trip.findOneAndDelete({ _id: id, userId });

            if (!trip) {
                return res.status(404).json({
                    success: false,
                    message: 'Trip not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Trip deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting trip:', error);

            if (error.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid trip ID format'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Update trip status
    async updateTripStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userId = req.userId;

            const validStatuses = ['draft', 'planned', 'booked', 'completed', 'cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status value'
                });
            }

            const trip = await Trip.findOneAndUpdate(
                { _id: id, userId },
                {
                    status,
                    updatedAt: Date.now()
                },
                { new: true }
            ).select('-__v');

            if (!trip) {
                return res.status(404).json({
                    success: false,
                    message: 'Trip not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Trip status updated successfully',
                data: {
                    trip
                }
            });

        } catch (error) {
            console.error('Error updating trip status:', error);

            if (error.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid trip ID format'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
}

module.exports = new TripController();