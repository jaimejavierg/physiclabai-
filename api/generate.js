// api/generate.js — Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    const body = req.body || {};
    const { prompt, responseSchema, temperature = 0.3, model: requestedModel } = body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const wantsJSON = Boolean(responseSchema);

    // Modelo por defecto
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    // Si queremos JSON con schema, NO caer a "pro".
    // Si no queremos schema, sí podemos incluir "pro".
    const candidates = [
      requestedModel || defaultModel,
      ...(wantsJSON
        ? ['gemini-2.0-flash', 'gemini-1.5-flash']
        : ['gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'])
    ].filter(Boolean);

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        ...(wantsJSON ? { responseMimeType: 'application/json', responseSchema } : {})
      }
    };

    let lastErrTxt = '';
    for (const model of [...new Set(candidates)]) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );

      if (!r.ok) {
        lastErrTxt = await r.text().catch(() => '');
        continue; // prueba el siguiente modelo
      }

      const json = await r.json().catch(() => null);
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map(p => p?.text ?? '').join('').trim();

      if (wantsJSON) {
        // Limpia posibles fences y basura antes/después del JSON
        const cleaned = text
          .replace(/```json|```/g, '')
          .replace(/^[^{\[]*/, '')      // recorta lo que haya antes de { o [
          .replace(/[^}\]]*$/, '')      // recorta lo que haya después de } o ]
          .trim();

        try {
          const parsed = JSON.parse(cleaned);
          return res.status(200).json({ ok: true, data: parsed, model });
        } catch (e) {
          // NO devolver error aún: probamos el siguiente modelo
          lastErrTxt = `Parse error with ${model}: ${e.message}. Raw: ${text.slice(0, 300)}`;
          continue;
        }
      } else {
        return res.status(200).json({ ok: true, data: text, model });
      }
    }

    // Si llegamos aquí, ningún modelo devolvió JSON parseable o hubo fallo arriba
    return res.status(502).json({
      error: 'Upstream error / invalid JSON',
      detail: lastErrTxt.slice(0, 800),
      tried: [...new Set(candidates)]
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
