import { NextRequest, NextResponse, connection } from 'next/server';
import { getMonitorState, recordHealthCheck } from '@/lib/store';
import { sendDowntimeAlert, sendDowntimeReminderAlert, sendRecoveryAlert } from '@/lib/mailer';
import { checkTarget } from '@/app/api/check/route';

export async function GET(req: NextRequest) {
  await connection();
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
  const { alertAction, previousStatus, activeIncident } = recordHealthCheck(result);

  let alertSent = false;

  if (alertAction.type === 'INITIAL_DOWN') {
    await sendDowntimeAlert(result.url, alertAction.reason, alertAction.httpStatus);
    alertSent = true;
  } else if (alertAction.type === 'REMINDER_DOWN') {
    await sendDowntimeReminderAlert(result.url, alertAction.reason, alertAction.httpStatus, alertAction.hoursDown);
    alertSent = true;
  } else if (alertAction.type === 'RECOVERED') {
    await sendRecoveryAlert(result.url, alertAction.durationSeconds, alertAction.responseTimeMs);
    alertSent = true;
  }

  return NextResponse.json({
    status: 'ok',
    checkedAt: result.timestamp,
    target: result.url,
    state: result.status,
    latency: result.responseTimeMs,
    alertAction: alertAction.type,
    alertSent,
  });
}
