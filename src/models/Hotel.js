const mongoose = require('mongoose');

// Hotel Schema
const hotelSchema = new mongoose.Schema({
  // Basic Hotel Information
  hotelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 2000
  },
  
  // Location Information
  location: {
    address: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    postalCode: {
      type: String,
      trim: true
    },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180
      }
    }
  },

  // Hotel Rating and Reviews
  starRating: {
    type: Number,
    min: 1,
    max: 5,
    index: true
  },
  reviewScore: {
    type: Number,
    min: 0,
    max: 10
  },
  reviewCount: {
    type: Number,
    min: 0,
    default: 0
  },

  // Pricing Information
  priceRange: {
    min: {
      type: Number,
      min: 0
    },
    max: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'EUR',
      uppercase: true,
      maxlength: 3
    }
  },

  // Hotel Amenities
  amenities: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: [
        'general',
        'business',
        'connectivity',
        'food_drink',
        'transportation',
        'activities',
        'services',
        'accessibility'
      ],
      default: 'general'
    },
    available: {
      type: Boolean,
      default: true
    }
  }],

  // Hotel Images
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: String,
    type: {
      type: String,
      enum: ['exterior', 'lobby', 'room', 'restaurant', 'amenity', 'other'],
      default: 'other'
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],

  // Room Types Available
  roomTypes: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    maxOccupancy: {
      type: Number,
      min: 1,
      max: 10
    },
    bedType: String,
    size: {
      value: Number,
      unit: {
        type: String,
        enum: ['sqm', 'sqft'],
        default: 'sqm'
      }
    },
    amenities: [String],
    basePrice: {
      amount: Number,
      currency: String
    }
  }],

  // Hotel Policies
  policies: {
    checkIn: {
      time: {
        type: String,
        default: '15:00'
      },
      instructions: String
    },
    checkOut: {
      time: {
        type: String,
        default: '11:00'
      },
      instructions: String
    },
    cancellation: {
      type: String,
      maxlength: 1000
    },
    children: {
      allowed: {
        type: Boolean,
        default: true
      },
      policy: String
    },
    pets: {
      allowed: {
        type: Boolean,
        default: false
      },
      policy: String,
      fee: Number
    },
    smoking: {
      allowed: {
        type: Boolean,
        default: false
      },
      policy: String
    }
  },

  // Contact Information
  contact: {
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    website: {
      type: String,
      trim: true
    },
    fax: {
      type: String,
      trim: true
    }
  },

  // TSS API Integration Fields
  tssData: {
    tssHotelId: String,
    lastSynced: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    contractDetails: {
      type: mongoose.Schema.Types.Mixed
    }
  },

  // Search and Verification Metadata
  searchMetadata: {
    searchTerms: [String], // Terms used to find this hotel
    verificationHistory: [{
      date: {
        type: Date,
        default: Date.now
      },
      originalQuery: String,
      confidence: {
        type: Number,
        min: 0,
        max: 1
      },
      verified: Boolean,
      verificationMethod: {
        type: String,
        enum: ['exact_match', 'partial_match', 'fuzzy_match', 'manual']
      }
    }],
    popularityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },

  // Availability Cache (for performance)
  availabilityCache: [{
    date: {
      type: Date,
      required: true
    },
    available: {
      type: Boolean,
      required: true
    },
    price: {
      amount: Number,
      currency: String
    },
    restrictions: mongoose.Schema.Types.Mixed,
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],

  // Status and Flags
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'suspended'],
    default: 'active',
    index: true
  },
  
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },

  // System Fields
  createdBy: {
    type: String,
    default: 'system'
  },
  
  lastModifiedBy: {
    type: String,
    default: 'system'
  }

}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
hotelSchema.index({ 'location.city': 1, 'location.country': 1 });
hotelSchema.index({ starRating: 1, reviewScore: -1 });
hotelSchema.index({ 'priceRange.min': 1, 'priceRange.max': 1 });
hotelSchema.index({ 'location.coordinates.latitude': 1, 'location.coordinates.longitude': 1 });
hotelSchema.index({ status: 1, isVerified: 1 });
hotelSchema.index({ 'tssData.tssHotelId': 1 });

// Compound indexes for common queries
hotelSchema.index({ 
  'location.city': 1, 
  'location.country': 1, 
  starRating: -1, 
  reviewScore: -1 
});

// Text index for search functionality
hotelSchema.index({
  name: 'text',
  description: 'text',
  'location.city': 'text',
  'location.address': 'text',
  'amenities.name': 'text'
});

// Virtual fields
hotelSchema.virtual('fullAddress').get(function() {
  const parts = [
    this.location.address,
    this.location.city,
    this.location.state,
    this.location.country
  ].filter(Boolean);
  return parts.join(', ');
});

hotelSchema.virtual('averagePrice').get(function() {
  if (this.priceRange && this.priceRange.min && this.priceRange.max) {
    return (this.priceRange.min + this.priceRange.max) / 2;
  }
  return null;
});

hotelSchema.virtual('primaryImage').get(function() {
  if (this.images && this.images.length > 0) {
    const primary = this.images.find(img => img.isPrimary);
    return primary || this.images[0];
  }
  return null;
});

// Instance Methods
hotelSchema.methods.updateAvailabilityCache = function(date, availability) {
  const existingIndex = this.availabilityCache.findIndex(
    cache => cache.date.toDateString() === new Date(date).toDateString()
  );
  
  if (existingIndex > -1) {
    this.availabilityCache[existingIndex] = {
      ...this.availabilityCache[existingIndex],
      ...availability,
      lastUpdated: new Date()
    };
  } else {
    this.availabilityCache.push({
      date: new Date(date),
      ...availability,
      lastUpdated: new Date()
    });
  }
  
  // Keep only last 90 days of cache
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  this.availabilityCache = this.availabilityCache.filter(
    cache => cache.date >= ninetyDaysAgo
  );
};

hotelSchema.methods.addVerificationRecord = function(query, confidence, verified, method = 'fuzzy_match') {
  this.searchMetadata.verificationHistory.push({
    originalQuery: query,
    confidence,
    verified,
    verificationMethod: method,
    date: new Date()
  });
  
  // Keep only last 50 verification records
  if (this.searchMetadata.verificationHistory.length > 50) {
    this.searchMetadata.verificationHistory = this.searchMetadata.verificationHistory.slice(-50);
  }
};

hotelSchema.methods.calculatePopularityScore = function() {
  let score = 0;
  
  // Base score from star rating (0-25 points)
  if (this.starRating) {
    score += (this.starRating / 5) * 25;
  }
  
  // Review score contribution (0-30 points)
  if (this.reviewScore) {
    score += (this.reviewScore / 10) * 30;
  }
  
  // Review count contribution (0-20 points)
  if (this.reviewCount) {
    score += Math.min((this.reviewCount / 1000) * 20, 20);
  }
  
  // Verification history success rate (0-15 points)
  if (this.searchMetadata.verificationHistory.length > 0) {
    const successRate = this.searchMetadata.verificationHistory.filter(h => h.verified).length / 
                       this.searchMetadata.verificationHistory.length;
    score += successRate * 15;
  }
  
  // Featured hotel bonus (0-10 points)
  if (this.isFeatured) {
    score += 10;
  }
  
  this.searchMetadata.popularityScore = Math.round(Math.min(score, 100));
  return this.searchMetadata.popularityScore;
};

// Static Methods
hotelSchema.statics.findByLocation = function(city, country, options = {}) {
  const query = {
    'location.city': new RegExp(city, 'i'),
    'location.country': new RegExp(country, 'i'),
    status: 'active'
  };
  
  if (options.minRating) {
    query.starRating = { $gte: options.minRating };
  }
  
  if (options.maxPrice) {
    query['priceRange.max'] = { $lte: options.maxPrice };
  }
  
  return this.find(query)
    .sort({ starRating: -1, reviewScore: -1, 'searchMetadata.popularityScore': -1 })
    .limit(options.limit || 50);
};

hotelSchema.statics.searchByName = function(name, location = null) {
  const query = {
    $text: { $search: name },
    status: 'active'
  };
  
  if (location) {
    query.$or = [
      { 'location.city': new RegExp(location, 'i') },
      { 'location.country': new RegExp(location, 'i') }
    ];
  }
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, starRating: -1 });
};

hotelSchema.statics.findAlternatives = function(originalHotel, criteria = {}) {
  const query = {
    _id: { $ne: originalHotel._id },
    'location.city': originalHotel.location.city,
    'location.country': originalHotel.location.country,
    status: 'active'
  };
  
  // Similar star rating (±1 star)
  if (originalHotel.starRating) {
    query.starRating = {
      $gte: Math.max(1, originalHotel.starRating - 1),
      $lte: Math.min(5, originalHotel.starRating + 1)
    };
  }
  
  // Price range filter
  if (criteria.priceRange) {
    query.$and = [
      { 'priceRange.min': { $gte: criteria.priceRange.min } },
      { 'priceRange.max': { $lte: criteria.priceRange.max } }
    ];
  }
  
  return this.find(query)
    .sort({ 
      starRating: -1, 
      reviewScore: -1, 
      'searchMetadata.popularityScore': -1 
    })
    .limit(criteria.limit || 5);
};

// Pre-save middleware
hotelSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.lastModifiedBy = this.lastModifiedBy || 'system';
    this.calculatePopularityScore();
  }
  next();
});

// Post-save middleware
hotelSchema.post('save', function(doc) {
  console.log(`Hotel ${doc.name} (${doc.hotelId}) has been saved/updated`);
});

const Hotel = mongoose.model('Hotel', hotelSchema);

module.exports = Hotel;