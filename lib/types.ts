export type SystemStatus = 'operational' | 'degraded' | 'down' | 'unknown';

export interface HealthCheckResult {
  url: string;
  timestamp: string;
  status: SystemStatus;
  httpStatus: number | null;
  responseTimeMs: number;
  error?: string;
}

export interface IncidentRecord {
  id: string;
  target: string;
  startedAt: string;
  resolvedAt?: string;
  durationSeconds?: number;
  reason: string;
  httpStatus?: number | null;
  notified: boolean;
}

export interface ErrorReport {
  id: string;
  timestamp: string;
  type: string; // 'Fatal Error' | 'Exception' | 'Warning' | 'Database Error'
  message: string;
  file?: string;
  line?: number;
  trace?: string;
  url?: string;
  method?: string;
  clientIp?: string;
  userAgent?: string;
  environment?: string; // 'production' | 'development'
  notified: boolean;
}

export interface MonitorState {
  targetUrl: string;
  lastCheck: HealthCheckResult | null;
  currentStatus: SystemStatus;
  statusSince: string;
  isCurrentlyDown: boolean;
  downSince: string | null;
  lastDowntimeAlertAt: string | null;
  lastRecoveryAlertAt: string | null;
  recentChecks: HealthCheckResult[];
  incidents: IncidentRecord[];
  errors: ErrorReport[];
}

export type AlertAction = 
  | { type: 'INITIAL_DOWN'; reason: string; httpStatus: number | null }
  | { type: 'REMINDER_DOWN'; reason: string; httpStatus: number | null; hoursDown: number }
  | { type: 'RECOVERED'; durationSeconds: number; responseTimeMs: number }
  | { type: 'NONE' };
