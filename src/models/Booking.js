const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Order and Payment Details
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  stripeChargeId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    unique: false
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'refunded'],
    default: 'succeeded'
  },
  paymentMethod: {
    type: String,
    required: true
  },

  // Customer Details
  customerEmail: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  billingZip: {
    type: String
  },

  // Booking Details
  totalPrice: {
    type: Number,
    required: true
  },
  reservations: [{
    // Add reservation details as needed
    type: mongoose.Schema.Types.Mixed
  }],

  // Metadata
  stripeMetadata: {
    type: Map,
    of: String
  },

  // Timestamps
  chargeCreated: {
    type: Date
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
bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Booking', bookingSchema); 