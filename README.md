# 🛡️ HC Sentinel - Uptime & Real-Time Error Telemetry Monitor

An independent, standalone monitoring dashboard built with **Next.js 16 (App Router)**, **TypeScript**, and **Tailwind CSS**. Designed to be deployed **100% free on Vercel**.

---

## 🌟 Key Capabilities

1. **Independent `hc.lk` Outage Alerting (Vercel Cron)**
   - Pings `https://hc.lk` automatically every 5 minutes from Vercel's edge cloud.
   - Dispatches instant HTML email alerts when the site goes **DOWN** (HTTP 500/502/503, DNS crash, connection timeout).
   - Dispatches a recovery notification when `hc.lk` comes **BACK ONLINE**.

2. **Real-Time KCM PHP Error Telemetry (Webhook)**
   - Exposes a secure API endpoint (`POST /api/errors/report`) with API Key authentication.
   - Any Fatal Error, Uncaught Exception, or Database Failure in KCM is caught and transmitted immediately.
   - Sends a rich email alert with File Name, Line Number, Message, Client IP, and Stack Trace.
   - Built-in 5-minute cooldown to prevent email flooding during error loops.

3. **Live Modern Dashboard**
   - Real-time health indicators (🟢 Operational / 🔴 Outage).
   - Response latency sparkline / visual history.
   - Interactive error log with search, filter, and detail modal.
   - One-click buttons to **Ping hc.lk**, **Test Alert Email**, and **Simulate Error**.

---

## 🚀 How to Run Locally

```bash
cd C:\wamp64\www\hc-monitor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ How to Deploy to Vercel (100% Free)

### Method 1: Via GitHub (Recommended)

1. Create a new GitHub repository (e.g. `hc-monitor`).
2. Push this folder to GitHub:
   ```bash
   cd C:\wamp64\www\hc-monitor
   git init
   git add .
   git commit -m "Initial commit of HC Sentinel Monitor"
   git branch -M main
   git remote add origin https://github.com/<your-username>/hc-monitor.git
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
4. Import your `hc-monitor` repository.
5. In **Environment Variables**, add:
   - `TARGET_URL`: `https://hc.lk`
   - `ALERT_TO_EMAIL`: `your-email@gmail.com` (where you want to receive alerts)
   - `SMTP_USER`: `hcuniverse74@gmail.com`
   - `SMTP_PASS`: Your 16-character Gmail App Password
   - `API_SECRET_KEY`: `kcm-sentinel-secret-2026` (or any random secret string)
6. Click **Deploy**. Done! Your monitor will be live at `https://<your-project>.vercel.app`.

---

## 🔌 Linking KCM (`hc.lk`) to HC Sentinel

We have already created `kcm_error_handler.php` inside `c:\wamp64\www\KCM\kcm_error_handler.php`.

### Step 1: Open `kcm_error_handler.php`
Update `SENTINEL_ENDPOINT` with your live Vercel URL:
```php
define('SENTINEL_ENDPOINT', 'https://<your-project>.vercel.app/api/errors/report');
```

### Step 2: Include it at the very top of `db_connect.php`
Open `c:\wamp64\www\KCM\db_connect.php` and add line 2:
```php
<?php
require_once __DIR__ . '/kcm_error_handler.php';
```

Now, whenever an unhandled exception, database error, or fatal error happens in KCM, it will automatically alert your email in real time!
