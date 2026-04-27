/* ========================================
   Health Dashboard — App Controller
   Handles: routing, view loading, API calls,
   sidebar gating logic
   ======================================== */

const App = {
    // === CONFIGURATION ===
    API_BASE: '', // Set to your VPS API URL after setup, e.g. 'http://YOUR_VPS_IP:3000/api'

    // === DATA CACHE ===
    dataCache: {},

    // === SIDEBAR STRUCTURE ===
    // Gating rules:
    //   always: true        → always clickable
    //   dataKey: 'blood'    → clickable only if that data exists
    //   requireAny: [...]   → clickable if ANY of those data keys exist
    //   requireCount: N     → clickable if N+ different data types exist
    //   parentKey: 'blood'  → entire group hidden if parent data doesn't exist
    sidebar: [
        { id: 'overview', label: '🏠 Overview', always: true },

        { section: '📊 DAILY', collapsible: true },
        { id: 'tracking', label: '📊 Tracking', always: true },
        { id: 'blood-pressure', label: '🫀 Blood Pressure', always: true },
        { id: 'current-focus', label: '🎯 Current Focus', always: true },
        { id: 'log', label: '📋 Log', always: true },
        { id: 'notes', label: '📝 Notes & Ideas', always: true },

        { section: '🧪 TESTS', collapsible: true },
        { id: 'blood', label: '🩸 Blood Report', dataKey: 'blood' },
        { id: 'gut-biome', label: '🦠 Gut Biome', dataKey: 'gut' },
        { id: 'nad', label: '⚡ NAD', dataKey: 'nad' },
        { id: 'gi-stool', label: '🧪 GI / Stool', dataKey: 'gi' },
        { id: 'cac-score', label: '❤️‍🩹 CAC Score', dataKey: 'cac' },
        { id: 'dna-methylation', label: '🧬 DNA Methylation', dataKey: 'dna-methylation' },
        { id: 'genetic-test', label: '🧬 Genetic Test', dataKey: 'genetics' },

        { section: '🏋️ BODY', collapsible: true },
        { id: 'vo2max', label: '🫁 VO2 Max', dataKey: 'vo2max' },
        { id: 'dexa', label: '🦴 DEXA Scan', dataKey: 'dexa' },
        { id: 'inbody', label: '🏋️ InBody Scan', dataKey: 'inbody' },

        { section: '🧴 CARE', collapsible: true },
        { id: 'skin', label: '🧴 Skin', always: true },
        { id: 'hair', label: '💇 Hair', always: true },
        { id: 'dental', label: '🦷 Dental', always: true },
        { id: 'eyes', label: '👁️ Eyes', always: true },

        { section: '💊 ACTIONS', collapsible: true },
        { id: 'my-stack', label: '💊 My Stack', always: true },
        { id: 'interventions', label: '🎯 Interventions', requireAny: ['blood', 'gut', 'dexa', 'vo2max', 'nad', 'gi', 'cac', 'dna-methylation', 'genetics', 'inbody'] },
        { id: 'protocols', label: '📝 Protocols', requireAny: ['blood', 'gut', 'dexa', 'vo2max', 'nad', 'gi', 'cac', 'dna-methylation', 'genetics', 'inbody'] },

        { section: '🔍 INSIGHTS', collapsible: true },
        { id: 'cross-test', label: '🔗 Cross-Test Insights', requireCount: 2 },
        { id: 'doctor-mode', label: '🩺 Doctor Mode', requireAny: ['blood', 'gut', 'dexa', 'vo2max', 'nad', 'gi', 'cac', 'dna-methylation', 'genetics', 'inbody', 'supplements'] },

        { section: '📖 REFERENCE', collapsible: true },
        { id: 'ref-bryan', label: '📖 Bryan Johnson Protocol', always: true },
        { id: 'ref-litman', label: '📖 Eric Litman Protocol', always: true },
    ],

    // Track which data types exist
    availableData: {},

    currentView: 'overview',
    collapsedSections: {},

    // === INIT ===
    async init() {
        await this.checkAvailableData();
        this.buildNav();
        this.bindEvents();

        const hash = window.location.hash.replace('#', '');
        if (hash && this.findNavItem(hash)) {
            this.loadView(hash);
        } else {
            this.loadView('overview');
        }
    },

    // === CHECK WHAT DATA EXISTS ===
    async checkAvailableData() {
        if (!this.API_BASE) return;

        const dataTypes = ['blood', 'gut', 'nad', 'gi', 'cac', 'dna-methylation', 'genetics', 'vo2max', 'dexa', 'inbody', 'supplements', 'tracking', 'protocols'];

        const checks = dataTypes.map(async (type) => {
            try {
                const res = await fetch(`${this.API_BASE}/${type}`, { method: 'HEAD' });
                if (res.ok) this.availableData[type] = true;
            } catch (e) {
                // Data doesn't exist yet
            }
        });

        await Promise.all(checks);
    },

    hasData(key) {
        return !!this.availableData[key];
    },

    getDataCount() {
        return Object.keys(this.availableData).length;
    },

    // === GATING LOGIC ===
    isItemEnabled(item) {
        if (item.always) return true;
        if (item.dataKey) return this.hasData(item.dataKey);
        if (item.requireAny) return item.requireAny.some(k => this.hasData(k));
        if (item.requireCount) return this.getDataCount() >= item.requireCount;
        return false;
    },

    isSectionVisible(item) {
        // Sections are always visible — greyUntil just greys them out
        return true;
    },

    isSectionGreyed(item) {
        if (!item.greyUntil) return false;
        return !this.hasData(item.greyUntil);
    },

    findNavItem(id) {
        return this.sidebar.find(item => item.id === id);
    },

    // === NAVIGATION ===
    buildNav() {
        const navEl = document.getElementById('navLinks');
        let html = '';
        let currentSection = null;
        let sectionHasParent = false;
        let sectionVisible = true;

        for (const item of this.sidebar) {
            // Section header
            if (item.section) {
                currentSection = item.section;
                sectionHasParent = !!item.parentKey;
                sectionVisible = this.isSectionVisible(item);

                if (!sectionVisible) continue;

                const collapsed = this.collapsedSections[currentSection] ? 'collapsed' : '';
                const greyed = this.isSectionGreyed(item) ? 'greyed' : '';
                // If greyed, force collapsed and not expandable
                const forceCollapse = greyed ? 'collapsed' : collapsed;
                html += `<li class="nav-section ${forceCollapse} ${greyed}" data-section="${currentSection}">
                    ${item.collapsible && !greyed ? '<span class="collapse-arrow">▾</span>' : ''}
                    ${currentSection}
                </li>`;
                continue;
            }

            // Skip items in hidden sections
            if (!sectionVisible) continue;

            const enabled = this.isItemEnabled(item);
            const collapsed = this.collapsedSections[currentSection] ? 'section-collapsed' : '';
            const active = item.id === this.currentView ? 'active' : '';
            const disabled = !enabled ? 'disabled' : '';

            html += `<li class="nav-item ${collapsed}" data-section="${currentSection}">
                <a href="#${item.id}" class="nav-link ${active} ${disabled}" data-view="${item.id}" ${!enabled ? 'tabindex="-1"' : ''}>
                    ${item.label}
                </a>
            </li>`;
        }

        navEl.innerHTML = html;
    },

    bindEvents() {
        const navEl = document.getElementById('navLinks');

        // Nav link clicks
        navEl.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link && !link.classList.contains('disabled')) {
                e.preventDefault();
                this.loadView(link.dataset.view);
                return;
            }

            // Section collapse toggle
            const section = e.target.closest('.nav-section');
            if (section) {
                const sectionName = section.dataset.section;
                this.collapsedSections[sectionName] = !this.collapsedSections[sectionName];
                this.buildNav();
            }
        });

        // Hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '');
            const item = this.findNavItem(hash);
            if (item && this.isItemEnabled(item) && hash !== this.currentView) {
                this.loadView(hash);
            }
        });
    },

    // === VIEW LOADING ===
    async loadView(viewName) {
        const item = this.findNavItem(viewName);
        if (!item) return;

        this.currentView = viewName;
        window.location.hash = viewName;

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.toggle('active', el.dataset.view === viewName);
        });

        const container = document.getElementById('view-container');

        // Try to load view HTML file
        try {
            const response = await fetch(`views/${viewName}.html`);
            if (!response.ok) throw new Error('View not found');
            const html = await response.text();
            container.innerHTML = html;

            // Execute <script> tags (innerHTML doesn't run them)
            const scripts = container.querySelectorAll('script');
            for (const oldScript of scripts) {
                const newScript = document.createElement('script');
                newScript.textContent = oldScript.textContent;
                oldScript.parentNode.replaceChild(newScript, oldScript);
            }

            // Call view init if it exists
            const initFn = `init_${viewName.replace(/-/g, '_')}`;
            if (window[initFn]) {
                await window[initFn]();
            }
        } catch (err) {
            // No view file yet — show appropriate empty state
            const enabled = this.isItemEnabled(item);
            if (!enabled) {
                container.innerHTML = `
                    <div class="empty-state">
                        <h3>${item.label}</h3>
                        <p>Add your data to unlock this section. Tell Claude what you have and it'll build this view for you.</p>
                    </div>`;
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <h3>${item.label}</h3>
                        <p>This view hasn't been built yet. Tell Claude to create it!</p>
                    </div>`;
            }
        }
    },

    // === API HELPERS ===
    async fetchData(endpoint) {
        if (!this.API_BASE) {
            console.warn('API_BASE not configured. Set it in app.js after VPS setup.');
            return null;
        }

        if (this.dataCache[endpoint]) return this.dataCache[endpoint];

        try {
            const res = await fetch(`${this.API_BASE}/${endpoint}`);
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const data = await res.json();
            this.dataCache[endpoint] = data;
            return data;
        } catch (err) {
            console.error(`Failed to fetch ${endpoint}:`, err);
            return null;
        }
    },

    // === UTILITY FUNCTIONS ===
    getStatus(value, range, optimal) {
        if (optimal && value >= optimal.low && value <= optimal.high) return 'optimal';
        if (value >= range.low && value <= range.high) return 'normal';
        const distance = value < range.low
            ? (range.low - value) / range.low
            : (value - range.high) / range.high;
        return distance > 0.2 ? 'danger' : 'warning';
    },

    formatValue(value) {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'number') {
            return value % 1 === 0 ? value.toString() : value.toFixed(1);
        }
        return value;
    },

    badge(status, text) {
        return `<span class="badge badge-${status}">${text || status}</span>`;
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
