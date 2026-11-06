const admin = require('firebase-admin');
const { sendReportEmail } = require('../services/emailService');

/**
 * Evaluates site admin notification preferences and dispatches FCM push alerts and Nodemailer emails.
 * @param {Object} reportData - The report payload containing siteCode, category, location, and description.
 */
const processNewReportNotifications = async (reportData) => {
  try {
    const { siteCode, category, location, description } = reportData;

    // Validate presence of siteCode for routing
    if (!siteCode) {
      console.log('Notification skipped: Missing siteCode');
      return;
    }

    console.log(`[Notification Engine] Processing alert dispatch for site: ${siteCode}`);

    // Query Firestore for administrators matching the report's target siteCode
    const adminsSnapshot = await admin.firestore()
      .collection('users')
      .where('siteCode', '==', siteCode)
      .where('role', '==', 'admin')
      .get();

    // Abort cleanly if no administrators exist for the site
    if (adminsSnapshot.empty) {
      console.log(`[Notification Engine] No admin accounts registered for site: ${siteCode}`);
      return;
    }

    const pushTokens = [];
    const emailPromises = [];

    // Iterate through matching administrators and evaluate their personal notification preferences
    adminsSnapshot.forEach((doc) => {
      const adminData = doc.data();
      // Default to real-time push enabled and email disabled if preferences map is uninitialized
      const prefs = adminData.preferences || { realTimeNotifications: true, emailReports: false };

      console.log(`[Notification Engine] Admin ${doc.id} (${adminData.email}) settings:`, prefs);

      // Collect FCM device token if admin opted into push notifications
      if (prefs.realTimeNotifications && adminData.fcmToken) {
        pushTokens.push(adminData.fcmToken);
      }

      // Prepare email dispatch promise if admin opted into email reports
      if (prefs.emailReports && adminData.email) {
        emailPromises.push(sendReportEmail(adminData.email, reportData));
      }
    });

    // 1. Dispatch Firebase Cloud Messaging (FCM) Multicast Push Notification
    if (pushTokens.length > 0) {
      const multicastMessage = {
        tokens: pushTokens,
        notification: {
          title: `New Issue: ${category || 'Maintenance Alert'}`,
          body: `${location || 'Site'}: ${description || 'New report submitted.'}`,
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
      console.log(`[FCM Engine] Multicast result: ${response.successCount} delivered, ${response.failureCount} failed.`);
    } else {
      console.log('[FCM Engine] No active FCM tokens available for targeted administrators.');
    }

    // 2. Execute parallel Nodemailer HTML email dispatches
    if (emailPromises.length > 0) {
      await Promise.all(emailPromises);
      console.log(`[Email Engine] Successfully dispatched ${emailPromises.length} report email(s).`);
    } else {
      console.log('[Email Engine] No administrators opted into email report dispatches.');
    }
  } catch (error) {
    console.error('[Notification Engine] Failure in notification processor:', error);
  }
};

module.exports = { processNewReportNotifications };