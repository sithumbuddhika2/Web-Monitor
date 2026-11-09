import { NextRequest, NextResponse } from 'next/server';
import { recordErrorReport } from '@/lib/store';
import { sendErrorReportAlert } from '@/lib/mailer';


export async function POST(req: NextRequest) {
  try {
    // Authenticate the incoming webhook
    const expectedKey = process.env.API_SECRET_KEY || 'kcm-sentinel-secret-2026';
    const authHeader = req.headers.get('authorization');
    const apiKeyHeader = req.headers.get('x-api-key');

    const providedKey = apiKeyHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (providedKey !== expectedKey) {
      console.warn('[ERROR INGESTION] Unauthorized attempt with invalid or missing API key.');
      return NextResponse.json({ error: 'Unauthorized. Invalid API secret key.' }, { status: 401 });
    }

    const body = await req.json();

    if (!body || !body.message) {
      return NextResponse.json({ error: 'Invalid payload. "message" field is required.' }, { status: 400 });
    }

    const { error, shouldSendEmail } = recordErrorReport({
      timestamp: body.timestamp || new Date().toISOString(),
      type: body.type || 'Fatal Error',
      message: String(body.message),
      file: body.file ? String(body.file) : undefined,
      line: body.line ? Number(body.line) : undefined,
      trace: body.trace ? String(body.trace) : undefined,
      url: body.url ? String(body.url) : undefined,
      method: body.method ? String(body.method) : undefined,
      clientIp: body.clientIp ? String(body.clientIp) : undefined,
      userAgent: body.userAgent ? String(body.userAgent) : undefined,
      environment: body.environment || 'production',
    });

    let emailResult = { success: false, message: 'Rate-limited / Cooldown active' };

    if (shouldSendEmail) {
      emailResult = await sendErrorReportAlert(error);
    }

    return NextResponse.json({
      success: true,
      errorId: error.id,
      emailSent: shouldSendEmail && emailResult.success,
      emailDetail: emailResult.message,
    });
  } catch (err: any) {
    console.error('[ERROR INGESTION] Exception processing error payload:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
