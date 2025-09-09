const mongoose = require('mongoose');

// Hotel Search Cache Schema - for caching TSS API responses
const hotelSearchCacheSchema = new mongoose.Schema({
    // Search Parameters (used as cache key)
    searchKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    searchParams: {
        location: {
            type: String,
            required: true,
            trim: true
        },
        checkIn: {
            type: Date,
            required: true
        },
        checkOut: {
            type: Date,
            required: true
        },
        rooms: {
            type: Number,
            default: 1
        },
        guests: {
            type: Number,
            default: 1
        },
        additionalFilters: {
            minRating: Number,
            maxPrice: Number,
            amenities: [String],
            hotelChain: String
        }
    },

    // Cached Response Data
    results: {
        hotels: [{
            hotelId: String,
            name: String,
            location: {
                address: String,
                city: String,
                country: String,
                coordinates: {
                    latitude: Number,
                    longitude: Number
                }
            },
            starRating: Number,
            reviewScore: Number,
            reviewCount: Number,
            price: {
                amount: Number,
                currency: String,
                perNight: Number
            },
            amenities: [String],
            images: [String],
            availability: String,
            distance: Number
        }],
        totalResults: {
            type: Number,
            default: 0
        },
        searchTimestamp: {
            type: Date,
            default: Date.now
        }
    },

    // Cache Metadata
    cacheMetadata: {
        source: {
            type: String,
            enum: ['tss_api', 'fallback', 'manual'],
            default: 'tss_api'
        },
        responseTime: {
            type: Number, // in milliseconds
            default: 0
        },
        apiVersion: {
            type: String,
            default: '1.0'
        },
        hitCount: {
            type: Number,
            default: 0
        },
        lastAccessed: {
            type: Date,
            default: Date.now
        }
    },

    // TTL and Expiration
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // MongoDB TTL index
    },

    isExpired: {
        type: Boolean,
        default: false
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'expired', 'invalid'],
        default: 'active',
        index: true
    }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound indexes for efficient querying
hotelSearchCacheSchema.index({
    'searchParams.location': 1,
    'searchParams.checkIn': 1,
    'searchParams.checkOut': 1
});

hotelSearchCacheSchema.index({
    searchKey: 1,
    status: 1,
    expiresAt: 1
});

// Virtual to check if cache is still valid
hotelSearchCacheSchema.virtual('isValid').get(function () {
    return this.status === 'active' &&
        !this.isExpired &&
        new Date() < this.expiresAt;
});

// Static method to generate search key
hotelSearchCacheSchema.statics.generateSearchKey = function (searchParams) {
    const { location, checkIn, checkOut, rooms, guests, additionalFilters } = searchParams;

    const keyParts = [
        location.toLowerCase().replace(/\s+/g, '-'),
        new Date(checkIn).toISOString().split('T')[0],
        new Date(checkOut).toISOString().split('T')[0],
        `r${rooms || 1}`,
        `g${guests || 1}`
    ];

    // Add additional filters to key if present
    if (additionalFilters) {
        if (additionalFilters.minRating) {
            keyParts.push(`minr${additionalFilters.minRating}`);
        }
        if (additionalFilters.maxPrice) {
            keyParts.push(`maxp${additionalFilters.maxPrice}`);
        }
        if (additionalFilters.hotelChain) {
            keyParts.push(`chain${additionalFilters.hotelChain.toLowerCase()}`);
        }
    }

    return keyParts.join('_');
};

// Static method to find valid cache
hotelSearchCacheSchema.statics.findValidCache = function (searchParams) {
    const searchKey = this.generateSearchKey(searchParams);

    return this.findOne({
        searchKey,
        status: 'active',
        isExpired: false,
        expiresAt: { $gt: new Date() }
    });
};

// Static method to create or update cache
hotelSearchCacheSchema.statics.createOrUpdateCache = function (searchParams, results, ttlHours = 2) {
    const searchKey = this.generateSearchKey(searchParams);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    return this.findOneAndUpdate(
        { searchKey },
        {
            searchKey,
            searchParams,
            results,
            expiresAt,
            status: 'active',
            isExpired: false,
            $inc: { 'cacheMetadata.hitCount': 1 },
            $set: { 'cacheMetadata.lastAccessed': new Date() }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
};

// Instance method to increment hit count
hotelSearchCacheSchema.methods.recordHit = function () {
    this.cacheMetadata.hitCount += 1;
    this.cacheMetadata.lastAccessed = new Date();
    return this.save();
};

// Instance method to check if cache needs refresh
hotelSearchCacheSchema.methods.needsRefresh = function (refreshThresholdHours = 1) {
    const refreshTime = new Date();
    refreshTime.setHours(refreshTime.getHours() - refreshThresholdHours);

    return this.cacheMetadata.lastAccessed < refreshTime ||
        this.updatedAt < refreshTime;
};

// Pre-save middleware to set expiration
hotelSearchCacheSchema.pre('save', function (next) {
    // Auto-expire cache for past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (this.searchParams.checkOut < today) {
        this.status = 'expired';
        this.isExpired = true;
    }

    next();
});

// Static method to cleanup expired cache
hotelSearchCacheSchema.statics.cleanupExpired = function () {
    return this.deleteMany({
        $or: [
            { expiresAt: { $lt: new Date() } },
            { status: 'expired' },
            { isExpired: true }
        ]
    });
};

// Static method to get cache statistics
hotelSearchCacheSchema.statics.getCacheStats = function () {
    return this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgHitCount: { $avg: '$cacheMetadata.hitCount' },
                totalHits: { $sum: '$cacheMetadata.hitCount' }
            }
        },
        {
            $group: {
                _id: null,
                totalEntries: { $sum: '$count' },
                statusBreakdown: {
                    $push: {
                        status: '$_id',
                        count: '$count',
                        avgHitCount: '$avgHitCount',
                        totalHits: '$totalHits'
                    }
                },
                overallHits: { $sum: '$totalHits' }
            }
        }
    ]);
};

const HotelSearchCache = mongoose.model('HotelSearchCache', hotelSearchCacheSchema);

module.exports = HotelSearchCache;