// api/generate.js — Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    // Prioridad: modelo del cliente -> env var -> default 2.0
    const requestedModel = body.model;
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const candidates = [
      requestedModel || defaultModel,
      'gemini-2.0-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];

    const { prompt, responseSchema, temperature = 0.4 } = body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: responseSchema ? 'application/json' : 'text/plain',
        ...(responseSchema ? { responseSchema } : {})
      }
    };

    let lastErrTxt = '';
    for (const model of candidates) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (r.ok) {
        const json = await r.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (responseSchema) {
          const cleaned = text.replace(/```json|```/g, '').trim();
          try { return res.status(200).json({ ok: true, data: JSON.parse(cleaned) }); }
          catch { return res.status(200).json({ ok: false, error: 'Invalid JSON from model', raw: text }); }
        }
        return res.status(200).json({ ok: true, data: text });
      }
      lastErrTxt = await r.text().catch(()=> '');
      // prueba el siguiente modelo
    }

    return res.status(502).json({
      error: 'Upstream error',
      detail: lastErrTxt.slice(0, 800),
      tried: candidates
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
