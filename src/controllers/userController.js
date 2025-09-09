const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Contact = require("../models/Contact");
const axios = require("axios");
require("dotenv").config();

const CLERK_API_BASE = "https://api.clerk.dev/v1";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

const ERROR_TYPES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  NOT_FOUND_ERROR: "NOT_FOUND_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  PAYMENT_ERROR: "PAYMENT_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR"
};

const createErrorResponse = (type, message, details = null) => {
  return {
    error: {
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    }
  };
};

const handleDatabaseError = (error, resource = "resource") => {
  console.error(`Database Error for ${resource}:`, error);
  
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map(err => err.message);
    return createErrorResponse(
      ERROR_TYPES.VALIDATION_ERROR, 
      `Validation failed for ${resource}`, 
      errors
    );
  }
  
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return createErrorResponse(
      ERROR_TYPES.VALIDATION_ERROR, 
      `${field} already exists`, 
      { duplicateField: field, value: error.keyValue[field] }
    );
  }
  
  return createErrorResponse(
    ERROR_TYPES.DATABASE_ERROR, 
    `Database operation failed for ${resource}`
  );
};


exports.signup = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, whatsappNumber } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Missing required fields: email, password, firstName, lastName are required"
        )
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Email already exists", 
          { email }
        )
      );
    }

    const user = await User.create({ email, password, firstName, lastName, phoneNumber, whatsappNumber });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({ 
      success: true,
      message: "User created successfully",
      token, 
      user: formatUserResponse(user) 
    });
  } catch (err) {
    console.error("Signup Error:", err);

    if (err.name === "ValidationError") {
      const errorResponse = handleDatabaseError(err, "user");
      return res.status(400).json(errorResponse);
    }

    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.DATABASE_ERROR, 
        "Signup failed due to server error"
      )
    );
  }
};


// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Email and password are required"
        )
      );
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json(
        createErrorResponse(
          ERROR_TYPES.AUTHENTICATION_ERROR, 
          "Invalid email or password", 
          { hint: "No user found with this email" }
        )
      );
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    
    res.status(200).json({ 
      success: true,
      message: "Login successful",
      token, 
      user: formatUserResponse(user) 
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.DATABASE_ERROR, 
        "Login failed due to server error"
      )
    );
  }
};


exports.getProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Invalid user ID format"
        )
      );
    }


    // User check karo
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json(
        createErrorResponse(
          ERROR_TYPES.NOT_FOUND_ERROR, 
          "User not found", 
          { userId }
        )
      );
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    
    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.DATABASE_ERROR, 
        "Failed to fetch user profile"
      )
    );
  }
};

exports.updateProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Validate userId format
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Invalid user ID format"
        )
      );
    }

    // Find profile by userId (string)
    const profile = await User.findById(userId);
    if (!profile) {
      return res.status(404).json(
        createErrorResponse(
          ERROR_TYPES.NOT_FOUND_ERROR, 
          "Profile not found", 
          { userId }
        )
      );
    }

    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    // Only update allowed fields
    const { firstName, lastName, email, phoneNumber, address, birthDate } = req.body;

    if (email && email !== profile.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json(
          createErrorResponse(
            ERROR_TYPES.VALIDATION_ERROR, 
            "Email already exists", 
            { email }
          )
        );
      }
    }

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
      // console.log('Image saved at:', filePath);
    }
    
    profile.updatedAt = Date.now();
    await profile.save();
    res.json({ 
      success: true,
      message: 'Profile updated successfully', 
      data: profile 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.name === "ValidationError") {
      const errorResponse = handleDatabaseError(error, "profile");
      return res.status(400).json(errorResponse);
    }
    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.DATABASE_ERROR, 
        "Failed to update profile"
      )
    );
  }
};

exports.pay = async (req, res) => {
  try {
    const stripeSecret = process.env.STRIPE_SECRET;
    if (!stripeSecret) {
      return res.status(500).json(
        createErrorResponse(
          ERROR_TYPES.EXTERNAL_SERVICE_ERROR, 
          "Payment service not configured"
        )
      );
    }

    const { travelerDetails, paymentDetails, bookingDetails } = req.body;
      
    if (!travelerDetails || !paymentDetails || !bookingDetails) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Missing required payment data", 
          { missingFields: ["travelerDetails", "paymentDetails", "bookingDetails"].filter(
            field => !req.body[field]
          )}
        )
      );
    }

    const requiredTravelerFields = ["firstName", "lastName", "email"];
    const missingTravelerFields = requiredTravelerFields.filter(
      field => !travelerDetails[field]
    );
    
    if (missingTravelerFields.length > 0) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Missing traveler details", 
          { missingFields: missingTravelerFields }
        )
      );
    }

    // Validate phone details
    if (!travelerDetails.phone || !travelerDetails.phone.countryCode || !travelerDetails.phone.number) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Missing phone details", 
          { missingFields: ["phone.countryCode", "phone.number"] }
        )
      );
    }

    // Validate payment details
    if (paymentDetails.method !== 'card') {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Only card payments are supported currently", 
          { supportedMethods: ["card"] }
        )
      );
    }

    if (!paymentDetails.stripeToken) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Stripe token is required for card payments"
        )
      );
    }

    // Validate booking details
    if (!bookingDetails.totalPrice || !bookingDetails.reservations) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Missing booking details", 
          { missingFields: ["totalPrice", "reservations"].filter(
            field => !bookingDetails[field]
          )}
        )
      );
    }

    // Stripe expects amount in cents
    const amountCents = Math.round(parseFloat(bookingDetails.totalPrice) * 100);
    
    if (isNaN(amountCents) || amountCents <= 0) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Invalid total price", 
          { totalPrice: bookingDetails.totalPrice }
        )
      );
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
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.PAYMENT_ERROR, 
          "Payment failed", 
          {
            details: stripeError.message || 'Stripe payment error',
            code: stripeError.code,
            type: stripeError.type
          }
        )
      );
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json(
        createErrorResponse(
          ERROR_TYPES.EXTERNAL_SERVICE_ERROR, 
          "Payment service temporarily unavailable"
        )
      );
    }
    
    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.PAYMENT_ERROR, 
        "Payment processing failed"
      )
    );
  }
};


exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "User ID is required"
        )
      );
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Invalid user ID format"
        )
      );
    }

    // Find bookings by userId
    const bookings = await Booking.find({ userId: id });

    if (bookings.length === 0) {
      return res.status(404).json(
        createErrorResponse(
          ERROR_TYPES.NOT_FOUND_ERROR, 
          "No bookings found for this user", 
          { userId: id }
        )
      );
    }

    res.json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.DATABASE_ERROR, 
        "Failed to fetch bookings"
      )
    );
  }
};

exports.createContact = async (req, res) => {
  try {
    const { name, email, phone, help } = req.body;

    const requiredFields = ["name", "email", "help"];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json(
        createErrorResponse(
          ERROR_TYPES.VALIDATION_ERROR, 
          "Missing required fields", 
          { missingFields }
        )
      );
    }

    

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
      const errorResponse = handleDatabaseError(err, "contact");
      return res.status(400).json(errorResponse);
    }

    // Generic error response
    res.status(500).json(
      createErrorResponse(
        ERROR_TYPES.DATABASE_ERROR, 
        "Failed to submit contact form"
      )
    );
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
