const admin = require('firebase-admin');
const { processNewReportNotifications } = require('./notificationController');

exports.createReport = async (req, res) => {
  try {
    const { siteCode, category, location, description, severity, imageUrl } = req.body;

    const newReport = {
      siteCode,
      category,
      location,
      description,
      severity: severity || 1,
      imageUrl: imageUrl || null,
      status: 'NEW',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save report to Firestore
    const docRef = await admin.firestore().collection('reports').add(newReport);
    const reportData = { id: docRef.id, ...newReport };

    // Trigger Notification Dispatcher
    processNewReportNotifications(reportData);

    return res.status(201).json({
      success: true,
      message: 'Report created successfully.',
      reportId: docRef.id,
    });
  } catch (error) {
    console.error('Error creating report:', error);
    return res.status(500).json({ success: false, message: 'Failed to create report.' });
  }
};