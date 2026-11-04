const nodemailer = require('nodemailer');

// Configure transport using environment variables loaded from .env
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a detailed HTML report email to an admin recipient.
 */
const sendReportEmail = async (recipientEmail, reportData) => {
  try {
    const mailOptions = {
      from: `"Groundskeeper App" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `[NEW REPORT] ${reportData.category || 'Maintenance Issue'} - ${reportData.location || 'Site'}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #301014;">Groundskeeper Maintenance Alert</h2>
          <p>A new maintenance report has been logged for your assigned site.</p>
          <hr style="border: 0; border-top: 1px solid #eee;" />
          <table style="width: 100%; text-align: left; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold;">Site Code:</td><td>${reportData.siteCode || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Category:</td><td>${reportData.category || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Location:</td><td>${reportData.location || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Severity:</td><td>Priority ${reportData.severity || '1'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Description:</td><td>${reportData.description || 'No description provided.'}</td></tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;" />
          <p style="font-size: 12px; color: #777;">You are receiving this automated email based on your Groundskeeper notification settings.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email dispatched to ${recipientEmail}: ${info.messageId}`);
  } catch (error) {
    console.error(`Failed to send report email to ${recipientEmail}:`, error);
  }
};

module.exports = { sendReportEmail };