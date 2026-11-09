import { NextResponse } from 'next/server';
import { getMonitorState, recordHealthCheck } from '@/lib/store';
import { sendDowntimeAlert, sendRecoveryAlert } from '@/lib/mailer';
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
  const state = getMonitorState();
  const result = await checkTarget(state.targetUrl);
  const { statusChanged, previousStatus, activeIncident } = recordHealthCheck(result);

  let emailDispatched = false;

  // If transitioned to DOWN, send downtime alert
  if (result.status === 'down' && (statusChanged || !activeIncident?.notified)) {
    try {
      await sendDowntimeAlert(result.url, result.error || 'Server unreachable', result.httpStatus);
      if (activeIncident) activeIncident.notified = true;
      emailDispatched = true;
    } catch (e) {
      console.error('[CHECK API] Error sending downtime alert:', e);
    }
  } 
  // If transitioned from DOWN back to OPERATIONAL, send recovery alert
  else if (result.status === 'operational' && previousStatus === 'down') {
    try {
      await sendRecoveryAlert(result.url, activeIncident?.durationSeconds, result.responseTimeMs);
      emailDispatched = true;
    } catch (e) {
      console.error('[CHECK API] Error sending recovery alert:', e);
    }
  }

  return NextResponse.json({
    success: true,
    result,
    statusChanged,
    emailDispatched,
  });
}

export async function POST() {
  return GET();
}
