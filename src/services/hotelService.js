const axios = require('axios');
const config = require('../config/database');
const Hotel = require('../models/Hotel');
const HotelSearchCache = require('../models/hotelSearchCache');

class HotelService {
  constructor() {
    // TSS Travelsoft API configuration
    this.tssApiUrl = process.env.TSS_API_URL || 'https://api.tsstravelsoft.com';
    this.tssApiKey = process.env.TSS_API_KEY;
    this.tssUserId = process.env.TSS_USER_ID;
    
    // Configure axios instance for TSS API
    this.tssApi = axios.create({
      baseURL: this.tssApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.tssApiKey}`,
        'User-Agent': 'EVF-Trip-Planner/1.0'
      }
    });
  }

  // Search hotels by location and dates
  async searchHotels({ location, checkIn, checkOut, rooms = 1, guests = 1 }) {
    try {
      // Check cache first
      const cachedResult = await HotelSearchCache.findValidCache({
        location, checkIn, checkOut, rooms, guests
      });
      
      if (cachedResult) {
        await cachedResult.recordHit();
        return {
          hotels: cachedResult.results.hotels,
          total: cachedResult.results.totalResults,
          source: 'cache'
        };
      }

      const searchPayload = {
        destination: location,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        rooms: [
          {
            adults: guests,
            children: 0
          }
        ],
        currency: 'EUR',
        nationality: 'DE'
      };

      const startTime = Date.now();
      const response = await this.tssApi.post('/hotels/search', searchPayload);
      const responseTime = Date.now() - startTime;
      
      if (response.data && response.data.hotels) {
        const formattedHotels = this.formatHotelResults(response.data.hotels);
        
        // Cache the results
        await HotelSearchCache.createOrUpdateCache(
          { location, checkIn, checkOut, rooms, guests },
          {
            hotels: formattedHotels,
            totalResults: response.data.totalResults || formattedHotels.length,
            searchTimestamp: new Date()
          },
          2 // Cache for 2 hours
        );
        
        // Update/create hotel records in database
        await this.updateOrCreateHotels(formattedHotels);
        
        return {
          hotels: formattedHotels,
          total: response.data.totalResults || formattedHotels.length,
          source: 'api',
          responseTime
        };
      }

      return { hotels: [], total: 0, source: 'api' };

    } catch (error) {
      console.error('TSS API search error:', error.response?.data || error.message);
      
      // Fallback to database search if API fails
      const fallbackResults = await this.searchHotelsFromDatabase({ location, checkIn, checkOut });
      
      if (fallbackResults.hotels.length > 0) {
        return {
          ...fallbackResults,
          source: 'fallback'
        };
      }
      
      throw new Error('Failed to search hotels via TSS API');
    }
  }

  // Get hotel details by ID
  async getHotelById(hotelId) {
    try {
      // First check our database
      let hotel = await Hotel.findOne({ 
        $or: [
          { hotelId: hotelId },
          { 'tssData.tssHotelId': hotelId }
        ],
        status: 'active'
      });
      
      if (hotel) {
        return this.formatHotelDetails(hotel.toObject());
      }

      // If not in database, fetch from TSS API
      const response = await this.tssApi.get(`/hotels/${hotelId}`);
      
      if (response.data && response.data.hotel) {
        const formattedHotel = this.formatHotelDetails(response.data.hotel);
        
        // Save to database for future use
        await this.updateOrCreateHotel(formattedHotel, response.data.hotel);
        
        return formattedHotel;
      }

      return null;

    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('TSS API get hotel error:', error.response?.data || error.message);
      throw new Error('Failed to retrieve hotel details');
    }
  }

  // Verify GPT-recommended hotels against TSS API
  async verifyRecommendedHotels({ hotels, location, checkIn, checkOut }) {
    const results = {
      verified: [],
      alternatives: [],
      unavailable: []
    };

    for (const recommendedHotel of hotels) {
      try {
        // Search for the recommended hotel by name and location
        const searchResult = await this.searchHotelByName({
          hotelName: recommendedHotel.name,
          location,
          checkIn,
          checkOut
        });

        if (searchResult.found) {
          // Hotel found and available
          results.verified.push({
            original: recommendedHotel,
            verified: searchResult.hotel,
            status: 'verified',
            confidence: searchResult.confidence
          });
        } else {
          // Hotel not found, get alternatives
          const alternatives = await this.getAlternativeHotels({
            originalHotelName: recommendedHotel.name,
            location,
            checkIn,
            checkOut,
            starRating: recommendedHotel.starRating,
            limit: 3
          });

          if (alternatives.length > 0) {
            results.alternatives.push({
              original: recommendedHotel,
              alternatives: alternatives,
              status: 'alternatives_found'
            });
          } else {
            results.unavailable.push({
              original: recommendedHotel,
              status: 'unavailable',
              reason: 'No suitable alternatives found'
            });
          }
        }

      } catch (error) {
        console.error(`Error verifying hotel ${recommendedHotel.name}:`, error.message);
        results.unavailable.push({
          original: recommendedHotel,
          status: 'error',
          reason: error.message
        });
      }
    }

    return results;
  }

  // Search for hotel by name
  async searchHotelByName({ hotelName, location, checkIn, checkOut }) {
    try {
      const searchResults = await this.searchHotels({
        location,
        checkIn,
        checkOut
      });

      // Find exact or close match
      const exactMatch = searchResults.hotels.find(hotel => 
        hotel.name.toLowerCase() === hotelName.toLowerCase()
      );

      if (exactMatch) {
        return {
          found: true,
          hotel: exactMatch,
          confidence: 1.0
        };
      }

      // Find partial match
      const partialMatch = searchResults.hotels.find(hotel =>
        hotel.name.toLowerCase().includes(hotelName.toLowerCase()) ||
        hotelName.toLowerCase().includes(hotel.name.toLowerCase())
      );

      if (partialMatch) {
        return {
          found: true,
          hotel: partialMatch,
          confidence: 0.8
        };
      }

      return { found: false, confidence: 0 };

    } catch (error) {
      throw new Error(`Failed to search hotel by name: ${error.message}`);
    }
  }

  // Get alternative hotels
  async getAlternativeHotels({ 
    originalHotelName, 
    location, 
    checkIn, 
    checkOut, 
    priceRange,
    starRating,
    limit = 5 
  }) {
    try {
      const searchResults = await this.searchHotels({
        location,
        checkIn,
        checkOut
      });

      let alternatives = searchResults.hotels.filter(hotel => 
        hotel.name.toLowerCase() !== originalHotelName.toLowerCase()
      );

      // Filter by star rating if provided
      if (starRating) {
        const ratingRange = 0.5; // Allow ±0.5 star difference
        alternatives = alternatives.filter(hotel => 
          Math.abs(hotel.starRating - starRating) <= ratingRange
        );
      }

      // Filter by price range if provided
      if (priceRange) {
        alternatives = alternatives.filter(hotel => {
          const price = hotel.price?.amount || 0;
          return price >= priceRange.min && price <= priceRange.max;
        });
      }

      // Sort by rating and reviews
      alternatives.sort((a, b) => {
        const aScore = (a.starRating || 0) * 0.7 + (a.reviewScore || 0) * 0.3;
        const bScore = (b.starRating || 0) * 0.7 + (b.reviewScore || 0) * 0.3;
        return bScore - aScore;
      });

      return alternatives.slice(0, limit);

    } catch (error) {
      throw new Error(`Failed to get alternative hotels: ${error.message}`);
    }
  }

  // Check hotel availability
  async checkHotelAvailability({ hotelId, checkIn, checkOut, rooms = 1, guests = 1 }) {
    try {
      const availabilityPayload = {
        hotelId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        rooms: [
          {
            adults: guests,
            children: 0
          }
        ]
      };

      const response = await this.tssApi.post('/hotels/availability', availabilityPayload);
      
      if (response.data) {
        return {
          available: response.data.available || false,
          rooms: response.data.availableRooms || [],
          pricing: response.data.pricing || {},
          restrictions: response.data.restrictions || {}
        };
      }

      return { available: false, rooms: [], pricing: {}, restrictions: {} };

    } catch (error) {
      console.error('TSS API availability error:', error.response?.data || error.message);
      throw new Error('Failed to check hotel availability');
    }
  }

  // Search hotels from database (fallback method)
  async searchHotelsFromDatabase({ location, checkIn, checkOut }) {
    try {
      const hotels = await Hotel.find({
        $or: [
          { 'location.city': new RegExp(location, 'i') },
          { 'location.address': new RegExp(location, 'i') }
        ],
        status: 'active',
        availability: 'available'
      }).limit(20);

      return {
        hotels: hotels.map(hotel => this.formatHotelDetails(hotel.toObject())),
        total: hotels.length
      };
    } catch (error) {
      console.error('Database search error:', error.message);
      return { hotels: [], total: 0 };
    }
  }

  // Update or create multiple hotels in database
  async updateOrCreateHotels(hotels) {
    try {
      const updatePromises = hotels.map(hotel => this.updateOrCreateHotel(hotel));
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error updating hotels in database:', error.message);
    }
  }

  // Update or create a single hotel in database
  async updateOrCreateHotel(formattedHotel, tssData = null) {
    try {
      const hotelData = {
        hotelId: formattedHotel.id,
        name: formattedHotel.name,
        location: formattedHotel.location,
        starRating: formattedHotel.starRating,
        reviewScore: formattedHotel.reviewScore,
        reviewCount: formattedHotel.reviewCount,
        description: formattedHotel.description,
        amenities: formattedHotel.amenities,
        images: formattedHotel.images,
        policies: formattedHotel.policies,
        contact: formattedHotel.contact,
        status: 'active',
        lastUpdated: new Date()
      };

      if (tssData) {
        hotelData.tssData = tssData;
      }

      await Hotel.findOneAndUpdate(
        { hotelId: formattedHotel.id },
        hotelData,
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error updating hotel in database:', error.message);
    }
  }

  // Helper method to format hotel results
  formatHotelResults(hotels) {
    return hotels.map(hotel => ({
      id: hotel.id || hotel.hotelId,
      name: hotel.name || hotel.hotelName,
      location: {
        address: hotel.address,
        city: hotel.city,
        country: hotel.country,
        coordinates: {
          latitude: hotel.latitude,
          longitude: hotel.longitude
        }
      },
      starRating: hotel.starRating || hotel.category,
      reviewScore: hotel.reviewScore || hotel.rating,
      reviewCount: hotel.reviewCount || hotel.numberOfReviews,
      price: {
        amount: hotel.price?.total || hotel.totalPrice,
        currency: hotel.price?.currency || 'EUR',
        perNight: hotel.price?.perNight || hotel.pricePerNight
      },
      amenities: hotel.amenities || hotel.facilities || [],
      images: hotel.images || hotel.photos || [],
      description: hotel.description || hotel.hotelDescription,
      distance: hotel.distance,
      availability: hotel.availability || 'available'
    }));
  }

  // Helper method to format hotel details
  formatHotelDetails(hotel) {
    return {
      id: hotel.id || hotel.hotelId,
      name: hotel.name || hotel.hotelName,
      location: {
        address: hotel.address,
        city: hotel.city,
        country: hotel.country,
        coordinates: {
          latitude: hotel.latitude,
          longitude: hotel.longitude
        }
      },
      starRating: hotel.starRating || hotel.category,
      reviewScore: hotel.reviewScore || hotel.rating,
      reviewCount: hotel.reviewCount || hotel.numberOfReviews,
      description: hotel.description || hotel.hotelDescription,
      amenities: hotel.amenities || hotel.facilities || [],
      images: hotel.images || hotel.photos || [],
      rooms: hotel.rooms || [],
      policies: {
        checkIn: hotel.checkInTime || '15:00',
        checkOut: hotel.checkOutTime || '11:00',
        cancellation: hotel.cancellationPolicy,
        children: hotel.childPolicy,
        pets: hotel.petPolicy
      },
      contact: {
        phone: hotel.phone,
        email: hotel.email,
        website: hotel.website
      }
    };
  }
}

module.exports = new HotelService();