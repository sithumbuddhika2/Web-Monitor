'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Key,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  XCircle,
  X,
  Play,
  Code
} from 'lucide-react';
import { ErrorReport, HealthCheckResult, IncidentRecord, SystemStatus } from '@/lib/types';

interface DashboardStats {
  targetUrl: string;
  currentStatus: SystemStatus;
  statusSince: string;
  lastCheck: HealthCheckResult | null;
  recentChecks: HealthCheckResult[];
  incidents: IncidentRecord[];
  errors: ErrorReport[];
  uptimePercentage: number;
  avgLatency: number;
  isMailConfigured: boolean;
  alertRecipient: string;
  rawAlertRecipient: string;
  apiKey: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pinging, setPinging] = useState<boolean>(false);
  const [testingEmail, setTestingEmail] = useState<boolean>(false);
  const [simulatingError, setSimulatingError] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'errors' | 'incidents' | 'setup'>('overview');
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handlePingNow = async () => {
    setPinging(true);
    try {
      const res = await fetch('/api/check', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Pinged ${data.result.url}: ${data.result.status.toUpperCase()} (${data.result.responseTimeMs} ms)`);
        await fetchStats();
      } else {
        showToast('Ping check failed');
      }
    } catch {
      showToast('Network error during manual ping');
    } finally {
      setPinging(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch('/api/test-alert', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Test alert email sent successfully! Check your inbox.');
      } else {
        showToast(`❌ Email failed: ${data.message}`);
      }
    } catch {
      showToast('❌ Network error sending test email');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSimulateError = async () => {
    if (!stats) return;
    setSimulatingError(true);
    try {
      const res = await fetch('/api/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stats.apiKey}`,
        },
        body: JSON.stringify({
          type: 'Uncaught Exception',
          message: 'DatabaseConnectionException: Access denied for user root@localhost on table student_attendance',
          file: '/home/hclk/public_html/KCM/db_connect.php',
          line: 29,
          url: 'https://hc.lk/KCM/api/atten_sync.php',
          method: 'POST',
          clientIp: '192.168.1.104',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
          environment: 'production',
          trace: '#0 /home/hclk/public_html/KCM/db_connect.php(29): mysqli->query()\n#1 /home/hclk/public_html/KCM/api/atten_sync.php(14): require_once()\n#2 {main}',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.emailSent ? '⚠️ Test error logged & alert email dispatched!' : '⚠️ Test error logged (cooldown/rate limit active).');
        await fetchStats();
        setActiveTab('errors');
      } else {
        showToast(`Failed to report: ${data.error}`);
      }
    } catch {
      showToast('Network error simulating error');
    } finally {
      setSimulatingError(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all error and incident logs?')) return;
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
      showToast('Logs cleared');
      await fetchStats();
    } catch {
      showToast('Failed to clear logs');
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'snippet') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
    showToast('Copied to clipboard!');
  };

  const filteredErrors = (stats?.errors || []).filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.message.toLowerCase().includes(q) ||
      (e.file && e.file.toLowerCase().includes(q)) ||
      e.type.toLowerCase().includes(q);
  });

  const phpSnippet = `<?php
/**
 * HC Sentinel Error Reporter for KCM
 * Put this in KCM root and include at top of db_connect.php:
 *   require_once __DIR__ . '/kcm_error_handler.php';
 */
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        kcm_report_error_to_sentinel('Fatal Error', $error['message'], $error['file'], $error['line']);
    }
});

set_exception_handler(function(Throwable $e) {
    kcm_report_error_to_sentinel(get_class($e), $e->getMessage(), $e->getFile(), $e->getLine(), $e->getTraceAsString());
});

function kcm_report_error_to_sentinel($type, $message, $file, $line, $trace = '') {
    $endpoint = '${typeof window !== 'undefined' ? window.location.origin : 'https://your-monitor.vercel.app'}/api/errors/report';
    $apiKey = '${stats?.apiKey || 'kcm-sentinel-secret-2026'}';
    
    // Cooldown check using temporary file
    $hash = md5($message . $file . $line);
    $lockFile = sys_get_temp_dir() . '/kcm_err_' . $hash;
    if (file_exists($lockFile) && (time() - filemtime($lockFile) < 300)) return;
    @touch($lockFile);

    $payload = json_encode([
        'type' => $type,
        'message' => $message,
        'file' => $file,
        'line' => $line,
        'trace' => $trace,
        'url' => (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'hc.lk') . ($_SERVER['REQUEST_URI'] ?? ''),
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
        'clientIp' => $_SERVER['REMOTE_ADDR'] ?? '',
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'environment' => (strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') !== false) ? 'development' : 'production',
        'timestamp' => date('c'),
    ]);

    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    @curl_exec($ch);
    @curl_close($ch);
}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-black">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-700 text-white px-5 py-3 rounded-lg shadow-2xl flex items-center space-x-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">HC Sentinel</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Vercel Real-Time
                </span>
              </div>
              <p className="text-xs text-slate-400">Independent Uptime & KCM Error Watcher</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={handlePingNow}
              disabled={pinging}
              className="px-3 py-1.5 text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-slate-200 flex items-center space-x-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${pinging ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Ping hc.lk</span>
              <span className="sm:hidden">Ping</span>
            </button>

            <button
              onClick={handleTestEmail}
              disabled={testingEmail}
              className="px-3 py-1.5 text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-slate-200 flex items-center space-x-2 transition cursor-pointer"
              title="Send a verification test email"
            >
              <Mail className={`w-4 h-4 ${testingEmail ? 'animate-pulse text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Test Alert Email</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Target Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 mt-1">
                <Globe className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Target Monitored Domain</span>
                  <a
                    href={stats?.targetUrl || 'https://hc.lk'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
                  {stats?.targetUrl || 'https://hc.lk'}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Last checked:{' '}
                  {stats?.lastCheck
                    ? new Date(stats.lastCheck.timestamp).toLocaleTimeString()
                    : 'Awaiting first ping...'}
                  {stats?.lastCheck?.httpStatus && ` • HTTP ${stats.lastCheck.httpStatus}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 border border-slate-700">
                <span className={`w-3 h-3 rounded-full animate-pulse ${
                  stats?.currentStatus === 'operational'
                    ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                    : stats?.currentStatus === 'down'
                    ? 'bg-rose-500 shadow-lg shadow-rose-500/50'
                    : 'bg-amber-500 shadow-lg shadow-amber-500/50'
                }`} />
                <span className="font-semibold text-sm capitalize">
                  {stats?.currentStatus || 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Status */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Domain Health</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-white capitalize">
                {stats?.currentStatus || 'Checking...'}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                stats?.currentStatus === 'operational' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {stats?.currentStatus === 'operational' ? '200 OK' : 'ISSUE'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Active since: {stats?.statusSince ? new Date(stats.statusSince).toLocaleDateString() : 'Now'}
            </div>
          </div>

          {/* Card 2: Latency */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Response Latency</span>
              <Clock className="w-4 h-4 text-teal-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-white">
                {stats?.lastCheck ? `${stats.lastCheck.responseTimeMs} ms` : '--'}
              </div>
              <span className="text-xs text-slate-400">
                Avg: {stats?.avgLatency ? `${stats.avgLatency} ms` : '--'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {stats?.lastCheck && stats.lastCheck.responseTimeMs < 300
                ? '⚡ Fast response speed'
                : 'Normal response speed'}
            </div>
          </div>

          {/* Card 3: Uptime */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Uptime Ratio</span>
              <Server className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-white">
                {stats?.uptimePercentage ?? 100}%
              </div>
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-semibold">
                Reliable
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {stats?.incidents?.length || 0} incidents recorded
            </div>
          </div>

          {/* Card 4: KCM Errors */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>KCM System Errors</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-white">
                {stats?.errors?.length || 0}
              </div>
              <button
                onClick={handleSimulateError}
                disabled={simulatingError}
                className="text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-2 py-1 rounded font-medium transition cursor-pointer"
                title="Send test error from KCM"
              >
                Simulate Error
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Email alert recipient: {stats?.alertRecipient || 'Not Set'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 mb-6 space-x-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-4 text-sm font-semibold transition border-b-2 cursor-pointer ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview & Latency
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`pb-3 px-4 text-sm font-semibold transition border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'errors'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>KCM System Errors</span>
            {stats && stats.errors.length > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                {stats.errors.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`pb-3 px-4 text-sm font-semibold transition border-b-2 cursor-pointer ${
              activeTab === 'incidents'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Downtime Incidents
          </button>
          <button
            onClick={() => setActiveTab('setup')}
            className={`pb-3 px-4 text-sm font-semibold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'setup'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>KCM Integration Code</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW & LATENCY */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Latency History Graph / Blocks */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white">Recent Health & Latency History</h3>
                  <p className="text-xs text-slate-400">Response time check sequence (last 30 samples)</p>
                </div>
                <div className="flex items-center space-x-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> &lt;300ms
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> &lt;800ms
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> Down/Slow
                  </span>
                </div>
              </div>

              {/* Visual Bars */}
              <div className="grid grid-cols-15 sm:grid-cols-30 gap-1.5 h-20 items-end bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                {(stats?.recentChecks && stats.recentChecks.length > 0) ? (
                  [...stats.recentChecks].reverse().map((chk, idx) => {
                    const heightPercent = Math.min(100, Math.max(15, (chk.responseTimeMs / 800) * 100));
                    const barColor = chk.status === 'down'
                      ? 'bg-rose-500'
                      : chk.responseTimeMs > 800
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';

                    return (
                      <div
                        key={idx}
                        className="group relative flex-1 flex flex-col justify-end h-full"
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-xs ${barColor} transition-all duration-300 group-hover:opacity-80`}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-slate-800 text-white text-[11px] p-2 rounded shadow-xl border border-slate-700 whitespace-nowrap z-30 pointer-events-none">
                          <span className="font-bold">{chk.responseTimeMs} ms</span>
                          <span className="text-slate-400">{new Date(chk.timestamp).toLocaleTimeString()}</span>
                          <span className="capitalize">{chk.status}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full h-full flex items-center justify-center text-xs text-slate-500">
                    No recent checks yet. Click &ldquo;Ping hc.lk&rdquo; above to record your first sample.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Email Config Status Alert */}
            {!stats?.isMailConfigured && (
              <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-5 flex items-start space-x-3 text-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <h4 className="font-semibold text-amber-300">Email Notification Channel Pending Setup</h4>
                  <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">
                    Set your <code className="bg-black/30 px-1 py-0.5 rounded font-mono">SMTP_USER</code>, <code className="bg-black/30 px-1 py-0.5 rounded font-mono">SMTP_PASS</code> (Gmail App Password), and <code className="bg-black/30 px-1 py-0.5 rounded font-mono">ALERT_TO_EMAIL</code> in your <code className="bg-black/30 px-1 py-0.5 rounded font-mono">.env.local</code> or Vercel Environment Variables to receive instantaneous alert emails.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: KCM ERRORS */}
        {activeTab === 'errors' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search errors by message or file name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSimulateError}
                  disabled={simulatingError}
                  className="px-3 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center space-x-1.5 shadow cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Send Test Error</span>
                </button>
                <button
                  onClick={handleClearLogs}
                  className="px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Error List */}
            {filteredErrors.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500/50 mb-3" />
                <h3 className="text-base font-semibold text-slate-200">No System Errors Detected</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Everything in KCM is operating smoothly! Click &ldquo;Send Test Error&rdquo; above to verify how error reporting works.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredErrors.map((err) => (
                  <div
                    key={err.id}
                    onClick={() => setSelectedError(err)}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                  >
                    <div className="flex items-start space-x-3 overflow-hidden">
                      <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                            {err.type}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(err.timestamp).toLocaleString()}
                          </span>
                          {err.environment && (
                            <span className="text-[10px] font-mono uppercase bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                              {err.environment}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-white mt-1 group-hover:text-emerald-400 transition truncate">
                          {err.message}
                        </div>
                        <div className="text-xs font-mono text-slate-400 truncate mt-0.5">
                          {err.file ? `${err.file}:${err.line || ''}` : 'Unknown file'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end space-x-3 shrink-0 text-xs text-slate-400">
                      <span>{err.method || 'GET'} {err.url ? new URL(err.url, 'https://hc.lk').pathname : ''}</span>
                      <span className="text-emerald-400 group-hover:translate-x-1 transition font-medium">View Trace &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INCIDENTS */}
        {activeTab === 'incidents' && (
          <div className="space-y-4">
            {(!stats?.incidents || stats.incidents.length === 0) ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/50 mb-3" />
                <h3 className="text-base font-semibold text-slate-200">Zero Outages Recorded</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  hc.lk has not experienced any downtime during the current observation period.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        inc.resolvedAt ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {inc.resolvedAt ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-rose-400" />}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            inc.resolvedAt ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {inc.resolvedAt ? 'RESOLVED' : 'ONGOING OUTAGE'}
                          </span>
                          <span className="text-xs text-slate-400">{inc.target}</span>
                        </div>
                        <div className="text-sm font-semibold text-white mt-1">
                          {inc.reason}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Started: {new Date(inc.startedAt).toLocaleString()}
                          {inc.resolvedAt && ` • Duration: ${inc.durationSeconds}s`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETUP & CODE */}
        {activeTab === 'setup' && (
          <div className="space-y-6">
            {/* Credentials Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-base font-semibold text-white mb-2">API Webhook Credentials</h3>
              <p className="text-xs text-slate-400 mb-4">
                Use this API Key in your KCM PHP configuration to authenticate error telemetry reports.
              </p>
              <div className="flex items-center space-x-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <Key className="w-4 h-4 text-emerald-400 shrink-0" />
                <code className="text-xs font-mono text-emerald-300 flex-1 truncate">
                  {stats?.apiKey || 'kcm-sentinel-secret-2026'}
                </code>
                <button
                  onClick={() => copyToClipboard(stats?.apiKey || 'kcm-sentinel-secret-2026', 'key')}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition cursor-pointer"
                  title="Copy API Key"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* PHP Integration Snippet */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-white">PHP Integration Code for KCM</h3>
                  <p className="text-xs text-slate-400">Save as <code className="text-emerald-400 font-mono">kcm_error_handler.php</code> inside <code className="text-emerald-400 font-mono">c:\wamp64\www\KCM\</code></p>
                </div>
                <button
                  onClick={() => copyToClipboard(phpSnippet, 'snippet')}
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSnippet ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>

              <pre className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-96 leading-relaxed">
                {phpSnippet}
              </pre>

              <div className="mt-4 p-4 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-300">
                <strong>How to activate in KCM:</strong> Add this one line at the very top of <code className="font-mono bg-black/40 px-1 py-0.5 rounded">db_connect.php</code> or <code className="font-mono bg-black/40 px-1 py-0.5 rounded">config.php</code>:<br />
                <code className="block mt-2 font-mono bg-black/60 p-2 rounded text-emerald-400">&lt;?php require_once __DIR__ . &apos;/kcm_error_handler.php&apos;; ?&gt;</code>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal for Error Details */}
      {selectedError && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400">
                  {selectedError.type}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(selectedError.timestamp).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Error Message
                </label>
                <div className="bg-rose-950/30 border border-rose-900/60 p-3 rounded-lg text-rose-300 font-mono text-xs break-all leading-relaxed">
                  {selectedError.message}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5 font-medium">File Location</span>
                  <span className="font-mono text-slate-200 break-all">{selectedError.file || 'N/A'}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5 font-medium">Line Number</span>
                  <span className="font-mono text-slate-200">{selectedError.line || 'N/A'}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5 font-medium">Request URL</span>
                  <span className="font-mono text-slate-200 break-all">{selectedError.method} {selectedError.url || 'N/A'}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5 font-medium">Client IP</span>
                  <span className="font-mono text-slate-200">{selectedError.clientIp || 'N/A'}</span>
                </div>
              </div>

              {selectedError.trace && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Stack Trace
                  </label>
                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-slate-300 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap">
                    {selectedError.trace}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex justify-end">
              <button
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
