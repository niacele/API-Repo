const admin = require('firebase-admin');
const { sendReportEmail } = require('../services/emailService');

const processNewReportNotifications = async (reportData) => {
  try {
    const { siteCode, category, location, description } = reportData;

    if (!siteCode) return;

    // Query site admins matching siteCode
    const adminsSnapshot = await admin.firestore()
      .collection('users')
      .where('siteCode', '==', siteCode)
      .where('role', '==', 'admin')
      .get();

    if (adminsSnapshot.empty) return;

    const pushTokens = [];
    const emailPromises = [];

    adminsSnapshot.forEach((doc) => {
      const adminData = doc.data();
      const prefs = adminData.preferences || { realTimeNotifications: true, emailReports: false };

      if (prefs.realTimeNotifications && adminData.fcmToken) {
        pushTokens.push(adminData.fcmToken);
      }

      if (prefs.emailReports && adminData.email) {
        emailPromises.push(sendReportEmail(adminData.email, reportData));
      }
    });

    // 1. Send FCM Multicast Push
    if (pushTokens.length > 0) {
      const multicastMessage = {
        tokens: pushTokens,
        notification: {
          title: `New Issue: ${category}`,
          body: `${location}: ${description}`,
        },
        data: { siteCode: String(siteCode) },
        android: {
          notification: { channelId: 'groundskeeper_notifications', color: '#B71C1C', priority: 'high' }
        }
      };
      await admin.messaging().sendEachForMulticast(multicastMessage);
    }

    // 2. Dispatch Email Reports
    if (emailPromises.length > 0) {
      await Promise.all(emailPromises);
    }
  } catch (error) {
    console.error('Error processing notifications:', error);
  }
};

module.exports = { processNewReportNotifications };