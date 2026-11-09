import { NextRequest, NextResponse } from 'next/server';
import { sendTestAlert, sendRecoveryAlert, sendDowntimeAlert, sendDowntimeReminderAlert } from '@/lib/mailer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body.email || process.env.ALERT_TO_EMAIL;
    const alertType = body.type || 'verification';
    const targetUrl = process.env.TARGET_URL || 'https://hc.lk';

    if (!email && !process.env.ALERT_TO_EMAIL) {
      return NextResponse.json({
        success: false,
        message: 'No email address provided and ALERT_TO_EMAIL is not set in environment.',
      }, { status: 400 });
    }

    let result;
    if (alertType === 'recovery') {
      result = await sendRecoveryAlert(targetUrl, 320, 142);
    } else if (alertType === 'downtime') {
      result = await sendDowntimeAlert(targetUrl, 'Simulated Outage: Connection refused', 503);
    } else if (alertType === 'reminder') {
      result = await sendDowntimeReminderAlert(targetUrl, 'Simulated Outage: Still unreachable after 2 hours', 503, 2);
    } else {
      result = await sendTestAlert(email);
    }

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      message: err.message || 'Failed to send test email',
    }, { status: 500 });
  }
}
