import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getMonitorState, recordHealthCheck } from '@/lib/store';
import { sendDowntimeAlert, sendDowntimeReminderAlert, sendRecoveryAlert } from '@/lib/mailer';
import { HealthCheckResult, SystemStatus } from '@/lib/types';


export async function checkTarget(url: string): Promise<HealthCheckResult> {
  const startTime = Date.now();
  let status: SystemStatus = 'operational';
  let httpStatus: number | null = null;
  let errorMessage: string | undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'HCSentinel-Uptime-Monitor/1.0 (+https://hc.lk)',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    httpStatus = response.status;

    if (response.status >= 500) {
      status = 'down';
      errorMessage = `Server returned HTTP ${response.status} Error`;
    } else if (response.status >= 400 && response.status !== 401 && response.status !== 403) {
      status = 'degraded';
      errorMessage = `Server returned client warning HTTP ${response.status}`;
    } else {
      status = 'operational';
    }
  } catch (err: any) {
    status = 'down';
    if (err.name === 'AbortError') {
      errorMessage = 'Connection timed out after 12 seconds';
    } else {
      errorMessage = err.message || 'DNS resolution or network connection failed';
    }
  }

  const responseTimeMs = Date.now() - startTime;

  return {
    url,
    timestamp: new Date().toISOString(),
    status,
    httpStatus,
    responseTimeMs,
    error: errorMessage,
  };
}

export async function GET() {
  await connection();
  const state = getMonitorState();
  const result = await checkTarget(state.targetUrl);
  const { alertAction, previousStatus, activeIncident } = recordHealthCheck(result);

  let emailDispatched = false;

  if (alertAction.type === 'INITIAL_DOWN') {
    try {
      await sendDowntimeAlert(result.url, alertAction.reason, alertAction.httpStatus);
      emailDispatched = true;
    } catch (e) {
      console.error('[CHECK API] Error sending initial downtime alert:', e);
    }
  } else if (alertAction.type === 'REMINDER_DOWN') {
    try {
      await sendDowntimeReminderAlert(result.url, alertAction.reason, alertAction.httpStatus, alertAction.hoursDown);
      emailDispatched = true;
    } catch (e) {
      console.error('[CHECK API] Error sending reminder downtime alert:', e);
    }
  } else if (alertAction.type === 'RECOVERED') {
    try {
      await sendRecoveryAlert(result.url, alertAction.durationSeconds, alertAction.responseTimeMs);
      emailDispatched = true;
    } catch (e) {
      console.error('[CHECK API] Error sending recovery alert:', e);
    }
  }

  return NextResponse.json({
    success: true,
    result,
    alertAction: alertAction.type,
    emailDispatched,
  });
}

export async function POST() {
  return GET();
}
