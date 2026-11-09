<?php
/**
 * ============================================================================
 * HC Sentinel - Real-Time PHP Error & Exception Reporter for KCM
 * ============================================================================
 * Automatically catches:
 *  - Unhandled Exceptions & Throwables
 *  - Fatal PHP Errors & Parse Errors (via shutdown function)
 *  - Database Connection Failures
 *
 * Sends a real-time JSON alert to your Next.js monitor hosted on Vercel.
 * Built with timeout protection (max 2s) and rate-limiting cooldowns (300s).
 */

if (!defined('SENTINEL_API_KEY')) {
    define('SENTINEL_API_KEY', getenv('SENTINEL_API_KEY') ?: 'kcm-sentinel-secret-2026');
}

if (!defined('SENTINEL_ENDPOINT')) {
    // Replace this with your live Vercel URL once deployed, e.g.:
    // 'https://your-monitor.vercel.app/api/errors/report'
    define('SENTINEL_ENDPOINT', getenv('SENTINEL_ENDPOINT') ?: 'https://webmonitor-eta.vercel.app/api/errors/report');
}

/**
 * 1. Register Fatal Error Shutdown Handler
 */
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        kcm_dispatch_sentinel_alert(
            'Fatal Error',
            $error['message'],
            $error['file'],
            $error['line']
        );
    }
});

/**
 * 2. Register Global Uncaught Exception Handler
 */
set_exception_handler(function(Throwable $e) {
    kcm_dispatch_sentinel_alert(
        get_class($e),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine(),
        $e->getTraceAsString()
    );

    // Continue standard PHP error logging
    error_log("[KCM Sentinel] Uncaught " . get_class($e) . ": " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());

    // Display clean error response to client if in JSON/API mode
    if (!headers_sent()) {
        http_response_code(500);
        if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false || strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false) {
            header('Content-Type: application/json');
            echo json_encode(['status' => 'error', 'message' => 'Internal server error has occurred. Administrators have been notified.']);
            exit;
        }
    }
});

/**
 * 3. Core Dispatch Function
 */
function kcm_dispatch_sentinel_alert(string $type, string $message, string $file, int $line, string $trace = ''): bool
{
    // Cooldown check: prevent duplicate spam within 5 minutes (300 seconds)
    $hash = md5($type . $message . $file . $line);
    $lockFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'kcm_err_' . $hash . '.tmp';
    
    if (file_exists($lockFile) && (time() - filemtime($lockFile) < 300)) {
        return false; // Cooldown active, skip to protect SMTP limits
    }
    @touch($lockFile);

    // Detect environment
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $isLocal = ($host === 'localhost' || $host === '127.0.0.1' || strpos($host, '192.168.') !== false);
    $environment = $isLocal ? 'development' : 'production';

    $currentUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') 
        . '://' . ($host) 
        . ($_SERVER['REQUEST_URI'] ?? '');

    $payload = json_encode([
        'type' => $type,
        'message' => $message,
        'file' => $file,
        'line' => $line,
        'trace' => $trace,
        'url' => $currentUrl,
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'CLI',
        'clientIp' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? 'CLI/Cron',
        'environment' => $environment,
        'timestamp' => date('c'),
    ]);

    // Send HTTP POST asynchronously with short timeout (max 2 seconds)
    if (function_exists('curl_init')) {
        $ch = curl_init(SENTINEL_ENDPOINT);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . SENTINEL_API_KEY,
            'User-Agent: KCM-Sentinel-Client/1.0',
        ]);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        @curl_exec($ch);
        @curl_close($ch);
        return true;
    }

    return false;
}
