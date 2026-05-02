export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (req.method !== 'POST') return res.status(200).end();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Not configured' });
    }

    const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    };

    try {
        const update = req.body;
        if (!update || !update.message) return res.status(200).end();

        const msg = update.message;
        const text = msg.text;
        if (!text) return res.status(200).end(); // Ignore non-text messages

        const chatId = msg.chat.id;
        const messageId = msg.message_id;

        // Save to daily_log
        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_log`, {
            method: 'POST',
            headers: supaHeaders,
            body: JSON.stringify({
                telegram_message_id: messageId,
                telegram_chat_id: chatId,
                raw_text: text,
                processed: false,
            }),
        });

        if (!saveRes.ok) {
            console.error('Failed to save to daily_log:', await saveRes.text());
            return res.status(200).end(); // Always return 200 to Telegram
        }

        // Get bot token to send reply
        const tokenRes = await fetch(
            `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.telegram&key_name=eq.bot_token&select=key_value`,
            { headers: supaHeaders }
        );
        const tokenData = await tokenRes.json();

        if (Array.isArray(tokenData) && tokenData.length > 0) {
            const botToken = tokenData[0].key_value;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: '✓ Logged. Your dashboard will update shortly.',
                }),
            });
        }

        return res.status(200).end();
    } catch (e) {
        console.error('Telegram webhook error:', e);
        return res.status(200).end(); // Always 200 so Telegram doesn't retry
    }
}
