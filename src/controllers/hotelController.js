// src/controllers/hotelController.js
const Hotel = require('../models/Hotel');
const hotelService = require('../services/hotelService');
const { validationResult } = require('express-validator');

class HotelController {
    // Search hotels by location and dates
    async searchHotels(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                location,
                checkIn,
                checkOut,
                guests = 2,
                rooms = 1,
                radius = 10,
                minRating = 0,
                maxPrice,
                amenities = []
            } = req.body;

            // Check if hotels exist in database for this location
            let hotels = await Hotel.findByLocation(location, {
                checkIn,
                checkOut,
                guests,
                rooms,
                radius,
                minRating,
                maxPrice,
                amenities
            });

            // If no hotels found in database, search via service (external API)
            if (!hotels || hotels.length === 0) {
                const searchResults = await hotelService.searchAlternativeHotels(location, {
                    travelers: guests,
                    rooms,
                    checkIn,
                    checkOut
                });

                hotels = searchResults.slice(0, 10); // Limit to 10 results
            }

            res.status(200).json({
                success: true,
                message: 'Hotels retrieved successfully',
                data: {
                    hotels,
                    count: hotels.length,
                    searchParams: {
                        location,
                        checkIn,
                        checkOut,
                        guests,
                        rooms
                    }
                }
            });

        } catch (error) {
            console.error('Error searching hotels:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search hotels',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }

    // Get specific hotel details
    async getHotelDetails(req, res) {
        try {
            const { id } = req.params;

            // First check in database
            let hotel = await Hotel.findById(id);

            // If not found in database, try service
            if (!hotel) {
                try {
                    hotel = await hotelService.getHotelDetails(id);
                } catch (serviceError) {
                    return res.status(404).json({
                        success: false,
                        message: 'Hotel not found'
                    });
                }
            }

            res.status(200).json({
                success: true,
                message: 'Hotel details retrieved successfully',
                data: { hotel }
            });

        } catch (error) {
            console.error('Error getting hotel details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get hotel details',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }

    // Verify GPT-recommended hotels against TSS Travelsoft API
    async verifyHotels(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const { hotels, tripDetails } = req.body;

            if (!Array.isArray(hotels) || hotels.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Hotels array is required and cannot be empty'
                });
            }

            // Validate required trip details
            const requiredFields = ['travelers', 'rooms'];
            const missingFields = requiredFields.filter(field => !tripDetails[field]);

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required trip details: ${missingFields.join(', ')}`
                });
            }

            // Verify hotels using the service
            const verifiedHotels = await hotelService.verifyAndSearchHotels(hotels, tripDetails);

            // Save verified hotels to database for future reference
            for (const hotel of verifiedHotels) {
                if (hotel.verified && hotel.id) {
                    try {
                        await Hotel.createOrUpdate({
                            externalId: hotel.id,
                            name: hotel.name,
                            city: hotel.city || hotel.location,
                            country: hotel.country,
                            rating: hotel.rating,
                            price: hotel.price,
                            amenities: hotel.amenities || [],
                            description: hotel.description,
                            image: hotel.image,
                            lastVerified: new Date()
                        });
                    } catch (dbError) {
                        console.error('Error saving hotel to database:', dbError);
                        // Continue processing, don't fail the entire request
                    }
                }
            }

            res.status(200).json({
                success: true,
                message: 'Hotels verified successfully',
                data: {
                    verifiedHotels,
                    totalProcessed: hotels.length,
                    totalVerified: verifiedHotels.filter(h => h.verified).length,
                    totalWithAlternatives: verifiedHotels.filter(h => h.alternatives && h.alternatives.length > 0).length
                }
            });

        } catch (error) {
            console.error('Error verifying hotels:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to verify hotels',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }

    // Get alternative hotels when original unavailable
    async getAlternatives(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                location,
                checkIn,
                checkOut,
                guests = 2,
                rooms = 1,
                excludeHotelIds = [],
                limit = 5
            } = req.query;

            // First try to get alternatives from database
            let alternatives = await Hotel.findAlternatives(location, {
                checkIn,
                checkOut,
                guests,
                rooms,
                excludeIds: excludeHotelIds,
                limit
            });

            // If not enough alternatives in database, get from service
            if (alternatives.length < limit) {
                try {
                    const tripDetails = { travelers: parseInt(guests), rooms: parseInt(rooms) };
                    const serviceAlternatives = await hotelService.getAlternatives(
                        location,
                        checkIn,
                        checkOut,
                        tripDetails
                    );

                    // Filter out excluded hotels and merge with database results
                    const filteredServiceAlternatives = serviceAlternatives.filter(
                        hotel => !excludeHotelIds.includes(hotel.id)
                    );

                    alternatives = [...alternatives, ...filteredServiceAlternatives].slice(0, limit);
                } catch (serviceError) {
                    console.error('Error getting alternatives from service:', serviceError);
                    // Continue with database results only
                }
            }

            res.status(200).json({
                success: true,
                message: 'Alternative hotels retrieved successfully',
                data: {
                    alternatives,
                    count: alternatives.length,
                    searchParams: {
                        location,
                        checkIn,
                        checkOut,
                        guests,
                        rooms,
                        excludeHotelIds
                    }
                }
            });

        } catch (error) {
            console.error('Error getting alternative hotels:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get alternative hotels',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }

    // Check hotel availability
    async checkAvailability(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const { id } = req.params;
            const { checkIn, checkOut, guests, rooms } = req.body;

            // Check availability using service
            const availability = await hotelService.checkAvailability(
                id,
                checkIn,
                checkOut,
                guests,
                rooms
            );

            res.status(200).json({
                success: true,
                message: 'Availability checked successfully',
                data: {
                    hotelId: id,
                    availability,
                    searchParams: {
                        checkIn,
                        checkOut,
                        guests,
                        rooms
                    }
                }
            });

        } catch (error) {
            console.error('Error checking availability:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check availability',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }

    // Get hotels by multiple IDs (useful for cart/booking flow)
    async getHotelsByIds(req, res) {
        try {
            const { ids } = req.body;

            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Hotel IDs array is required and cannot be empty'
                });
            }

            const hotels = [];

            for (const id of ids) {
                try {
                    // Try database first
                    let hotel = await Hotel.findById(id);

                    // If not in database, try service
                    if (!hotel) {
                        hotel = await hotelService.getHotelDetails(id);
                    }

                    if (hotel) {
                        hotels.push(hotel);
                    }
                } catch (error) {
                    console.error(`Error getting hotel ${id}:`, error);
                    // Continue with other hotels
                }
            }

            res.status(200).json({
                success: true,
                message: 'Hotels retrieved successfully',
                data: {
                    hotels,
                    requested: ids.length,
                    found: hotels.length
                }
            });

        } catch (error) {
            console.error('Error getting hotels by IDs:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get hotels',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    }
}

module.exports = new HotelController();