// api/generate.js
// Asegúrate de que este sea el ÚNICO archivo en la carpeta api/

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 2. Validación de Llave
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server Error: Falta GEMINI_API_KEY' });
    }

    const { prompt, temperature = 0.3 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

    // 3. CAMBIO CRÍTICO: Usamos 'gemini-pro' que NUNCA falla.
    // Olvida el flash por un momento, queremos que funcione.
    const model = 'gemini-pro';

    console.log(`Intentando conectar con modelo: ${model}...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            // Importante: NO enviamos esquema estricto para evitar errores de validación
            responseMimeType: 'application/json' 
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || response.statusText);
    }

    // 4. Limpieza y Respuesta
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return res.status(200).json({ ok: true, data: JSON.parse(text) });
    } else {
      throw new Error('La IA respondió pero no generó texto.');
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({ 
      error: 'Error al generar contenido', 
      detail: e.message 
    });
  }
}
