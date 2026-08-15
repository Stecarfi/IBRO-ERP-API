const express = require('express');
const router = express.Router();
const locationController = require('../controllers/location.controller');
const authenticateToken = require('../middlewares/auth.middleware');

router.post('/update', authenticateToken, locationController.updateLocation);
router.get('/users', authenticateToken, locationController.getUsersLocations);

module.exports = router;
