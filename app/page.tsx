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
  Shield,
  Trash2,
  XCircle,
  X,
  Play,
  Code,
  Bell,
  Cpu,
  Layers,
  ChevronRight,
  Send
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
  const [activeTab, setActiveTab] = useState<'errors' | 'latency' | 'incidents' | 'setup'>('errors');
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorFilter, setErrorFilter] = useState<'ALL' | 'FATAL' | 'EXCEPTION'>('ALL');
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
    const interval = setInterval(fetchStats, 15000);
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

  const handleTestEmail = async (type: 'verification' | 'recovery' | 'downtime' = 'verification') => {
    setTestingEmail(true);
    try {
      const res = await fetch('/api/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(type === 'recovery' ? 'Sample [Restored] email sent! Check inbox.' : 'Test alert email dispatched successfully! Check inbox.');
      } else {
        showToast(`Email alert failed: ${data.message}`);
      }
    } catch {
      showToast('Network error sending test email');
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
          message: 'DatabaseConnectionException: Access denied for user hclk_hclk@localhost on table stu-attendance',
          file: '/home/hclk/public_html/KCM/db_connect.php',
          line: 34,
          url: 'https://hc.lk/KCM/api/atten_sync.php',
          method: 'POST',
          clientIp: '124.43.18.91',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          environment: 'production',
          trace: '#0 /home/hclk/public_html/KCM/db_connect.php(34): mysqli->__construct()\n#1 /home/hclk/public_html/KCM/api/atten_sync.php(18): require_once()\n#2 {main}',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.emailSent ? 'Test error logged & alert email dispatched!' : 'Test error logged (rate limit cooldown active).');
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
      showToast('Logs cleared successfully');
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
    const matchesSearch = !searchQuery || 
      e.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.file && e.file.toLowerCase().includes(searchQuery.toLowerCase())) ||
      e.type.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (errorFilter === 'FATAL') return e.type.toLowerCase().includes('fatal');
    if (errorFilter === 'EXCEPTION') return e.type.toLowerCase().includes('exception');
    return true;
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
    $endpoint = '${typeof window !== 'undefined' ? window.location.origin : 'https://webmonitor-eta.vercel.app'}/api/errors/report';
    $apiKey = '${stats?.apiKey || 'kcm-sentinel-secret-2026'}';
    
    // Cooldown check using temporary file (300 seconds)
    $hash = md5($message . $file . $line);
    $lockFile = sys_get_temp_dir() . '/kcm_err_' . $hash . '.tmp';
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
    curl_setopt($ch, CURLOPT_TIMEOUT, 2);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    @curl_exec($ch);
    @curl_close($ch);
}`;

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 font-sans selection:bg-slate-700 selection:text-white pb-16">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 left-5 sm:left-auto sm:max-w-md z-50 glass-panel bg-slate-900/90 text-slate-100 px-4 py-3 rounded-xl border border-white/10 shadow-2xl flex items-center space-x-3">
          <Activity className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">HC Sentinel</span>
                <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-white/10">
                  3D Bento
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Standalone Outage & Telemetry Monitor</p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={handlePingNow}
              disabled={pinging}
              className="btn-3d px-3.5 py-2 text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-2 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pinging ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Ping Target</span>
              <span className="sm:hidden">Ping</span>
            </button>

            <button
              onClick={() => handleTestEmail('verification')}
              disabled={testingEmail}
              className="btn-3d px-3.5 py-2 text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-2 cursor-pointer active:scale-95"
              title="Send a verification test email"
            >
              <Mail className={`w-3.5 h-3.5 ${testingEmail ? 'animate-pulse text-amber-400' : ''}`} />
              <span className="hidden md:inline">Test Alert Email</span>
              <span className="md:hidden">Test Email</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        
        {/* ========================================================= */}
        {/* BENTO GRID (Hero Layout) */}
        {/* ========================================================= */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
          
          {/* BENTO 1: Target Hero Card (Col-span 2 on md & lg) */}
          <div className="md:col-span-2 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Target Monitored Domain</span>
                  <a
                    href={stats?.targetUrl || 'https://hc.lk'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-white/5"
                  >
                    <span>Visit</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* 3D Status Chip */}
                <div className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border ${
                  stats?.currentStatus === 'operational'
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : stats?.currentStatus === 'down'
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    stats?.currentStatus === 'operational'
                      ? 'bg-emerald-400'
                      : stats?.currentStatus === 'down'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                  }`} />
                  <span>{stats?.currentStatus || 'Checking...'}</span>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white break-all">
                {stats?.targetUrl || 'https://hc.lk'}
              </h1>
            </div>

            {/* Recessed Sub-Metrics Row */}
            <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="depth-recessed p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Latency</span>
                <span className="text-lg font-bold text-white mt-0.5 block">
                  {stats?.lastCheck?.responseTimeMs !== undefined ? `${stats.lastCheck.responseTimeMs} ms` : '--'}
                </span>
              </div>

              <div className="depth-recessed p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">HTTP Response</span>
                <span className="text-lg font-bold text-white mt-0.5 block">
                  {stats?.lastCheck?.httpStatus ? `HTTP ${stats.lastCheck.httpStatus}` : (stats?.currentStatus === 'down' ? 'Down / Error' : '200 OK')}
                </span>
              </div>

              <div className="depth-recessed p-3 rounded-xl col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Last Verification</span>
                <span className="text-xs font-semibold text-slate-300 mt-1 block truncate">
                  {stats?.lastCheck ? new Date(stats.lastCheck.timestamp).toLocaleTimeString() : 'Awaiting check'}
                </span>
              </div>
            </div>
          </div>

          {/* BENTO 2: 24h Availability & Uptime Ratio */}
          <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Uptime Ratio</span>
              <Server className="w-4 h-4 text-slate-300" />
            </div>

            <div className="my-4">
              <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {stats?.uptimePercentage ?? 100}%
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Measured over last 30 intervals
              </div>
            </div>

            <div className="depth-recessed p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-300">
              <span>Checking interval:</span>
              <span className="font-bold text-white">Every 5 mins</span>
            </div>
          </div>

          {/* BENTO 3: Alert Dispatch Channel Health */}
          <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Alert Channel</span>
              <Bell className="w-4 h-4 text-slate-300" />
            </div>

            <div className="my-3">
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${stats?.isMailConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-sm font-bold text-white">
                  {stats?.isMailConfigured ? 'Active Dispatcher' : 'Pending Config'}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-1.5 truncate" title={stats?.rawAlertRecipient}>
                {stats?.alertRecipient || 'Not Configured'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => handleTestEmail('verification')}
                disabled={testingEmail}
                className="btn-3d py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
              >
                Test Alert
              </button>
              <button
                onClick={() => handleTestEmail('recovery')}
                disabled={testingEmail}
                className="btn-3d py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg cursor-pointer"
                title="Send a sample Service Restored email"
              >
                Test Restored
              </button>
            </div>
          </div>

          {/* BENTO 4: Outage Incidents */}
          <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Outages Logged</span>
              <XCircle className="w-4 h-4 text-slate-300" />
            </div>

            <div className="my-3">
              <div className="text-3xl font-extrabold text-white">
                {stats?.incidents?.length || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Total observed downtime events
              </div>
            </div>

            <button
              onClick={() => setActiveTab('incidents')}
              className="btn-3d w-full py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center space-x-1 cursor-pointer"
            >
              <span>View Outages</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* BENTO 5: KCM System Errors Count */}
          <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">KCM Errors</span>
              <AlertTriangle className="w-4 h-4 text-slate-300" />
            </div>

            <div className="my-3">
              <div className="text-3xl font-extrabold text-white">
                {stats?.errors?.length || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Caught exceptions & fatal errors
              </div>
            </div>

            <button
              onClick={handleSimulateError}
              disabled={simulatingError}
              className="btn-3d w-full py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Play className="w-3 h-3 text-amber-400" />
              <span>Simulate Error</span>
            </button>
          </div>

          {/* BENTO 6: Response Latency Spectrum (Col-span 2 on md & lg) */}
          <div className="md:col-span-2 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Latency Spectrum</span>
                <span className="text-xs text-slate-400">Past 30 verification intervals</span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-emerald-500" /> Fast (&lt;300ms)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-rose-500" /> Down/Slow
                </span>
              </div>
            </div>

            {/* Recessed Latency Bars */}
            <div className="depth-recessed h-24 p-2.5 rounded-xl flex items-end gap-1 overflow-x-auto">
              {(stats?.recentChecks && stats.recentChecks.length > 0) ? (
                [...stats.recentChecks].reverse().map((chk, idx) => {
                  const barHeight = Math.min(100, Math.max(16, (chk.responseTimeMs / 800) * 100));
                  const isDown = chk.status === 'down';
                  const isSlow = chk.responseTimeMs > 800;
                  const barColor = isDown ? 'bg-rose-500' : isSlow ? 'bg-amber-500' : 'bg-emerald-500';

                  return (
                    <div
                      key={idx}
                      className="group relative flex-1 min-w-[8px] flex flex-col justify-end h-full"
                    >
                      <div
                        style={{ height: `${barHeight}%` }}
                        className={`w-full rounded-xs ${barColor} hover:opacity-80 transition-all`}
                      />
                      {/* Tooltip on Hover */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-2 rounded-md border border-white/10 shadow-xl whitespace-nowrap z-30 pointer-events-none">
                        <span className="font-bold">{chk.responseTimeMs} ms</span>
                        <span className="text-slate-400">{new Date(chk.timestamp).toLocaleTimeString()}</span>
                        <span className="capitalize text-slate-300">{chk.status}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                  No checks recorded yet. Click &ldquo;Ping Target&rdquo; above.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* INTERACTIVE TABS */}
        {/* ========================================================= */}
        <div className="flex border-b border-white/10 mb-6 gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('errors')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold tracking-tight rounded-t-lg transition flex items-center space-x-2 border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'errors'
                ? 'border-emerald-400 text-white bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>KCM System Errors</span>
            {stats && stats.errors.length > 0 && (
              <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-xs font-bold border border-white/10">
                {stats.errors.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold tracking-tight rounded-t-lg transition flex items-center space-x-2 border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'incidents'
                ? 'border-emerald-400 text-white bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <XCircle className="w-4 h-4 text-rose-400" />
            <span>Outages History</span>
            {stats && stats.incidents.length > 0 && (
              <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-xs font-bold border border-white/10">
                {stats.incidents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('setup')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold tracking-tight rounded-t-lg transition flex items-center space-x-2 border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'setup'
                ? 'border-emerald-400 text-white bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-4 h-4 text-slate-300" />
            <span>KCM PHP Integration</span>
          </button>
        </div>

        {/* TAB 1: KCM SYSTEM ERRORS */}
        {activeTab === 'errors' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-lg">
                <input
                  type="text"
                  placeholder="Filter errors by message, file, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full depth-recessed rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 border border-white/5 focus:outline-none focus:border-slate-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <div className="depth-recessed p-1 rounded-xl flex items-center space-x-1">
                  <button
                    onClick={() => setErrorFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                      errorFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setErrorFilter('FATAL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                      errorFilter === 'FATAL' ? 'bg-slate-800 text-rose-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Fatal
                  </button>
                  <button
                    onClick={() => setErrorFilter('EXCEPTION')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                      errorFilter === 'EXCEPTION' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Exception
                  </button>
                </div>

                <button
                  onClick={handleClearLogs}
                  className="btn-3d px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center space-x-1.5 cursor-pointer"
                  title="Clear error logs"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            </div>

            {/* Error Bento Cards List */}
            {filteredErrors.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
                <h3 className="text-base font-bold text-white">No Errors Recorded</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  KCM system has not thrown any unhandled errors. Click &ldquo;Simulate Error&rdquo; above to verify.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredErrors.map((err) => (
                  <div
                    key={err.id}
                    onClick={() => setSelectedError(err)}
                    className="glass-panel rounded-xl p-4 sm:p-5 hover:bg-slate-900/80 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group active:scale-[0.99]"
                  >
                    <div className="flex items-start space-x-3.5 overflow-hidden">
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-white/5 shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-white/10 uppercase">
                            {err.type}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(err.timestamp).toLocaleString()}
                          </span>
                          {err.environment && (
                            <span className="text-[10px] font-mono uppercase bg-slate-950 px-2 py-0.5 rounded text-slate-400 border border-white/5">
                              {err.environment}
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-bold text-white mt-1.5 group-hover:text-emerald-300 transition truncate">
                          {err.message}
                        </div>

                        <div className="text-xs font-mono text-slate-400 truncate mt-1">
                          {err.file ? `${err.file}:${err.line || ''}` : 'Unknown origin'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end space-x-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5 text-xs text-slate-400">
                      <span className="font-mono text-[11px]">{err.method || 'GET'} {err.url ? new URL(err.url, 'https://hc.lk').pathname : ''}</span>
                      <span className="text-white font-semibold flex items-center space-x-1 group-hover:translate-x-1 transition">
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INCIDENTS HISTORY */}
        {activeTab === 'incidents' && (
          <div className="space-y-4">
            {(!stats?.incidents || stats.incidents.length === 0) ? (
              <div className="glass-panel rounded-2xl p-12 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
                <h3 className="text-base font-bold text-white">Zero Outages Recorded</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  The target domain has maintained complete reachability without downtime.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="glass-panel rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start space-x-3.5">
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-white/5 shrink-0 mt-0.5">
                        {inc.resolvedAt ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase border ${
                            inc.resolvedAt
                              ? 'bg-slate-800 text-emerald-400 border-white/10'
                              : 'bg-rose-950 text-rose-300 border-rose-500/30'
                          }`}>
                            {inc.resolvedAt ? 'RESOLVED' : 'ACTIVE OUTAGE'}
                          </span>
                          <span className="text-xs text-slate-400">{inc.target}</span>
                        </div>

                        <div className="text-sm font-bold text-white mt-1">
                          {inc.reason}
                        </div>

                        <div className="text-xs text-slate-400 mt-1">
                          Detected: {new Date(inc.startedAt).toLocaleString()}
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

        {/* TAB 3: SETUP & CODE */}
        {activeTab === 'setup' && (
          <div className="space-y-6">
            {/* API Key Bento Card */}
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="text-base font-bold text-white mb-1">API Webhook Secret</h3>
              <p className="text-xs text-slate-400 mb-4">
                This token authenticates telemetry payloads dispatched from KCM to your Vercel monitor.
              </p>

              <div className="depth-recessed p-3 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <Key className="w-4 h-4 text-slate-400 shrink-0" />
                  <code className="text-xs font-mono text-slate-200 truncate">
                    {stats?.apiKey || 'kcm-sentinel-secret-2026'}
                  </code>
                </div>
                <button
                  onClick={() => copyToClipboard(stats?.apiKey || 'kcm-sentinel-secret-2026', 'key')}
                  className="btn-3d px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg shrink-0 cursor-pointer"
                >
                  {copiedKey ? 'Copied!' : 'Copy Key'}
                </button>
              </div>
            </div>

            {/* PHP Integration Snippet */}
            <div className="glass-panel rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-white">KCM Error Handler File</h3>
                  <p className="text-xs text-slate-400">Save as <code className="text-slate-200 font-mono">kcm_error_handler.php</code> inside <code className="text-slate-200 font-mono">c:\wamp64\www\KCM\</code></p>
                </div>
                <button
                  onClick={() => copyToClipboard(phpSnippet, 'snippet')}
                  className="btn-3d px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSnippet ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>

              <pre className="depth-recessed p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto max-h-96 leading-relaxed">
                {phpSnippet}
              </pre>

              <div className="mt-4 p-4 rounded-xl depth-recessed text-xs text-slate-300 border border-white/5">
                <span className="font-bold text-white block mb-1">Activation Step in KCM:</span>
                Include this line at the top of <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-white">db_connect.php</code>:
                <code className="block mt-2 font-mono bg-slate-950 p-2.5 rounded-lg text-slate-200 border border-white/5">
                  &lt;?php require_once __DIR__ . &apos;/kcm_error_handler.php&apos;; ?&gt;
                </code>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* 3D GLASS MODAL (Error Details) */}
      {/* ========================================================= */}
      {selectedError && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2.5">
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-white/10 uppercase">
                  {selectedError.type}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(selectedError.timestamp).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="btn-3d p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Exception / Error Message
                </label>
                <div className="depth-recessed p-3.5 rounded-xl font-mono text-xs text-slate-100 break-all leading-relaxed">
                  {selectedError.message}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="depth-recessed p-3 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Source File</span>
                  <span className="font-mono text-slate-200 break-all">{selectedError.file || 'N/A'}</span>
                </div>
                <div className="depth-recessed p-3 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Line Number</span>
                  <span className="font-mono text-slate-200 font-bold">{selectedError.line || 'N/A'}</span>
                </div>
                <div className="depth-recessed p-3 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Trigger URL</span>
                  <span className="font-mono text-slate-200 break-all">{selectedError.method} {selectedError.url || 'N/A'}</span>
                </div>
                <div className="depth-recessed p-3 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Origin IP</span>
                  <span className="font-mono text-slate-200">{selectedError.clientIp || 'N/A'}</span>
                </div>
              </div>

              {selectedError.trace && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      PHP Stack Trace
                    </label>
                    <button
                      onClick={() => copyToClipboard(selectedError.trace || '', 'snippet')}
                      className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Trace</span>
                    </button>
                  </div>
                  <pre className="depth-recessed p-3.5 rounded-xl font-mono text-slate-300 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap">
                    {selectedError.trace}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setSelectedError(null)}
                className="btn-3d px-5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-xl cursor-pointer"
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
