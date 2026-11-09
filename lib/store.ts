import fs from 'fs';
import path from 'path';
import { HealthCheckResult, IncidentRecord, ErrorReport, MonitorState, SystemStatus } from './types';

const DATA_FILE = path.join(process.cwd(), '.monitor-data.json');

// Global memory state for Node.js process / serverless instance
let memoryState: MonitorState = {
  targetUrl: process.env.TARGET_URL || 'https://hc.lk',
  currentStatus: 'unknown',
  statusSince: new Date().toISOString(),
  lastCheck: null,
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
    // Only attempt file write if filesystem is available (local dev or environments with writable disk)
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryState, null, 2), 'utf-8');
  } catch {
    // In strict read-only serverless environments, file persistence will gracefully fail
  }
}

// Initial load
loadStateFromFile();

export function getMonitorState(): MonitorState {
  return memoryState;
}

export function recordHealthCheck(result: HealthCheckResult): { statusChanged: boolean; previousStatus: SystemStatus; activeIncident?: IncidentRecord } {
  const previousStatus = memoryState.currentStatus;
  const statusChanged = previousStatus !== result.status && previousStatus !== 'unknown';
  
  memoryState.lastCheck = result;
  
  if (statusChanged || memoryState.currentStatus === 'unknown') {
    memoryState.currentStatus = result.status;
    memoryState.statusSince = result.timestamp;
  }

  // Keep last 30 checks for latency and graph
  memoryState.recentChecks = [result, ...memoryState.recentChecks.slice(0, 29)];

  let activeIncident: IncidentRecord | undefined;

  // Handle Outage lifecycle
  if (result.status === 'down') {
    // If not already in an active incident, create one
    const ongoing = memoryState.incidents.find(i => !i.resolvedAt);
    if (!ongoing) {
      const newIncident: IncidentRecord = {
        id: `inc_${Date.now()}`,
        target: result.url,
        startedAt: result.timestamp,
        reason: result.error || `HTTP Status ${result.httpStatus || 'unreachable'}`,
        httpStatus: result.httpStatus,
        notified: false,
      };
      memoryState.incidents = [newIncident, ...memoryState.incidents.slice(0, 49)];
      activeIncident = newIncident;
    }
  } else if (result.status === 'operational' && previousStatus === 'down') {
    // Recovered! Mark active incident as resolved
    const ongoingIndex = memoryState.incidents.findIndex(i => !i.resolvedAt);
    if (ongoingIndex !== -1) {
      const ongoing = memoryState.incidents[ongoingIndex];
      const startMs = new Date(ongoing.startedAt).getTime();
      const endMs = new Date(result.timestamp).getTime();
      ongoing.resolvedAt = result.timestamp;
      ongoing.durationSeconds = Math.max(1, Math.round((endMs - startMs) / 1000));
      activeIncident = ongoing;
    }
  }

  persistStateToFile();
  return { statusChanged, previousStatus, activeIncident };
}

export function recordErrorReport(report: Omit<ErrorReport, 'id' | 'notified'>): { error: ErrorReport; shouldSendEmail: boolean } {
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
  persistStateToFile();
}
