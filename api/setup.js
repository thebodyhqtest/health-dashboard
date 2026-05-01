export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({
            error: 'Supabase not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your Vercel environment variables.'
        });
    }

    const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
    };

    const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

    // GET — check setup status
    if (req.method === 'GET') {
        // Check if credentials table exists
        const tableCheck = await fetch(`${SUPABASE_URL}/rest/v1/credentials?limit=1`, {
            headers: supaHeaders
        });
        const tablesExist = tableCheck.ok;

        let adminPasswordSet = false;
        if (tablesExist) {
            const pwCheck = await fetch(
                `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.system&key_name=eq.admin_password&select=key_value`,
                { headers: supaHeaders }
            );
            const pwData = await pwCheck.json();
            adminPasswordSet = Array.isArray(pwData) && pwData.length > 0;
        }

        return res.status(200).json({
            tablesExist,
            adminPasswordSet,
            sqlEditorUrl: `https://supabase.com/dashboard/project/${projectRef}/sql/new`,
            setupSql: `CREATE TABLE IF NOT EXISTS credentials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    service_name text NOT NULL,
    key_name text NOT NULL,
    key_value text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(service_name, key_name)
);
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;`
        });
    }

    // POST — set admin password (first-time setup only)
    if (req.method === 'POST') {
        const { adminPassword } = req.body || {};

        if (!adminPassword || adminPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Make sure password isn't already set
        const existing = await fetch(
            `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.system&key_name=eq.admin_password`,
            { headers: supaHeaders }
        );
        const existingData = await existing.json();
        if (Array.isArray(existingData) && existingData.length > 0) {
            return res.status(400).json({ error: 'Admin password already set. Use the credentials page to update it.' });
        }

        const save = await fetch(`${SUPABASE_URL}/rest/v1/credentials`, {
            method: 'POST',
            headers: { ...supaHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({
                service_name: 'system',
                key_name: 'admin_password',
                key_value: adminPassword,
                updated_at: new Date().toISOString()
            })
        });

        if (!save.ok) {
            const err = await save.text();
            return res.status(500).json({ error: 'Failed to save password.', details: err });
        }

        return res.status(200).json({ message: 'Admin password set.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
