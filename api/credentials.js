export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Server not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to Vercel environment variables.' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
    };

    // Validate admin password against what's stored in Supabase
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

    // GET — return all credentials (grouped by service)
    if (req.method === 'GET') {
        const service = req.query.service;
        let url = `${SUPABASE_URL}/rest/v1/credentials?select=service_name,key_name,key_value&service_name=neq.system`;
        if (service) url += `&service_name=eq.${service}`;
        url += '&order=service_name,key_name';

        const response = await fetch(url, { headers: supaHeaders });
        if (!response.ok) {
            return res.status(500).json({ error: 'Failed to fetch credentials' });
        }
        const rows = await response.json();

        const grouped = {};
        for (const row of rows) {
            if (!grouped[row.service_name]) grouped[row.service_name] = {};
            grouped[row.service_name][row.key_name] = row.key_value;
        }
        return res.status(200).json(grouped);
    }

    // POST — save credentials
    if (req.method === 'POST') {
        const { credentials } = req.body || {};
        if (!credentials || !Array.isArray(credentials)) {
            return res.status(400).json({ error: 'Expected { credentials: [{ service_name, key_name, key_value }] }' });
        }

        const records = credentials
            .filter(c => c.service_name && c.key_name && c.key_value && c.service_name !== 'system')
            .map(c => ({
                service_name: c.service_name,
                key_name: c.key_name,
                key_value: c.key_value,
                updated_at: new Date().toISOString()
            }));

        if (records.length === 0) return res.status(400).json({ error: 'No valid credentials provided' });

        const response = await fetch(`${SUPABASE_URL}/rest/v1/credentials?on_conflict=service_name,key_name`, {
            method: 'POST',
            headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(records),
        });

        if (!response.ok) {
            const err = await response.text();
            return res.status(500).json({ error: 'Failed to save credentials', details: err });
        }

        const saved = await response.json();
        return res.status(200).json({ saved: saved.length, message: 'Saved successfully' });
    }

    // DELETE — remove a credential
    if (req.method === 'DELETE') {
        const { service_name, key_name } = req.body || {};
        if (!service_name || service_name === 'system') return res.status(400).json({ error: 'Invalid service' });

        let url = `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.${service_name}`;
        if (key_name) url += `&key_name=eq.${key_name}`;

        const response = await fetch(url, { method: 'DELETE', headers: supaHeaders });
        if (!response.ok) return res.status(500).json({ error: 'Failed to delete' });
        return res.status(200).json({ message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
