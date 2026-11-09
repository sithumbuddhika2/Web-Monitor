import { NextRequest, NextResponse } from 'next/server';
import { getMonitorState, recordHealthCheck } from '@/lib/store';
import { sendDowntimeAlert, sendRecoveryAlert } from '@/lib/mailer';
import { checkTarget } from '@/app/api/check/route';


export async function GET(req: NextRequest) {
  // Optional security check for Vercel CRON_SECRET if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 });
    }
  }

  const state = getMonitorState();
  const result = await checkTarget(state.targetUrl);
  const { statusChanged, previousStatus, activeIncident } = recordHealthCheck(result);

  let alertSent = false;

  if (result.status === 'down' && (statusChanged || !activeIncident?.notified)) {
    await sendDowntimeAlert(result.url, result.error || 'Connection failed', result.httpStatus);
    if (activeIncident) activeIncident.notified = true;
    alertSent = true;
  } else if (result.status === 'operational' && previousStatus === 'down') {
    await sendRecoveryAlert(result.url, activeIncident?.durationSeconds, result.responseTimeMs);
    alertSent = true;
  }

  return NextResponse.json({
    status: 'ok',
    checkedAt: result.timestamp,
    target: result.url,
    state: result.status,
    latency: result.responseTimeMs,
    alertSent,
  });
}
