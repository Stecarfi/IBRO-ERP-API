const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { loginLimiter } = require('../middlewares/rateLimiter.middleware');

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.post('/auth/recover', authController.recoverPassword);
router.post('/auth/reset-password', authController.resetPassword);
router.get('/emergency-unlock/:user', authController.emergencyUnlock);

module.exports = router;
