export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured.' });
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

    // Get Supabase access token from credentials
    const tokenCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.supabase&key_name=eq.access_token&select=key_value`,
        { headers: supaHeaders }
    );
    const tokenData = await tokenCheck.json();
    if (!Array.isArray(tokenData) || tokenData.length === 0) {
        return res.status(400).json({ error: 'Supabase access token not found. Add it in the admin page under Supabase → Access Token.' });
    }

    const accessToken = tokenData[0].key_value;
    const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

    const sql = `
        -- Biomarker tests (blood, gut, NAD, etc.)
        CREATE TABLE IF NOT EXISTS biomarker_tests (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            test_type text NOT NULL,
            test_date date NOT NULL,
            created_at timestamptz DEFAULT now()
        );

        -- Individual biomarker results linked to a test
        CREATE TABLE IF NOT EXISTS biomarker_results (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            test_id uuid REFERENCES biomarker_tests(id) ON DELETE CASCADE,
            marker_name text NOT NULL,
            value numeric,
            unit text,
            range_low numeric,
            range_high numeric,
            category text,
            created_at timestamptz DEFAULT now()
        );

        -- Daily log from Telegram messages
        CREATE TABLE IF NOT EXISTS daily_log (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            telegram_message_id bigint,
            telegram_chat_id bigint,
            raw_text text NOT NULL,
            processed boolean DEFAULT false,
            processed_at timestamptz,
            created_at timestamptz DEFAULT now()
        );

        -- Supplement stack
        CREATE TABLE IF NOT EXISTS supplements (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            name text NOT NULL,
            dosage text,
            frequency text,
            category text,
            notes text,
            active boolean DEFAULT true,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
    `;

    const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });

    if (!mgmtRes.ok) {
        const err = await mgmtRes.text();
        return res.status(500).json({ error: 'Failed to create tables', details: err });
    }

    // If Telegram bot token exists, set up the webhook
    const tgCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.telegram&key_name=eq.bot_token&select=key_value`,
        { headers: supaHeaders }
    );
    const tgData = await tgCheck.json();
    let telegramSetup = null;

    if (Array.isArray(tgData) && tgData.length > 0 && tgData[0].key_value) {
        const botToken = tgData[0].key_value;
        const { siteUrl } = req.body || {};
        if (!siteUrl) {
            telegramSetup = 'Skipped webhook — site URL not provided';
        } else {
        const webhookUrl = `${siteUrl}/api/telegram-webhook`;

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
        });
        const tgResult = await tgRes.json();
        telegramSetup = tgResult.ok ? 'Telegram webhook connected' : `Telegram webhook failed: ${tgResult.description}`;
        } // end else
    }

    return res.status(200).json({
        message: 'All tables created successfully',
        tables: ['biomarker_tests', 'biomarker_results', 'daily_log', 'supplements'],
        telegramSetup,
    });
}
