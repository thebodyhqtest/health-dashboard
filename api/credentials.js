export default async function handler(req, res) {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Server not configured. Set ADMIN_PASSWORD, SUPABASE_URL, and SUPABASE_SERVICE_KEY in Vercel environment variables.' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const password = req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
    };

    if (req.method === 'GET') {
        const service = req.query.service;
        let url = `${SUPABASE_URL}/rest/v1/credentials?select=service_name,key_name,key_value`;
        if (service) url += `&service_name=eq.${service}`;
        url += '&order=service_name,key_name';

        const response = await fetch(url, { headers: supaHeaders });
        if (!response.ok) {
            const err = await response.text();
            return res.status(500).json({ error: 'Failed to fetch credentials', details: err });
        }
        const rows = await response.json();

        const grouped = {};
        for (const row of rows) {
            if (!grouped[row.service_name]) grouped[row.service_name] = {};
            grouped[row.service_name][row.key_name] = row.key_value;
        }
        return res.status(200).json(grouped);
    }

    if (req.method === 'POST') {
        const { credentials } = req.body;
        if (!credentials || !Array.isArray(credentials)) {
            return res.status(400).json({ error: 'Expected { credentials: [{ service_name, key_name, key_value }] }' });
        }

        const records = credentials
            .filter(c => c.service_name && c.key_name && c.key_value)
            .map(c => ({
                service_name: c.service_name,
                key_name: c.key_name,
                key_value: c.key_value,
                updated_at: new Date().toISOString()
            }));

        if (records.length === 0) {
            return res.status(400).json({ error: 'No valid credentials provided' });
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/credentials`, {
            method: 'POST',
            headers: {
                ...supaHeaders,
                'Prefer': 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(records),
        });

        if (!response.ok) {
            const err = await response.text();
            return res.status(500).json({ error: 'Failed to save credentials', details: err });
        }

        const saved = await response.json();
        return res.status(200).json({ saved: saved.length, message: 'Credentials saved successfully' });
    }

    if (req.method === 'DELETE') {
        const { service_name, key_name } = req.body || {};
        if (!service_name) return res.status(400).json({ error: 'service_name is required' });

        let url = `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.${service_name}`;
        if (key_name) url += `&key_name=eq.${key_name}`;

        const response = await fetch(url, { method: 'DELETE', headers: supaHeaders });
        if (!response.ok) {
            const err = await response.text();
            return res.status(500).json({ error: 'Failed to delete', details: err });
        }
        return res.status(200).json({ message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
