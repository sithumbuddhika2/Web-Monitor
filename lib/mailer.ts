import nodemailer from 'nodemailer';
import { ErrorReport } from './types';

interface SendMailParams {
  to?: string;
  subject: string;
  html: string;
  text?: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: pass.replace(/\s+/g, ''), // Strip whitespace from App Passwords
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

export async function sendEmail({ to, subject, html, text }: SendMailParams): Promise<{ success: boolean; message: string }> {
  const recipient = to || process.env.ALERT_TO_EMAIL;
  
  if (!recipient) {
    console.warn('[MAILER] No recipient email specified (ALERT_TO_EMAIL is not set).');
    return { success: false, message: 'ALERT_TO_EMAIL environment variable is not configured.' };
  }

  const senderUser = process.env.SMTP_USER;
  const transporter = getTransporter();

  if (!transporter || !senderUser) {
    console.warn('[MAILER] SMTP credentials not fully configured (SMTP_USER or SMTP_PASS missing).');
    return { success: false, message: 'SMTP credentials missing. Please set SMTP_USER and SMTP_PASS.' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"HC Sentinel Alert" <${senderUser}>`,
      to: recipient,
      subject,
      html,
      text: text || subject,
    });

    console.log(`[MAILER] Email sent successfully to ${recipient}. MessageId: ${info.messageId}`);
    return { success: true, message: `Email delivered to ${recipient}` };
  } catch (err: any) {
    console.error('[MAILER] Failed to send email:', err);
    return { success: false, message: err.message || 'Unknown SMTP error' };
  }
}

/**
 * 🚨 Alert: Domain or Site is Down
 */
export async function sendDowntimeAlert(targetUrl: string, reason: string, httpStatus: number | null) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
  const subject = `🚨 [URGENT] ${targetUrl} is DOWN!`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #fee2e2; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: #dc2626; color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">🚨 Service Outage Detected</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">HC Uptime Sentinel has detected that your target service is not responding.</p>
      </div>
      <div style="padding: 24px; color: #1f2937;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 140px; border-bottom: 1px solid #f3f4f6;">Target URL:</td>
            <td style="padding: 10px 0; font-weight: 600; font-size: 14px; border-bottom: 1px solid #f3f4f6;"><a href="${targetUrl}" style="color: #dc2626; text-decoration: none;">${targetUrl}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Status:</td>
            <td style="padding: 10px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6;"><span style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 4px; font-weight: 600;">CRITICAL / DOWN</span></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">HTTP Status:</td>
            <td style="padding: 10px 0; font-size: 14px; font-weight: 600; border-bottom: 1px solid #f3f4f6;">${httpStatus ? httpStatus : 'No HTTP response (Connection Failed)'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Failure Reason:</td>
            <td style="padding: 10px 0; font-size: 14px; color: #b91c1c; border-bottom: 1px solid #f3f4f6;">${reason}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Detected At:</td>
            <td style="padding: 10px 0; font-size: 14px; color: #374151;">${now} (SL Time)</td>
          </tr>
        </table>
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #991b1b; margin-top: 20px;">
          <strong>Action Required:</strong> Check your web server, Apache/Nginx status, DNS configuration, and SSL certificate immediately.
        </div>
      </div>
      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;">
        HC Sentinel Monitoring &bull; Automated Real-Time Dispatch
      </div>
    </div>
  `;

  return sendEmail({ subject, html });
}

/**
 * ⏳ Alert: Still Down Reminder (sent every 2-3 hours only)
 */
export async function sendDowntimeReminderAlert(targetUrl: string, reason: string, httpStatus: number | null, hoursDown: number) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
  const subject = `⏳ [STILL DOWN - ${hoursDown}h REMINDER] ${targetUrl} is still unreachable`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #fed7aa; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: #ea580c; color: #ffffff; padding: 24px; text-align: center;">
        <span style="background: rgba(0,0,0,0.2); font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px;">Periodic Reminder</span>
        <h1 style="margin: 8px 0 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">⏳ Ongoing Service Outage</h1>
        <p style="margin: 8px 0 0; font-size: 13px; opacity: 0.9;">Target service has remained unresponsive for approximately <strong>${hoursDown} hours</strong>.</p>
      </div>
      <div style="padding: 24px; color: #1f2937;">
        <p style="font-size: 13px; color: #4b5563; line-height: 1.5; margin-top: 0;">
          This is an automated 2-hour interval reminder. Further alerts will stay suppressed until service is restored or the next 2-hour window.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 140px; border-bottom: 1px solid #f3f4f6;">Target URL:</td>
            <td style="padding: 10px 0; font-weight: 600; font-size: 14px; border-bottom: 1px solid #f3f4f6;"><a href="${targetUrl}" style="color: #ea580c; text-decoration: none;">${targetUrl}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Status:</td>
            <td style="padding: 10px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6;"><span style="background: #ffedd5; color: #9a3412; padding: 3px 8px; border-radius: 4px; font-weight: 600;">CONTINUOUS OUTAGE (~${hoursDown}h)</span></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">HTTP Status:</td>
            <td style="padding: 10px 0; font-size: 14px; font-weight: 600; border-bottom: 1px solid #f3f4f6;">${httpStatus ? httpStatus : 'No HTTP response (Connection Failed)'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Failure Reason:</td>
            <td style="padding: 10px 0; font-size: 14px; color: #c2410c; border-bottom: 1px solid #f3f4f6;">${reason}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Reminder Time:</td>
            <td style="padding: 10px 0; font-size: 14px; color: #374151;">${now} (SL Time)</td>
          </tr>
        </table>
      </div>
      <div style="background: #f9fafb; padding: 14px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;">
        HC Sentinel Monitoring &bull; Anti-Spam Throttled Dispatcher
      </div>
    </div>
  `;

  return sendEmail({ subject, html });
}

/**
 * 🟢 Alert: Domain or Site Recovered Back Online
 */
export async function sendRecoveryAlert(targetUrl: string, durationSeconds?: number, responseTimeMs?: number) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
  const subject = `✅ [RESOLVED] ${targetUrl} is BACK ONLINE`;
  
  const durationText = durationSeconds 
    ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s` 
    : 'Unknown duration';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #d1fae5; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: #10b981; color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">✅ Service Restored</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Your target service is responsive and healthy again.</p>
      </div>
      <div style="padding: 24px; color: #1f2937;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 140px; border-bottom: 1px solid #f3f4f6;">Target URL:</td>
            <td style="padding: 10px 0; font-weight: 600; font-size: 14px; border-bottom: 1px solid #f3f4f6;"><a href="${targetUrl}" style="color: #10b981; text-decoration: none;">${targetUrl}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Status:</td>
            <td style="padding: 10px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6;"><span style="background: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 4px; font-weight: 600;">200 OK / OPERATIONAL</span></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Total Downtime:</td>
            <td style="padding: 10px 0; font-size: 14px; font-weight: 600; border-bottom: 1px solid #f3f4f6;">${durationText}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6;">Response Latency:</td>
            <td style="padding: 10px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6;">${responseTimeMs ? `${responseTimeMs} ms` : 'Normal'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Restored At:</td>
            <td style="padding: 10px 0; font-size: 14px; color: #374151;">${now} (SL Time)</td>
          </tr>
        </table>
      </div>
      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;">
        HC Sentinel Monitoring &bull; Automated Real-Time Dispatch
      </div>
    </div>
  `;

  return sendEmail({ subject, html });
}

/**
 * ⚠️ Alert: KCM PHP System Error
 */
export async function sendErrorReportAlert(error: ErrorReport) {
  const subject = `⚠️ [KCM ERROR] ${error.type}: ${error.message.substring(0, 80)}`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #fef3c7; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: #f59e0b; color: #ffffff; padding: 20px 24px;">
        <span style="background: rgba(0,0,0,0.2); font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px;">KCM System Error</span>
        <h1 style="margin: 8px 0 0; font-size: 20px; font-weight: 700;">${error.type}</h1>
      </div>
      <div style="padding: 24px; color: #1f2937;">
        <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 14px 16px; border-radius: 6px; font-family: monospace; font-size: 14px; color: #92400e; margin-bottom: 20px; word-break: break-all;">
          ${escapeHtml(error.message)}
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 120px; border-bottom: 1px solid #f3f4f6;">File & Line:</td>
            <td style="padding: 8px 0; font-family: monospace; font-size: 13px; font-weight: 600; color: #111827; border-bottom: 1px solid #f3f4f6;">
              ${escapeHtml(error.file || 'Unknown')}${error.line ? `:${error.line}` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; border-bottom: 1px solid #f3f4f6;">Triggered URL:</td>
            <td style="padding: 8px 0; font-family: monospace; font-size: 13px; border-bottom: 1px solid #f3f4f6; color: #2563eb;">
              ${escapeHtml(error.method || 'GET')} ${escapeHtml(error.url || 'N/A')}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; border-bottom: 1px solid #f3f4f6;">Environment:</td>
            <td style="padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6;">
              <span style="text-transform: capitalize; font-weight: 600; color: ${error.environment === 'production' ? '#dc2626' : '#6b7280'}">
                ${escapeHtml(error.environment || 'production')}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; border-bottom: 1px solid #f3f4f6;">Client IP:</td>
            <td style="padding: 8px 0; font-family: monospace; font-size: 13px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(error.clientIp || 'N/A')}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Timestamp:</td>
            <td style="padding: 8px 0; font-size: 13px; color: #4b5563;">${error.timestamp}</td>
          </tr>
        </table>

        ${error.trace ? `
          <div style="margin-top: 16px;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">Stack Trace</div>
            <pre style="background: #111827; color: #e5e7eb; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; max-height: 250px; line-height: 1.5;">${escapeHtml(error.trace)}</pre>
          </div>
        ` : ''}
      </div>
      <div style="background: #f9fafb; padding: 14px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;">
        HC Sentinel Monitoring &bull; Automated Real-Time Error Collector
      </div>
    </div>
  `;

  return sendEmail({ subject, html });
}

/**
 * 🧪 Test Alert
 */
export async function sendTestAlert(recipientEmail: string) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
  const subject = `🔔 [TEST ALERT] HC Sentinel Monitoring is Working!`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
      <div style="background: #2563eb; color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 700;">🔔 Verification Alert</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Your email delivery channel is operational!</p>
      </div>
      <div style="padding: 24px; color: #1f2937;">
        <p style="font-size: 14px; line-height: 1.6;">Congratulations! If you are reading this email, your <strong>HC Sentinel Alert Dispatcher</strong> is properly connected to your mail provider and ready to notify you in real-time when:</p>
        <ul style="font-size: 14px; line-height: 1.8; color: #374151;">
          <li><code>hc.lk</code> or your server experiences an outage or connection failure</li>
          <li>The KCM system throws an uncaught exception, fatal error, or database failure</li>
          <li>Your domain recovers back online</li>
        </ul>
        <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">Sent at: ${now} (SL Time)</p>
      </div>
    </div>
  `;

  return sendEmail({ to: recipientEmail, subject, html });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
