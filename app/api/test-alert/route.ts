import { NextRequest, NextResponse } from 'next/server';
import { sendTestAlert } from '@/lib/mailer';


export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body.email || process.env.ALERT_TO_EMAIL;

    if (!email) {
      return NextResponse.json({
        success: false,
        message: 'No email address provided and ALERT_TO_EMAIL is not set in environment.',
      }, { status: 400 });
    }

    const result = await sendTestAlert(email);

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      message: err.message || 'Failed to send test email',
    }, { status: 500 });
  }
}
