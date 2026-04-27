/* ========================================
   Health Dashboard — App Controller
   Handles: routing, view loading, API calls
   ======================================== */

const App = {
    // === CONFIGURATION ===
    // Set this to your VPS API URL after running setup.sh
    API_BASE: '', // e.g. 'https://your-vps-ip:3000/api' or 'http://localhost:3000/api'

    // === REGISTERED VIEWS ===
    // Add new views here as you build them
    views: {
        overview: { label: '📊 Overview', section: 'Home', file: 'views/overview.html' }
        // Example: uncomment as you add tests
        // blood:    { label: '🩸 Blood Report', section: 'Tests', file: 'views/blood.html' },
        // vo2max:   { label: '🫁 VO2 Max',     section: 'Tests', file: 'views/vo2max.html' },
        // dexa:     { label: '🦴 DEXA Scan',    section: 'Tests', file: 'views/dexa.html' },
        // gut:      { label: '🦠 Gut Biome',    section: 'Tests', file: 'views/gut.html' },
        // protocol: { label: '📋 My Protocol',  section: 'Actions', file: 'views/protocol.html' },
    },

    currentView: 'overview',

    // === INIT ===
    init() {
        this.buildNav();
        this.bindEvents();

        // Load view from URL hash or default
        const hash = window.location.hash.replace('#', '');
        if (hash && this.views[hash]) {
            this.loadView(hash);
        } else {
            this.loadView('overview');
        }
    },

    // === NAVIGATION ===
    buildNav() {
        const navEl = document.getElementById('navLinks');
        let html = '';
        let currentSection = '';

        for (const [key, view] of Object.entries(this.views)) {
            if (view.section !== currentSection) {
                currentSection = view.section;
                html += `<li class="nav-section">${currentSection}</li>`;
            }
            html += `<li><a href="#${key}" class="nav-link${key === this.currentView ? ' active' : ''}" data-view="${key}">${view.label}</a></li>`;
        }

        navEl.innerHTML = html;
    },

    bindEvents() {
        // Nav clicks
        document.getElementById('navLinks').addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (!link) return;
            e.preventDefault();
            const view = link.dataset.view;
            this.loadView(view);
        });

        // Hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '');
            if (hash && this.views[hash] && hash !== this.currentView) {
                this.loadView(hash);
            }
        });
    },

    // === VIEW LOADING ===
    async loadView(viewName) {
        const view = this.views[viewName];
        if (!view) return;

        this.currentView = viewName;
        window.location.hash = viewName;

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.toggle('active', el.dataset.view === viewName);
        });

        // Load view HTML
        const container = document.getElementById('view-container');
        try {
            const response = await fetch(view.file);
            if (!response.ok) throw new Error('View not found');
            container.innerHTML = await response.text();

            // If the view has an init function, call it
            if (window[`init_${viewName}`]) {
                window[`init_${viewName}`]();
            }
        } catch (err) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>View not found</h3>
                    <p>The "${view.label}" view hasn't been created yet. Ask Claude to build it!</p>
                </div>
            `;
        }
    },

    // === API HELPERS ===
    async fetchData(endpoint) {
        if (!this.API_BASE) {
            console.warn('API_BASE not configured. Set it in app.js after VPS setup.');
            return null;
        }
        try {
            const res = await fetch(`${this.API_BASE}/${endpoint}`);
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`Failed to fetch ${endpoint}:`, err);
            return null;
        }
    },

    // === UTILITY FUNCTIONS ===
    // Status badge based on value vs range
    getStatus(value, range, optimal) {
        if (optimal && value >= optimal.low && value <= optimal.high) return 'optimal';
        if (value >= range.low && value <= range.high) return 'normal';
        const distance = value < range.low
            ? (range.low - value) / range.low
            : (value - range.high) / range.high;
        return distance > 0.2 ? 'danger' : 'warning';
    },

    // Format numbers nicely
    formatValue(value) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'number') {
            return value % 1 === 0 ? value.toString() : value.toFixed(1);
        }
        return value;
    },

    // Badge HTML
    badge(status, text) {
        return `<span class="badge badge-${status}">${text || status}</span>`;
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
