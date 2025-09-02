const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  location: {
    type: String,
    required: true
  },
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  arrivalDate: { type: Date },
  departureDate: { type: Date },
  hotelRequired: { type: Boolean, default: true }
});

const tripSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  tripDetails: {
    startDate: {
      type: Date,
      required: true
    },
    fromLocation: {
      type: String,
      required: true
    },
    toDestination: {
      type: String,
      required: true
    },
    stops: [stopSchema],
    maxDrivingDistance: {
      type: Number,
      required: true,
      default: 500 // kilometers per day
    },
    evRange: {
      type: Number,
      required: true,
      default: 300 // kilometers
    },
    hotelRequired: {
      type: Boolean,
      default: true
    },
    travelers: {
      type: Number,
      default: 2
    },
    rooms: {
      type: Number,
      default: 1
    }
  },
  generatedRoute: {
    totalDistance: { type: Number },
    totalDuration: { type: Number },
    waypoints: [{
      location: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      },
      distanceFromPrevious: Number,
      chargingStationRequired: Boolean
    }],
    hotels: [{
      name: String,
      location: String,
      checkIn: Date,
      checkOut: Date,
      verified: { type: Boolean, default: false }
    }],
    chargingStations: [{
      name: String,
      location: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      },
      connectorTypes: [String]
    }]
  },
  status: {
    type: String,
    enum: ['draft', 'planned', 'booked', 'completed', 'cancelled'],
    default: 'draft'
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
tripSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
tripSchema.index({ userId: 1, createdAt: -1 });
tripSchema.index({ status: 1 });

module.exports = mongoose.model('Trip', tripSchema);