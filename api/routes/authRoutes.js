const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);

router.post('/google-sso', authController.googleSso);

router.get('/profile', verifyToken, authController.getProfile);
router.put('/change-email', verifyToken, authController.changeEmail);

module.exports = router;