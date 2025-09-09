const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');

// Protected routes
router.use(authenticate);

router.post('/pay', userController.pay);

module.exports = router;
