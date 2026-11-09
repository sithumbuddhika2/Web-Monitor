import fs from 'fs';
import path from 'path';
import os from 'os';
import { HealthCheckResult, IncidentRecord, ErrorReport, MonitorState, SystemStatus, AlertAction } from './types';

// Use os.tmpdir() so it works reliably in local dev AND on Vercel AWS Lambda (/tmp is writable)
const DATA_FILE = path.join(os.tmpdir(), 'sentinel-monitor-state.json');

// Global memory state for Node.js process / serverless instance
let memoryState: MonitorState = {
  targetUrl: process.env.TARGET_URL || 'https://hc.lk',
  currentStatus: 'unknown',
  statusSince: new Date().toISOString(),
  lastCheck: null,
  isCurrentlyDown: false,
  downSince: null,
  lastDowntimeAlertAt: null,
  lastRecoveryAlertAt: null,
  recentChecks: [],
  incidents: [],
  errors: [],
};

// Cooldown tracker for repeated identical errors (error hash -> timestamp ms)
const errorCooldowns = new Map<string, number>();

function loadStateFromFile(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(content);
      memoryState = {
        ...memoryState,
        ...data,
        targetUrl: process.env.TARGET_URL || data.targetUrl || 'https://hc.lk',
      };
    }
  } catch (err) {
    console.warn('[STORE] Could not load persisted data file (falling back to memory):', err);
  }
}

function persistStateToFile(): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryState, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[STORE] Could not write state file:', err);
  }
}

// Initial load
loadStateFromFile();

export function getMonitorState(): MonitorState {
  loadStateFromFile(); // Refresh from disk if available
  return memoryState;
}

/**
 * Evaluates the new health check and enforces strict anti-spam rules:
 * 1. Initial Outage: Dispatches 1 email when target first goes DOWN.
 * 2. Ongoing Outage: Suppresses repeated emails. Dispatches a reminder ONLY after 2 hours (120 mins).
 * 3. Recovery: Dispatches 1 email when target comes BACK ONLINE.
 * 4. Steady State: Zero emails.
 */
export function recordHealthCheck(result: HealthCheckResult): {
  alertAction: AlertAction;
  previousStatus: SystemStatus;
  activeIncident?: IncidentRecord;
} {
  loadStateFromFile();

  const previousStatus = memoryState.currentStatus;
  const statusChanged = previousStatus !== result.status && previousStatus !== 'unknown';
  
  // Track if system was in a confirmed DOWN state previously
  const wasDown = memoryState.isCurrentlyDown ||
    memoryState.currentStatus === 'down' ||
    previousStatus === 'down' ||
    (memoryState.lastCheck && memoryState.lastCheck.status === 'down') ||
    (memoryState.recentChecks.length > 0 && memoryState.recentChecks[0].status === 'down') ||
    memoryState.incidents.some(i => !i.resolvedAt);

  memoryState.lastCheck = result;
  
  if (statusChanged || memoryState.currentStatus === 'unknown') {
    memoryState.currentStatus = result.status;
    memoryState.statusSince = result.timestamp;
  }

  // Keep last 30 checks for latency chart
  memoryState.recentChecks = [result, ...memoryState.recentChecks.slice(0, 29)];

  let alertAction: AlertAction = { type: 'NONE' };
  let activeIncident: IncidentRecord | undefined;

  // Two hours cooldown in milliseconds (2 * 60 * 60 * 1000 = 7,200,000 ms)
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  if (result.status === 'down') {
    // 1. Initial Outage Detection
    if (!wasDown) {
      memoryState.isCurrentlyDown = true;
      memoryState.downSince = result.timestamp;
      memoryState.lastDowntimeAlertAt = result.timestamp;

      alertAction = {
        type: 'INITIAL_DOWN',
        reason: result.error || `HTTP ${result.httpStatus || 'unreachable'}`,
        httpStatus: result.httpStatus,
      };

      const newIncident: IncidentRecord = {
        id: `inc_${Date.now()}`,
        target: result.url,
        startedAt: result.timestamp,
        reason: result.error || `HTTP ${result.httpStatus || 'unreachable'}`,
        httpStatus: result.httpStatus,
        notified: true,
      };
      memoryState.incidents = [newIncident, ...memoryState.incidents.slice(0, 49)];
      activeIncident = newIncident;
    } 
    // 2. Ongoing Outage (Already Down)
    else {
      // Ensure flags reflect ongoing outage
      memoryState.isCurrentlyDown = true;
      if (!memoryState.downSince) memoryState.downSince = result.timestamp;

      const lastAlertMs = memoryState.lastDowntimeAlertAt
        ? new Date(memoryState.lastDowntimeAlertAt).getTime()
        : 0;
      const elapsedSinceAlertMs = Date.now() - lastAlertMs;

      // Has it been at least 2 hours since the last alert was sent?
      if (lastAlertMs > 0 && elapsedSinceAlertMs >= TWO_HOURS_MS) {
        const downStartMs = memoryState.downSince
          ? new Date(memoryState.downSince).getTime()
          : Date.now() - elapsedSinceAlertMs;
        const hoursDown = Math.max(2, Math.round((Date.now() - downStartMs) / (3600 * 1000)));

        alertAction = {
          type: 'REMINDER_DOWN',
          reason: result.error || `HTTP ${result.httpStatus || 'unreachable'}`,
          httpStatus: result.httpStatus,
          hoursDown,
        };
        memoryState.lastDowntimeAlertAt = result.timestamp;
      } else {
        // Still down, but within 2 hours: SUPPRESS ALL EMAILS
        alertAction = { type: 'NONE' };
      }
    }
  } 
  // 3. Service Restored (Back Online)
  else if (result.status === 'operational') {
    if (wasDown) {
      const downStartMs = memoryState.downSince
        ? new Date(memoryState.downSince).getTime()
        : Date.now() - 60000; // default 1 min if missing
      const durationSeconds = Math.max(1, Math.round((Date.now() - downStartMs) / 1000));

      alertAction = {
        type: 'RECOVERED',
        durationSeconds,
        responseTimeMs: result.responseTimeMs,
      };

      // Reset downtime flags
      memoryState.isCurrentlyDown = false;
      memoryState.downSince = null;
      memoryState.lastDowntimeAlertAt = null;
      memoryState.lastRecoveryAlertAt = result.timestamp;

      // Mark ongoing incident as resolved
      const ongoing = memoryState.incidents.find(i => !i.resolvedAt);
      if (ongoing) {
        ongoing.resolvedAt = result.timestamp;
        ongoing.durationSeconds = durationSeconds;
        activeIncident = ongoing;
      }
    } else {
      // Already operational, zero emails
      alertAction = { type: 'NONE' };
    }
  }

  persistStateToFile();
  return { alertAction, previousStatus, activeIncident };
}

export function recordErrorReport(report: Omit<ErrorReport, 'id' | 'notified'>): { error: ErrorReport; shouldSendEmail: boolean } {
  loadStateFromFile();

  const id = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Create fingerprint to prevent spamming duplicate errors (same message, file, line)
  const fingerprint = `${report.type}:${report.message}:${report.file || ''}:${report.line || ''}`;
  const now = Date.now();
  const lastSent = errorCooldowns.get(fingerprint) || 0;
  
  // Rate-limit: Only send an email for the same error once every 5 minutes (300,000 ms)
  const shouldSendEmail = (now - lastSent) > 5 * 60 * 1000;
  if (shouldSendEmail) {
    errorCooldowns.set(fingerprint, now);
  }

  const fullReport: ErrorReport = {
    ...report,
    id,
    notified: shouldSendEmail,
  };

  // Prepend error, keep last 100
  memoryState.errors = [fullReport, ...memoryState.errors.slice(0, 99)];

  persistStateToFile();
  return { error: fullReport, shouldSendEmail };
}

export function clearLogs(): void {
  memoryState.errors = [];
  memoryState.incidents = [];
  memoryState.isCurrentlyDown = false;
  memoryState.downSince = null;
  memoryState.lastDowntimeAlertAt = null;
  persistStateToFile();
}
