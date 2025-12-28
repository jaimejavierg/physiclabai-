// api/generate.mjs
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'No API Key' });

    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'No prompt' });

    // MODELO VIEJO Y SEGURO
    const model = 'gemini-pro';

    console.log("Intentando conectar con modelo CLÁSICO:", model);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
          // NOTA: Sin configuration, sin schemas, sin JSON mode.
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const msg = data.error?.message || response.statusText;
      // Si falla aquí, devolvemos el error exacto para verlo
      throw new Error(`Google Error (${model}): ${msg}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Respuesta vacía');

    // Limpieza manual del JSON (porque el modelo viejo no lo hace solo)
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ ok: true, data: parsed });
    } catch (e) {
      console.error("Fallo al parsear JSON:", cleaned);
      // Si falla el parseo, enviamos el texto crudo para que al menos no de error 500 ciego
      return res.status(500).json({ error: 'Formato inválido', raw: cleaned });
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
