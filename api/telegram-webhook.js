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
        if (!text) return res.status(200).end();

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
            return res.status(200).end();
        }

        const [savedLog] = await saveRes.json();

        // Fetch bot token and Anthropic key in parallel
        const [tokenRes, keyRes] = await Promise.all([
            fetch(
                `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.telegram&key_name=eq.bot_token&select=key_value`,
                { headers: supaHeaders }
            ),
            fetch(
                `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.anthropic&key_name=eq.api_key&select=key_value`,
                { headers: supaHeaders }
            ),
        ]);

        const tokenData = await tokenRes.json();
        const keyData = await keyRes.json();

        const botToken = Array.isArray(tokenData) && tokenData.length > 0 ? tokenData[0].key_value : null;
        const anthropicKey = Array.isArray(keyData) && keyData.length > 0 ? keyData[0].key_value : null;

        // If no Anthropic key, fall back to simple acknowledgment
        if (!anthropicKey) {
            if (botToken) {
                await sendTelegram(botToken, chatId, '✓ Logged. (Processing unavailable — add Anthropic API key in admin.)');
            }
            return res.status(200).end();
        }

        // Parse the message with Claude
        const parseResult = await parseHealthLog(text, savedLog, anthropicKey, SUPABASE_URL, supaHeaders);

        // Send rich reply
        if (botToken) {
            const reply = buildReplyMessage(parseResult);
            await sendTelegram(botToken, chatId, reply);
        }

        // Mark as processed
        await fetch(`${SUPABASE_URL}/rest/v1/daily_log?id=eq.${savedLog.id}`, {
            method: 'PATCH',
            headers: supaHeaders,
            body: JSON.stringify({ processed: true, processed_at: new Date().toISOString() }),
        });

        return res.status(200).end();
    } catch (e) {
        console.error('Telegram webhook error:', e);
        return res.status(200).end();
    }
}

async function parseHealthLog(text, logEntry, anthropicKey, supabaseUrl, supaHeaders) {
    const timestamp = logEntry.created_at;
    const result = { biomarkers: 0, supplements: 0, symptoms: 0, error: null };

    try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: `You are a health data parser. Extract structured health data from this daily log message.

Return ONLY valid JSON with this structure:
{
  "biomarkers": [
    { "test_type": "blood", "test_date": "YYYY-MM-DD", "markers": [
      { "marker_name": "Vitamin D", "value": 45, "unit": "ng/mL", "range_low": 30, "range_high": 100, "category": "Vitamins" }
    ]}
  ],
  "supplements": [
    { "name": "Vitamin D3", "dosage": "5000 IU", "frequency": "daily", "category": "Vitamins" }
  ],
  "symptoms": [
    { "symptom": "headache", "severity": "mild|moderate|severe", "notes": "optional context" }
  ]
}

Rules:
- Only extract data that is explicitly stated. Never invent values.
- For biomarkers, include reference ranges ONLY if the user provided them. Otherwise set range_low and range_high to null.
- test_type should be: blood, gut, nad, gi, cac, dna-methylation, genetics, vo2max, dexa, inbody
- Use ${timestamp} as the date if no date is explicitly stated.
- For symptoms, extract any physical or mental health observations (e.g. "slept poorly", "headache", "high energy", "brain fog").
- Normalize symptom names to lowercase. Infer severity from context if described (e.g. "terrible headache" = severe), otherwise set severity to null.
- If the message has no health data, return empty arrays.

Message:
${text}`
                }],
            }),
        });

        if (!claudeRes.ok) {
            result.error = 'Claude API call failed';
            return result;
        }

        const claudeData = await claudeRes.json();
        const responseText = claudeData.content?.[0]?.text || '';

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            result.error = 'No JSON in Claude response';
            return result;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Insert biomarkers
        if (parsed.biomarkers && parsed.biomarkers.length > 0) {
            for (const test of parsed.biomarkers) {
                const testRes = await fetch(`${supabaseUrl}/rest/v1/biomarker_tests`, {
                    method: 'POST',
                    headers: { ...supaHeaders, 'Prefer': 'return=representation' },
                    body: JSON.stringify({
                        test_type: test.test_type,
                        test_date: test.test_date,
                    }),
                });

                if (!testRes.ok) continue;
                const [testRow] = await testRes.json();

                if (test.markers && test.markers.length > 0) {
                    const results = test.markers.map(m => ({
                        test_id: testRow.id,
                        marker_name: m.marker_name,
                        value: m.value,
                        unit: m.unit,
                        range_low: m.range_low,
                        range_high: m.range_high,
                        category: m.category,
                    }));

                    const resultRes = await fetch(`${supabaseUrl}/rest/v1/biomarker_results`, {
                        method: 'POST',
                        headers: supaHeaders,
                        body: JSON.stringify(results),
                    });
                    if (resultRes.ok) result.biomarkers += results.length;
                }
            }
        }

        // Insert supplements
        if (parsed.supplements && parsed.supplements.length > 0) {
            const supps = parsed.supplements.map(s => ({
                name: s.name,
                dosage: s.dosage,
                frequency: s.frequency,
                category: s.category,
            }));

            const suppRes = await fetch(`${supabaseUrl}/rest/v1/supplements`, {
                method: 'POST',
                headers: supaHeaders,
                body: JSON.stringify(supps),
            });
            if (suppRes.ok) result.supplements += supps.length;
        }

        // Insert symptoms
        if (parsed.symptoms && parsed.symptoms.length > 0) {
            const symptoms = parsed.symptoms.map(s => ({
                log_id: logEntry.id,
                symptom: s.symptom,
                severity: s.severity || null,
                notes: s.notes || null,
            }));

            const symRes = await fetch(`${supabaseUrl}/rest/v1/daily_symptoms`, {
                method: 'POST',
                headers: supaHeaders,
                body: JSON.stringify(symptoms),
            });
            if (symRes.ok) result.symptoms += symptoms.length;
        }

        return result;
    } catch (e) {
        console.error('parseHealthLog error:', e);
        result.error = e.message;
        return result;
    }
}

function buildReplyMessage(result) {
    if (result.error) {
        return `✓ Logged. ⚠️ Processing failed: ${result.error}`;
    }

    const parts = [];
    if (result.biomarkers > 0) parts.push(`${result.biomarkers} biomarker${result.biomarkers > 1 ? 's' : ''}`);
    if (result.supplements > 0) parts.push(`${result.supplements} supplement${result.supplements > 1 ? 's' : ''}`);
    if (result.symptoms > 0) parts.push(`${result.symptoms} symptom${result.symptoms > 1 ? 's' : ''}`);

    if (parts.length === 0) {
        return '✓ Logged. No structured health data detected.';
    }

    return `✓ Parsed: ${parts.join(', ')}. Dashboard updated.`;
}

async function sendTelegram(botToken, chatId, text) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}
