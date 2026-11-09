import { NextResponse, connection } from 'next/server';
import { getMonitorState } from '@/lib/store';

export async function GET() {
  await connection();
  const state = getMonitorState();
  const apiKey = process.env.API_SECRET_KEY || 'kcm-sentinel-secret-2026';
  const alertRecipient = process.env.ALERT_TO_EMAIL || '';
  const isMailConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ALERT_TO_EMAIL);

  // Calculate 24h uptime percentage if checks exist
  const checks = state.recentChecks;
  const operationalCount = checks.filter(c => c.status === 'operational').length;
  const uptimePercentage = checks.length > 0 
    ? Math.round((operationalCount / checks.length) * 1000) / 10 
    : 100;

  // Average latency
  const validLatencies = checks.filter(c => c.responseTimeMs > 0).map(c => c.responseTimeMs);
  const avgLatency = validLatencies.length > 0
    ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
    : 0;

  return NextResponse.json({
    targetUrl: state.targetUrl,
    currentStatus: state.currentStatus,
    statusSince: state.statusSince,
    lastCheck: state.lastCheck,
    recentChecks: state.recentChecks,
    incidents: state.incidents,
    errors: state.errors,
    uptimePercentage,
    avgLatency,
    isMailConfigured,
    alertRecipient: alertRecipient ? alertRecipient.replace(/(.{3})(.*)(@.*)/, '$1***$3') : 'Not Configured',
    rawAlertRecipient: alertRecipient,
    apiKey,
  });
}
