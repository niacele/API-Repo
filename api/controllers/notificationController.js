const admin = require('firebase-admin');
const { sendReportEmail } = require('../services/emailService');

/**
 * Evaluates site admin notification preferences and dispatches FCM push alerts and Nodemailer emails.
 * @param {Object} reportData - The report payload containing siteCode, category, location, and description.
 */
const processNewReportNotifications = async (reportData) => {
  try {
    const { siteCode, category, location, description } = reportData;

    if (!siteCode) {
      console.log('[Notification Pipeline] Skipped: Missing siteCode in report.');
      return;
    }

    console.log(`[Notification Pipeline] Evaluating administrators for siteCode: ${siteCode}`);

    // Query Firestore for all administrator accounts assigned to this siteCode
    const adminsSnapshot = await admin.firestore()
      .collection('users')
      .where('siteCode', '==', siteCode)
      .where('role', '==', 'admin')
      .get();

    if (adminsSnapshot.empty) {
      console.log(`[Notification Pipeline] No admin users found for siteCode: ${siteCode}`);
      return;
    }

    const pushTokens = [];
    const emailPromises = [];

    // Loop through matching administrators and check their stored preferences
    adminsSnapshot.forEach((doc) => {
      const adminData = doc.data();
      const prefs = adminData.preferences || { realTimeNotifications: true, emailReports: false };

      console.log(`[Notification Pipeline] Admin ${doc.id} (${adminData.email}) settings:`, prefs);

      // Collect FCM registration token if push notifications are enabled
      if (prefs.realTimeNotifications && adminData.fcmToken) {
        pushTokens.push(adminData.fcmToken);
      }

      // Collect email dispatch promise if email alerts are enabled
      if (prefs.emailReports && adminData.email) {
        emailPromises.push(sendReportEmail(adminData.email, reportData));
      }
    });

    // 1. Send Firebase Cloud Messaging (FCM) Multicast Push Notification
    if (pushTokens.length > 0) {
      const multicastMessage = {
        tokens: pushTokens,
        notification: {
          title: `New Issue: ${category || 'Maintenance Alert'}`,
          body: `${location || 'Site'}: ${description || 'New issue logged.'}`,
        },
        data: { siteCode: String(siteCode) },
        android: {
          notification: { 
            channelId: 'groundskeeper_notifications', 
            color: '#B71C1C', 
            priority: 'high' 
          }
        }
      };

      const response = await admin.messaging().sendEachForMulticast(multicastMessage);
      console.log(`[FCM Pipeline] Multicast push dispatched: ${response.successCount} succeeded, ${response.failureCount} failed.`);
    } else {
      console.log('[FCM Pipeline] No administrators have active FCM tokens for push notifications.');
    }

    // 2. Execute parallel Nodemailer email dispatches
    if (emailPromises.length > 0) {
      await Promise.all(emailPromises);
      console.log(`[Email Pipeline] Dispatched ${emailPromises.length} admin email alert(s).`);
    } else {
      console.log('[Email Pipeline] No administrators opted into email reports.');
    }
  } catch (error) {
    console.error('[Notification Pipeline] Error processing alerts:', error);
  }
};

module.exports = { processNewReportNotifications };