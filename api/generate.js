export default async function handler(req, res) {
  // ───────────────────────────
  // CORS
  // ───────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ───────────────────────────
    // API KEY
    // ───────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'No API Key' });
    }

    // ───────────────────────────
    // BODY (Vercel-safe)
    // ───────────────────────────
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      prompt,
      temperature,
      top_p,
      responseSchema
    } = body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'No prompt' });
    }

    // ───────────────────────────
    // MODELO FIJO Y VÁLIDO
    // ───────────────────────────
    const model = 'gemini-2.0-flash';

    // ───────────────────────────
    // PAYLOAD
    // ───────────────────────────
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(typeof top_p === 'number' ? { topP: top_p } : {})
      }
    };

    // JSON MODE solo cuando se pide schema
    if (responseSchema) {
      payload.generationConfig.responseMimeType = 'application/json';
      payload.generationConfig.responseSchema = responseSchema;
    }

    // ───────────────────────────
    // LLAMADA A GEMINI
    // ───────────────────────────
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || response.statusText;
      throw new Error(`Google Error (${model}): ${msg}`);
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Respuesta vacía del modelo');
    }

    // ───────────────────────────
    // RESPUESTA
    // ───────────────────────────

    // Tutor IA → TEXTO
    if (!responseSchema) {
      return res.status(200).json({ ok: true, data: text });
    }

    // Problemas / guías → JSON
    const cleaned = String(text)
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    try {
      return res.status(200).json({
        ok: true,
        data: JSON.parse(cleaned)
      });
    } catch {
      return res.status(500).json({
        ok: false,
        error: 'Formato JSON inválido',
        raw: cleaned
      });
    }

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
