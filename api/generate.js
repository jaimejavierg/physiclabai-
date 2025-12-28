export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 1️⃣ Verificar API KEY
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'No API Key' });
    }

    // 2️⃣ Leer body (Vercel a veces lo manda como string)
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      prompt,
      model,
      temperature,
      top_p,
      responseSchema
    } = body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'No prompt' });
    }

    // 3️⃣ MODELO CORRECTO (NO gemini-pro)
    const chosenModel = model || 'gemini-2.0-flash';

    // 4️⃣ Payload base
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

    // 5️⃣ Si el frontend pide JSON (problemas / guías)
    if (responseSchema) {
      payload.generationConfig.responseMimeType = 'application/json';
      payload.generationConfig.responseSchema = responseSchema;
    }

    // 6️⃣ Llamada a Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || response.statusText;
      throw new Error(`Google Error (${chosenModel}): ${msg}`);
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Respuesta vacía del modelo');
    }

    // 7️⃣ Si NO hay schema → texto plano (Tutor IA)
    if (!responseSchema) {
      return res.status(200).json({ ok: true, data: text });
    }

    // 8️⃣ Si hay schema → intentamos parsear JSON
    const cleaned = String(text)
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ ok: true, data: parsed });
    } catch (e) {
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
