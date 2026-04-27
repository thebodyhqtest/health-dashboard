# CLAUDE.md — Health Dashboard Template

## What This Project Is

A personal health dashboard. The frontend lives on Vercel. Private health data lives on a VPS and is served via API. Data never touches GitHub.

---

## Architecture

- `index.html` — Main shell, sidebar nav, loads views
- `styles.css` — Global styles (Meiro design: lime `#C8FF00` on `#0A0A0A`, Inter font)
- `app.js` — Router, view loader, API fetcher
- `views/` — Individual view files (overview.html, blood.html, etc.)
- `data/` — **Private. VPS only. Never commit to GitHub.**
- `sample-data/` — Example JSON files showing expected format (safe to commit)
- `server/api.js` — Express API that serves data from `/data/` directory
- `scripts/setup.sh` — One-line VPS setup

---

## Data Format Rules

All data files are `.json` (not `.js`).

Blood data format (`data/blood.json`):
```json
{
  "tests": [
    {
      "date": "2026-02-15",
      "lab": "Lab Name",
      "markers": [
        {
          "name": "Vitamin D",
          "value": 45,
          "unit": "ng/mL",
          "range": { "low": 30, "high": 100 },
          "optimal": { "low": 40, "high": 60 },
          "category": "Vitamins"
        }
      ]
    }
  ]
}
```

Every marker must include: `name`, `value`, `unit`, `range`, `category`. `optimal` is optional but preferred.

See `sample-data/` for all supported formats (blood, vo2max, dexa, gut, supplements).

---

## Handling Unknown Tests

When a user provides a test or marker you don't recognize:

1. **Check `sample-data/` first** for format reference
2. **If not found**, create a new entry following the standard marker format
3. **Ask the user** for reference ranges if you're unsure — don't guess medical ranges
4. **Default category:** Use `"Other"` if the category isn't obvious
5. **Log it** — Add a comment in the data file noting it's a new/unverified marker

---

## When Data Changes (User updates a value)

1. Edit the relevant JSON file in `/data/` on the VPS
2. **Do NOT run `vercel deploy`** — the VPS API serves data live
3. Confirm to the user what was updated

---

## When Code Changes (User wants a new view/feature)

1. Edit the relevant files in `views/`, `index.html`, `styles.css`, or `app.js`
2. Register the new view in `app.js` → `App.views` object
3. Add the API route in `server/api.js` if it needs new data
4. Add sample data in `sample-data/<name>.json`
5. **Run `vercel deploy`** to push frontend changes
6. Confirm to the user what was built and that it's live

---

## Design System

- Background: `#0A0A0A`
- Primary accent: `#C8FF00` (lime)
- Text: `#FFFFFF` (primary), `#A0A0A0` (secondary), `#666666` (muted)
- Font: Inter (Google Fonts)
- Surface/cards: `#141414` with `#1E1E1E` border
- Border radius: 12px (cards), 8px (small elements)
- Status colors: Success `#4ADE80`, Warning `#FBBF24`, Danger `#F87171`, Info `#60A5FA`
- Layout: Left sidebar navigation (240px), main content area
- Responsive: Works on mobile and desktop

---

## Creating New Views

Each view is a standalone HTML file in `views/`. To create one:

1. Create `views/<name>.html` with HTML + a `<script>` block
2. Add an `init_<name>()` function — app.js calls it automatically after loading
3. Use `App.fetchData('<endpoint>')` to get data from the VPS API
4. Use `App.badge()`, `App.formatValue()`, `App.getStatus()` helpers
5. Register it in `app.js` → `App.views`
6. Add sample data in `sample-data/<name>.json`

Example view skeleton:
```html
<div class="view-blood">
    <div class="card">
        <div class="card-header">
            <h1 class="card-title">🩸 Blood Report</h1>
        </div>
        <div id="bloodContent"></div>
    </div>
</div>

<script>
async function init_blood() {
    const data = await App.fetchData('blood');
    if (!data) {
        document.getElementById('bloodContent').innerHTML = `
            <div class="empty-state">
                <h3>No blood data yet</h3>
                <p>Upload your blood test results to get started.</p>
            </div>`;
        return;
    }
    // Build your view here using data
}
</script>
```

---

## Critical Rules

1. **Never commit `/data/` to GitHub** — `.gitignore` enforces this
2. **Never hardcode health data in view files** — always fetch from VPS API
3. **Never guess medical reference ranges** — ask the user or use established ranges
4. **Always use JSON format** — no `.js` data files
5. **Keep the design system consistent** — all views should look like they belong together
6. **Use empty states** — every view should handle "no data yet" gracefully
7. **Register views in app.js** — don't create orphan HTML files
