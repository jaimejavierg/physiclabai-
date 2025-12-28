// api/generate.mjs — Versión: CLÁSICA (Solo Gemini Pro)
export default async function handler(req, res) {
  // 1. CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta la API Key en Vercel' });
    }

    const { prompt, temperature = 0.3 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

    // --- FORZAMOS EL MODELO CLÁSICO ---
    // Este modelo es más antiguo pero muy estable.
    const model = 'gemini-pro'; 
    const apiVersion = 'v1beta';

    console.log(`Usando modelo clásico: ${model}...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: temperature
            // NOTA: Quitamos responseMimeType y responseSchema porque gemini-pro NO los soporta
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Error Google:", data);
      throw new Error(data.error?.message || response.statusText);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      // Limpieza manual agresiva porque gemini-pro suele devolver Markdown
      const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const parsed = JSON.parse(cleanedText);
        return res.status(200).json({ ok: true, data: parsed, modelUsed: model });
      } catch (e) {
        console.error("Error parseando JSON del modelo clásico:", cleanedText);
        // Si falla el parseo, devolvemos error 500 pero mostramos el texto para debug
        return res.status(500).json({ 
            error: 'La IA respondió pero el formato no es válido.', 
            rawText: cleanedText 
        });
      }
    } else {
      throw new Error('Respuesta vacía de la IA.');
    }

  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ 
      error: 'Error interno del servidor', 
      detail: e.message 
    });
  }
}
