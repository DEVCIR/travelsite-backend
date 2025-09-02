const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');
const upload = require('../middleware/upload');

// Public routes
router.post('/signup', userController.signup);
router.post('/login', userController.login);

router.post('/contact', userController.createContact)

// Protected routes
router.use(authenticate);

router.get('/profile/:userId', userController.getProfileByUserId);
router.post('/bookingDetails', userController.getBookingDetails);
router.post('/profile/:userId', upload.single('profileImage'), userController.updateProfileByUserId);
// router.put('/contact-info', userController.updateContactInfo);

module.exports = router;
