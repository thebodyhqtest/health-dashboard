export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Allow GET (Vercel cron) and POST (manual trigger)
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Not configured' });
    }

    const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
    };

    // Get Anthropic API key from credentials
    const keyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/credentials?service_name=eq.anthropic&key_name=eq.api_key&select=key_value`,
        { headers: supaHeaders }
    );
    const keyData = await keyRes.json();
    if (!Array.isArray(keyData) || keyData.length === 0) {
        return res.status(400).json({ error: 'Anthropic API key not found. Add it on the admin page.' });
    }
    const anthropicKey = keyData[0].key_value;

    // Fetch unprocessed daily_log entries
    const logsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/daily_log?processed=eq.false&order=created_at.asc&limit=50`,
        { headers: supaHeaders }
    );
    const logs = await logsRes.json();

    if (!Array.isArray(logs) || logs.length === 0) {
        return res.status(200).json({ message: 'No unprocessed logs', processed: 0 });
    }

    // Combine all unprocessed messages into one prompt
    const messages = logs.map(l => `[${l.created_at}] ${l.raw_text}`).join('\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: `You are a health data parser. Extract structured health data from these daily log messages.

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
- For biomarkers, include reference ranges ONLY if the user provided them.
- If range is not given, set range_low and range_high to null.
- test_type should be: blood, gut, nad, gi, cac, dna-methylation, genetics, vo2max, dexa, inbody
- Use the date from the message timestamp if no date is stated.
- For symptoms, extract any physical or mental health observations (e.g. "slept poorly", "headache", "high energy", "brain fog").
- Normalize symptom names to lowercase. Infer severity from context if described (e.g. "terrible headache" = severe), otherwise set to null.
- If a message has no health data, skip it.
- Return empty arrays if nothing to extract.

Messages:
${messages}`
            }],
        }),
    });

    if (!claudeRes.ok) {
        const err = await claudeRes.text();
        return res.status(500).json({ error: 'Claude API call failed', details: err });
    }

    const claudeData = await claudeRes.json();
    const responseText = claudeData.content?.[0]?.text || '';

    // Parse Claude's JSON response
    let parsed;
    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        return res.status(500).json({ error: 'Failed to parse Claude response', raw: responseText });
    }

    let insertedBiomarkers = 0;
    let insertedSupplements = 0;
    let insertedSymptoms = 0;

    // Insert biomarkers
    if (parsed.biomarkers && parsed.biomarkers.length > 0) {
        for (const test of parsed.biomarkers) {
            // Create the test entry
            const testRes = await fetch(`${SUPABASE_URL}/rest/v1/biomarker_tests`, {
                method: 'POST',
                headers: { ...supaHeaders, 'Prefer': 'return=representation' },
                body: JSON.stringify({
                    test_type: test.test_type,
                    test_date: test.test_date,
                }),
            });

            if (!testRes.ok) continue;
            const [testRow] = await testRes.json();

            // Insert each marker
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

                const resultRes = await fetch(`${SUPABASE_URL}/rest/v1/biomarker_results`, {
                    method: 'POST',
                    headers: supaHeaders,
                    body: JSON.stringify(results),
                });
                if (resultRes.ok) insertedBiomarkers += results.length;
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

        const suppRes = await fetch(`${SUPABASE_URL}/rest/v1/supplements`, {
            method: 'POST',
            headers: supaHeaders,
            body: JSON.stringify(supps),
        });
        if (suppRes.ok) insertedSupplements += supps.length;
    }

    // Insert symptoms
    if (parsed.symptoms && parsed.symptoms.length > 0) {
        const symptoms = parsed.symptoms.map(s => ({
            symptom: s.symptom,
            severity: s.severity || null,
            notes: s.notes || null,
        }));

        const symRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_symptoms`, {
            method: 'POST',
            headers: supaHeaders,
            body: JSON.stringify(symptoms),
        });
        if (symRes.ok) insertedSymptoms += symptoms.length;
    }

    // Mark logs as processed
    const logIds = logs.map(l => l.id);
    for (const id of logIds) {
        await fetch(`${SUPABASE_URL}/rest/v1/daily_log?id=eq.${id}`, {
            method: 'PATCH',
            headers: supaHeaders,
            body: JSON.stringify({ processed: true, processed_at: new Date().toISOString() }),
        });
    }

    return res.status(200).json({
        message: 'Logs processed',
        processed: logs.length,
        insertedBiomarkers,
        insertedSupplements,
        insertedSymptoms,
    });
}
