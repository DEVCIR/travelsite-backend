const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Contact = require("../models/Contact");
const axios = require("axios");
require("dotenv").config();

const CLERK_API_BASE = "https://api.clerk.dev/v1";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

exports.signup = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, whatsappNumber } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "Email already exists" });
    const user = await User.create({ email, password, firstName, lastName, phoneNumber, whatsappNumber });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({ token, user: formatUserResponse(user) });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
};


// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({ token, user: formatUserResponse(user) });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Login failed" });
  }
};


exports.getProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    // User check karo
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Data not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

exports.updateProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    // Find profile by userId (string)
    const profile = await User.findById(userId);
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    // Only update allowed fields
    const { firstName, lastName, email, phoneNumber, address, birthDate } = req.body;
    if (firstName !== undefined) profile.firstName = firstName;
    if (lastName !== undefined) profile.lastName = lastName;
    if (email !== undefined) profile.email = email;
    if (phoneNumber !== undefined) profile.phoneNumber = phoneNumber;
    if (address !== undefined) profile.address = address;
    if (birthDate !== undefined) profile.birthDate = birthDate;

    // Handle profile image
    if (req.file) {
      // Convert backslashes to forward slashes for web URLs
      const filePath = req.file.path.replace(/\\/g, '/');
      profile.profileImage = filePath; // Save the file path in DB
      console.log('Image saved at:', filePath);
    }
    
    profile.updatedAt = Date.now();
    await profile.save();
    res.json({ message: 'Profile updated successfully', profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.pay = async (req, res) => {
  try {
    const stripeSecret = process.env.STRIPE_SECRET;
    if (!stripeSecret) {
      return res.status(500).json({ error: 'Stripe secret key not configured' });
    }

    const { travelerDetails, paymentDetails, bookingDetails } = req.body;
    
    console.log('Received payment data:', { travelerDetails, paymentDetails, bookingDetails });
    
    // Validate required data
    if (!travelerDetails || !paymentDetails || !bookingDetails) {
      return res.status(400).json({ error: 'Missing required payment data' });
    }

    // Validate traveler details
    if (!travelerDetails.firstName || !travelerDetails.lastName || !travelerDetails.email) {
      return res.status(400).json({ error: 'Missing traveler details (firstName, lastName, email)' });
    }

    // Validate phone details
    if (!travelerDetails.phone || !travelerDetails.phone.countryCode || !travelerDetails.phone.number) {
      return res.status(400).json({ error: 'Missing phone details' });
    }

    // Validate payment details
    if (paymentDetails.method !== 'card') {
      return res.status(400).json({ error: 'Only card payments are supported currently' });
    }

    if (!paymentDetails.stripeToken) {
      return res.status(400).json({ error: 'Stripe token is required for card payments' });
    }

    // Validate booking details
    if (!bookingDetails.totalPrice || !bookingDetails.reservations) {
      return res.status(400).json({ error: 'Missing booking details (totalPrice, reservations)' });
    }

    // Stripe expects amount in cents
    const amountCents = Math.round(parseFloat(bookingDetails.totalPrice) * 100);
    
    if (isNaN(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: 'Invalid total price' });
    }
    
    // Generate a unique order ID
    const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Safe string conversion function
    const safeToString = (value) => {
      return value !== undefined && value !== null ? String(value) : '';
    };

    // Prepare Stripe charge data with safe string conversion
    const chargeData = {
      'amount': amountCents,
      'currency': 'usd',
      'description': `Booking payment for ${safeToString(travelerDetails.firstName)} ${safeToString(travelerDetails.lastName)}`,
      'source': paymentDetails.stripeToken,
      'metadata[order_id]': orderId,
      'metadata[customer_email]': safeToString(travelerDetails.email),
      'metadata[customer_name]': `${safeToString(travelerDetails.firstName)} ${safeToString(travelerDetails.lastName)}`,
      'metadata[phone]': `${safeToString(travelerDetails.phone.countryCode)}${safeToString(travelerDetails.phone.number)}`,
      'metadata[total_price]': safeToString(bookingDetails.totalPrice),
      'metadata[reservations_count]': safeToString(Array.isArray(bookingDetails.reservations) ? bookingDetails.reservations.length : 0)
    };

    // Add billing address if zip code is provided
    if (paymentDetails.zipCode) {
      chargeData['metadata[billing_zip]'] = safeToString(paymentDetails.zipCode);
    }

    console.log('Stripe charge data:', chargeData);

    const chargeRes = await axios.post(
      'https://api.stripe.com/v1/charges',
      new URLSearchParams(chargeData),
      {
        headers: {
          'Authorization': `Bearer ${stripeSecret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // Save booking data to database
    const bookingData = {
      orderId: orderId,
      stripeChargeId: chargeRes.data.id,
      userId: bookingDetails.userId,
      amount: chargeRes.data.amount,
      currency: chargeRes.data.currency,
      paymentStatus: chargeRes.data.status,
      paymentMethod: paymentDetails.method,
      customerEmail: travelerDetails.email,
      customerName: `${travelerDetails.firstName} ${travelerDetails.lastName}`,
      customerPhone: `${travelerDetails.phone.countryCode}${travelerDetails.phone.number}`,
      billingZip: paymentDetails.zipCode || null,
      totalPrice: bookingDetails.totalPrice,
      reservations: bookingDetails.reservations,
      stripeMetadata: new Map(Object.entries(chargeData).filter(([key]) => key.startsWith('metadata['))),
      chargeCreated: new Date(chargeRes.data.created * 1000) // Convert Unix timestamp to Date
    };

    const savedBooking = await Booking.create(bookingData);
    console.log('Booking saved to database:', savedBooking._id);

    // Prepare response with booking details
    const response = {
      message: 'Payment successful',
      bookingId: savedBooking._id,
      orderId: orderId,
      paymentTime: new Date(chargeRes.data.created * 1000),
      paymentMethod: paymentDetails.method,
      senderName: `${travelerDetails.firstName} ${travelerDetails.lastName}`,
      totalPrice: bookingDetails.totalPrice
    };

    res.json(response);
  } catch (error) {
    console.error('Stripe payment error:', error.response?.data || error.message);
    
    // Handle specific Stripe errors
    if (error.response?.data?.error) {
      const stripeError = error.response.data.error;
      return res.status(400).json({
        error: 'Payment failed',
        details: stripeError.message || 'Stripe payment error',
        code: stripeError.code
      });
    }
    
    res.status(500).json({
      error: 'Payment failed',
      details: error.message || 'Internal server error'
    });
  }
};


exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.body;

    // Find bookings by userId
    const bookings = await Booking.find({ userId: id });

    if (bookings.length === 0) {
      return res.status(404).json([]);
    }

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

exports.createContact = async (req, res) => {
  try {
    const { name, email, phone, help } = req.body;

    // Create new contact entry
    const contact = await Contact.create({ 
      name, 
      email, 
      phone, 
      help 
    });

    // Successful response
    res.status(201).json({
      success: true,
      message: "Contact form submitted successfully",
      data: contact
    });

  } catch (err) {
    console.error("Contact submission error:", err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Failed to submit contact form",
      error: err.message
    });
  }
};


function formatUserResponse(user) {
  return {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    whatsappNumber: user.whatsappNumber,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
