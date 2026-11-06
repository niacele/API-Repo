const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { processNewReportNotifications } = require('../controllers/notificationController');

/**
 * @route   POST /api/reports
 * @desc    Receives a new maintenance report, persists it to Firestore, and triggers FCM/Email alerts.
 */
router.post('/', async (req, res) => {
  try {
    const {
      siteCode,
      category,
      location,
      date,
      time,
      severity,
      priority,
      priorityLevel,
      matchedKeywords,
      description,
      imageUri,
      submittedBy
    } = req.body;

    const newReport = {
      site: siteCode,
      siteCode,
      category,
      location,
      date: date || new Date().toLocaleDateString(),
      time: time || new Date().toLocaleTimeString(),
      severity: Number(severity) || 1,
      priority: priority || '1 (LOW)',
      priorityLevel: Number(priorityLevel) || 1,
      matchedKeywords: matchedKeywords || [],
      description: description || '',
      imageUri: imageUri || '',
      status: 'new',
      submittedBy: submittedBy || 'Guest',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save document entry into Firestore
    const docRef = await admin.firestore().collection('reports').add(newReport);
    const savedReport = { id: docRef.id, ...newReport };

    // Trigger Notification Pipeline
    processNewReportNotifications(savedReport);

    return res.status(201).json({
      success: true,
      message: 'Report created and notifications processed.',
      reportId: docRef.id
    });
  } catch (error) {
    console.error('Error handling POST /api/reports:', error);
    return res.status(500).json({ success: false, message: 'Server error creating report.' });
  }
});

module.exports = router;