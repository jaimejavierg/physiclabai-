// api/generate.js — Versión 7.0 (Stable v1)
export default async function handler(req, res) {
  // Configuración CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Falta la API Key en Vercel' });
    }

    const { prompt, temperature = 0.3 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

    // CAMBIO 1: Usamos la API estable "v1" (no beta)
    const apiVersion = 'v1'; 
    // CAMBIO 2: Usamos el modelo clásico que existe en todas las cuentas
    const model = 'gemini-pro';

    console.log(`Versión 7.0 conectando a ${apiVersion}/${model}...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            // CAMBIO 3: Quitamos "responseMimeType" porque la v1 no lo soporta.
            // Limpiaremos el JSON manualmente abajo.
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Si falla, devolvemos el error exacto de Google
      throw new Error(data.error?.message || response.statusText);
    }

    // Procesar respuesta
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      // Limpieza manual agresiva para extraer el JSON
      // A veces la IA devuelve: ```json { ... } ```
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Intentamos parsear. Si falla, es porque la IA no devolvió JSON puro.
      try {
        const parsed = JSON.parse(text);
        return res.status(200).json({ ok: true, data: parsed, modelUsed: `${apiVersion}/${model}` });
      } catch (jsonError) {
        console.error("Error parseando JSON:", text);
        return res.status(500).json({ error: 'La IA respondió texto, no JSON', rawText: text });
      }
    } else {
      throw new Error('La IA respondió vacío.');
    }

  } catch (e) {
    return res.status(500).json({ 
      error: 'Error al conectar con Google', 
      detail: e.message 
    });
  }
}
