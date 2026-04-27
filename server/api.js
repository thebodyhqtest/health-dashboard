/* ========================================
   Health Dashboard — VPS API Server
   Serves private health data to the frontend
   ======================================== */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// CORS — allow your Vercel frontend
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || '*', // Set to your Vercel URL in production
    methods: ['GET']
}));

app.use(express.json());

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// === OVERVIEW ===
// Returns summary metrics from all available data
app.get('/api/overview', (req, res) => {
    const metrics = [];

    // Blood — latest test summary
    const blood = loadData('blood.json');
    if (blood && blood.tests && blood.tests.length > 0) {
        const latest = blood.tests[blood.tests.length - 1];
        metrics.push({
            label: 'Blood Markers',
            value: latest.markers.length,
            unit: 'tracked',
            status: 'normal'
        });
    }

    // VO2 Max
    const vo2 = loadData('vo2max.json');
    if (vo2 && vo2.tests && vo2.tests.length > 0) {
        const latest = vo2.tests[vo2.tests.length - 1];
        metrics.push({
            label: 'VO2 Max',
            value: latest.vo2max,
            unit: 'mL/kg/min',
            status: latest.percentile >= 75 ? 'optimal' : latest.percentile >= 50 ? 'normal' : 'warning'
        });
    }

    // DEXA
    const dexa = loadData('dexa.json');
    if (dexa && dexa.scans && dexa.scans.length > 0) {
        const latest = dexa.scans[dexa.scans.length - 1];
        metrics.push({
            label: 'Body Fat',
            value: latest.total_body_fat_pct,
            unit: '%',
            status: latest.total_body_fat_pct <= 20 ? 'optimal' : latest.total_body_fat_pct <= 25 ? 'normal' : 'warning'
        });
    }

    res.json({ metrics });
});

// === GENERIC DATA ENDPOINT ===
// GET /api/:dataType — serves any JSON file from /data/
app.get('/api/:dataType', (req, res) => {
    const dataType = req.params.dataType.replace(/[^a-zA-Z0-9_-]/g, '');
    const data = loadData(`${dataType}.json`);

    if (data === null) {
        return res.status(404).json({
            error: 'not_found',
            message: `No data file found for "${dataType}". Upload your data to get started.`
        });
    }

    res.json(data);
});

// === HELPERS ===
function loadData(filename) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Error loading ${filename}:`, err.message);
        return null;
    }
}

// === START ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🧬 Health Dashboard API running on port ${PORT}`);
    console.log(`📁 Data directory: ${DATA_DIR}`);
    console.log(`🌐 CORS origin: ${process.env.ALLOWED_ORIGIN || '* (open)'}`);
});
