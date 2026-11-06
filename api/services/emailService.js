const nodemailer = require('nodemailer');

/**
 * Configure Nodemailer transport using SMTP environment variables loaded from .env
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a structured HTML maintenance alert email to an administrator.
 * @param {string} recipientEmail - The destination admin email address.
 * @param {Object} reportData - The report details (siteCode, category, location, description, etc.)
 */
const sendReportEmail = async (recipientEmail, reportData) => {
  try {
    const mailOptions = {
      from: `"GroundsKeeper App" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `[MAINTENANCE ALERT] ${reportData.category || 'Issue'} at ${reportData.location || 'Site'}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #B71C1C;">GroundsKeeper Maintenance Alert</h2>
          <p>A new maintenance report has been logged for your assigned site location.</p>
          <hr style="border: 0; border-top: 1px solid #eee;" />
          <table style="width: 100%; text-align: left; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold;">Site Code:</td><td>${reportData.siteCode || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Category:</td><td>${reportData.category || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Location:</td><td>${reportData.location || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Severity:</td><td>Priority ${reportData.severity || '1'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Description:</td><td>${reportData.description || 'No description provided.'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Submitted By:</td><td>${reportData.submittedBy || 'Guest'}</td></tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;" />
          <p style="font-size: 12px; color: #777;">You are receiving this automated alert based on your GroundsKeeper admin notification preferences.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] Alert successfully sent to ${recipientEmail}: ${info.messageId}`);
  } catch (error) {
    console.error(`[Email Service] Failed to send email to ${recipientEmail}:`, error);
  }
};

module.exports = { sendReportEmail };