// api/generate.js — Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, responseSchema, model = 'gemini-2.5-flash-preview-05-20', temperature = 0.4 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: responseSchema ? 'application/json' : 'text/plain',
        ...(responseSchema ? { responseSchema } : {})
      }
    };

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(()=> '');
      return res.status(502).json({ error: 'Upstream error', detail: text.slice(0,800) });
    }

    const json = await upstream.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (responseSchema) {
      const cleaned = text.replace(/```json|```/g, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        return res.status(200).json({ ok: true, data: parsed });
      } catch {
        return res.status(200).json({ ok: false, error: 'Invalid JSON from model', raw: text });
      }
    }

    return res.status(200).json({ ok: true, data: text });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
