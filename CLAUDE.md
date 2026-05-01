# CLAUDE.md — Health Dashboard

## What This Project Is

A personal health dashboard. Frontend on Vercel. Health data in Supabase. Credentials managed via `/admin.html`.

## Architecture

- `index.html` — Shell, sidebar nav, loads Supabase CDN + app.js
- `app.js` — Router, Supabase client, fetchData(), sidebar gating
- `styles.css` — Global styles (lime `#C8FF00` on `#0A0A0A`, Inter font)
- `views/` — Individual view files (blood.html, etc.)
- `admin.html` — Setup wizard + credentials dashboard
- `api/setup.js` — First-time setup, checks tables, sets admin password
- `api/credentials.js` — CRUD for stored credentials
- `scripts/push.sh` — Auto-push using credentials from admin API

## Pushing Code

Never ask the user to open Terminal. Use the push script:

```bash
bash scripts/push.sh
```

This reads `.env` for SITE_URL and ADMIN_PASSWORD, fetches the GitHub token from `/api/credentials`, and pushes automatically.

Required `.env` values:
```
SITE_URL=https://health-dashboard-two-gamma.vercel.app
ADMIN_PASSWORD=<the admin password set on /admin.html>
```

## Supabase Tables

**biomarker_tests:** id, test_type, test_date, created_at
**biomarker_results:** id, test_id (FK), marker_name, value, unit, range_low, range_high, category, created_at
**credentials:** id, service_name, key_name, key_value, created_at, updated_at (RLS enabled)

## Data Format

fetchData() returns:
```json
{ "tests": [{ "date": "2026-04-30", "markers": [{ "name": "...", "value": 45, "unit": "ng/mL", "range": { "low": 30, "high": 100 }, "category": "Vitamins" }] }] }
```

## Design System

- Background: `#0A0A0A`, Accent: `#C8FF00`, Surface: `#141414`, Border: `#1E1E1E`
- Success: `#4ADE80`, Warning: `#FBBF24`, Danger: `#F87171`, Info: `#60A5FA`
- Font: Inter, Border radius: 12px cards / 8px small

## Critical Rules

1. Never commit `.env` or `/data/` to GitHub
2. Never hardcode health data in views — fetch from Supabase
3. Never guess medical reference ranges — ask the user
4. Use empty states for every view
5. Push via `scripts/push.sh`, never ask user to use Terminal
