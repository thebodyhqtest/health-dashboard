export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured in Vercel.' });
    }

    const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
    };

    // Validate admin password
    const password = req.headers['x-admin-password'];
    if (!password) return res.status(401).json({ error: 'Password required' });

    const pwCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.system&key_name=eq.admin_password&select=key_value`,
        { headers: supaHeaders }
    );
    const pwData = await pwCheck.json();
    if (!Array.isArray(pwData) || pwData.length === 0 || pwData[0].key_value !== password) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const checks = {};

    // 1. Supabase connection
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/credentials?limit=1`, { headers: supaHeaders });
        checks.supabase = { ok: r.ok, message: r.ok ? 'Connected' : 'Connection failed' };
    } catch (e) {
        checks.supabase = { ok: false, message: 'Cannot reach Supabase. Check SUPABASE_URL in Vercel settings.' };
    }

    // 2. Tables
    const tables = ['credentials', 'biomarker_tests', 'biomarker_results', 'daily_log', 'supplements'];
    checks.tables = { ok: true, message: '', details: {} };
    for (const table of tables) {
        try {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, { headers: supaHeaders });
            const ok = r.ok;
            checks.tables.details[table] = ok;
            if (!ok) {
                checks.tables.ok = false;
            }
        } catch (e) {
            checks.tables.details[table] = false;
            checks.tables.ok = false;
        }
    }
    const missing = Object.entries(checks.tables.details).filter(([_, ok]) => !ok).map(([name]) => name);
    checks.tables.message = checks.tables.ok
        ? `All ${tables.length} tables exist`
        : `Missing: ${missing.join(', ')}`;

    // 3. Telegram bot
    try {
        const tgRes = await fetch(
            `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.telegram&key_name=eq.bot_token&select=key_value`,
            { headers: supaHeaders }
        );
        const tgData = await tgRes.json();
        if (!Array.isArray(tgData) || tgData.length === 0 || !tgData[0].key_value) {
            checks.telegram = { ok: false, message: 'No bot token saved. Add it on the admin page.' };
        } else {
            const botToken = tgData[0].key_value;
            const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const meData = await meRes.json();
            if (meData.ok) {
                // Also check webhook
                const whRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
                const whData = await whRes.json();
                const webhookUrl = whData.result?.url || '';
                const hasWebhook = webhookUrl.length > 0;
                checks.telegram = {
                    ok: true,
                    message: `@${meData.result.username} is alive`,
                    webhook: hasWebhook ? webhookUrl : 'Not set — hit Save All on admin page to register it',
                    pendingUpdates: whData.result?.pending_update_count || 0,
                    lastError: whData.result?.last_error_message || null,
                };
            } else {
                checks.telegram = { ok: false, message: 'Bot token invalid. Check it on the admin page.' };
            }
        }
    } catch (e) {
        checks.telegram = { ok: false, message: 'Failed to check Telegram: ' + e.message };
    }

    // 4. GitHub
    try {
        const ghRes = await fetch(
            `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.github&select=key_name,key_value`,
            { headers: supaHeaders }
        );
        const ghData = await ghRes.json();
        const ghCreds = {};
        if (Array.isArray(ghData)) {
            for (const row of ghData) ghCreds[row.key_name] = row.key_value;
        }

        if (!ghCreds.token) {
            checks.github = { ok: false, message: 'No GitHub token saved. Add it on the admin page.' };
        } else if (!ghCreds.repo_url) {
            checks.github = { ok: false, message: 'No repo URL saved. Add it on the admin page.' };
        } else {
            // Parse owner/repo from URL
            const match = ghCreds.repo_url.match(/github\.com\/([^/]+\/[^/]+)/);
            if (!match) {
                checks.github = { ok: false, message: 'Repo URL format invalid. Should be https://github.com/owner/repo' };
            } else {
                const repoPath = match[1].replace(/\.git$/, '');
                const apiRes = await fetch(`https://api.github.com/repos/${repoPath}`, {
                    headers: {
                        'Authorization': `token ${ghCreds.token}`,
                        'User-Agent': 'health-dashboard',
                    },
                });
                const apiData = await apiRes.json();
                if (apiRes.ok) {
                    checks.github = {
                        ok: true,
                        message: `${repoPath} — ${apiData.private ? 'private' : 'public'}`,
                        permissions: apiData.permissions?.push ? 'Can push' : 'Read-only — token needs repo scope',
                    };
                } else {
                    checks.github = { ok: false, message: apiData.message || 'Token invalid or repo not found.' };
                }
            }
        }
    } catch (e) {
        checks.github = { ok: false, message: 'Failed to check GitHub: ' + e.message };
    }

    // 5. Anthropic API key
    try {
        const anRes = await fetch(
            `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.anthropic&key_name=eq.api_key&select=key_value`,
            { headers: supaHeaders }
        );
        const anData = await anRes.json();
        if (!Array.isArray(anData) || anData.length === 0 || !anData[0].key_value) {
            checks.anthropic = { ok: false, message: 'No API key saved. Nightly parser won\'t run without it.' };
        } else {
            checks.anthropic = { ok: true, message: 'API key saved' };
        }
    } catch (e) {
        checks.anthropic = { ok: false, message: 'Failed to check: ' + e.message };
    }

    // 6. Nightly parser — check last processed log
    try {
        const logRes = await fetch(
            `${SUPABASE_URL}/rest/v1/daily_log?processed=eq.true&order=processed_at.desc&limit=1&select=processed_at`,
            { headers: supaHeaders }
        );
        const logData = await logRes.json();

        const pendingRes = await fetch(
            `${SUPABASE_URL}/rest/v1/daily_log?processed=eq.false&select=id`,
            { headers: { ...supaHeaders, 'Prefer': 'count=exact' } }
        );
        const pendingCount = parseInt(pendingRes.headers.get('content-range')?.split('/')[1] || '0');

        if (Array.isArray(logData) && logData.length > 0) {
            const lastRun = new Date(logData[0].processed_at);
            const ago = Math.round((Date.now() - lastRun) / 3600000);
            checks.parser = {
                ok: true,
                message: `Last processed ${ago}h ago`,
                lastRun: logData[0].processed_at,
                pending: pendingCount,
            };
        } else {
            checks.parser = {
                ok: pendingCount === 0,
                message: pendingCount > 0
                    ? `Never run. ${pendingCount} message(s) waiting to be processed.`
                    : 'No logs yet. Send a message to your Telegram bot.',
                pending: pendingCount,
            };
        }
    } catch (e) {
        checks.parser = { ok: false, message: 'Failed to check: ' + e.message };
    }

    return res.status(200).json(checks);
}
