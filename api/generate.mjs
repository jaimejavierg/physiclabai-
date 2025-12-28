// api/generate.js — Versión 3.0 (Retry Agresivo)
export default async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server Error: Missing GEMINI_API_KEY' });
    }

    const { prompt, responseSchema, temperature = 0.3 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Modelos a probar
    const candidates = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    
    // --- FUNCIÓN HELPER PARA LLAMAR A GOOGLE ---
    const callGoogle = async (model, useSchema) => {
      const config = {
        temperature,
        responseMimeType: 'application/json',
      };
      
      // Solo añadimos el esquema si useSchema es true Y existe un esquema
      if (useSchema && responseSchema) {
        config.responseSchema = responseSchema;
      }

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: config
          }) 
        }
      );

      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || r.statusText);
      return data;
    };

    // --- BUCLE DE INTENTOS ---
    let lastError = null;

    for (const model of candidates) {
      try {
        console.log(`Intentando ${model} con esquema...`);
        const jsonResponse = await callGoogle(model, true); // Intento 1: Estricto
        
        const text = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return res.status(200).json({ ok: true, data: JSON.parse(text), model });

      } catch (e) {
        console.warn(`Fallo estricto ${model}: ${e.message}`);
        
        // --- CAMBIO CLAVE AQUÍ ---
        // Ahora reintentamos SIEMPRE, sin importar qué error sea.
        try {
          console.log(`Activando PLAN B (sin esquema) para ${model}...`);
          const looseResponse = await callGoogle(model, false); // Intento 2: Flexible (Sin Schema)
          
          let text = looseResponse.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
             // Limpiamos el texto por si trae ```json ... ```
             text = text.replace(/```json/g, '').replace(/```/g, '').trim();
             return res.status(200).json({ ok: true, data: JSON.parse(text), model, method: 'fallback' });
          }
        } catch (e2) {
          console.warn(`Fallo Plan B ${model}: ${e2.message}`);
          lastError = e2.message;
        }
      }
    }

    // Si todo falla
    return res.status(500).json({ error: 'Fallaron todos los intentos', detail: lastError });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
