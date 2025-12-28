// api/generate.mjs - Versión 4.0 (Always Retry)
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Error: Falta GEMINI_API_KEY en Vercel' });
    }

    const { prompt, responseSchema, temperature = 0.3 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

    // Usamos el 1.5 Flash primero porque es el más estable ahora mismo
    const model = 'gemini-1.5-flash';

    // Función auxiliar para conectar con Google
    const callGemini = async (useSchema) => {
      const config = { 
        temperature, 
        responseMimeType: 'application/json' 
      };
      
      // Solo enviamos esquema si lo pedimos explícitamente
      if (useSchema && responseSchema) {
        config.responseSchema = responseSchema;
      }

      const response = await fetch(
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || response.statusText);
      }
      return data;
    };

    try {
      // INTENTO 1: Modo Perfecto (Con Esquema)
      console.log('Intento 1: Con Esquema...');
      const result = await callGemini(true);
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return res.status(200).json({ ok: true, data: JSON.parse(text) });

    } catch (error1) {
      console.warn('Falló Intento 1:', error1.message);

      // INTENTO 2: Modo Todoterreno (Sin Esquema - Fallback)
      // No preguntamos el error. Si falló el 1, ejecutamos el 2.
      try {
        console.log('Intento 2: Sin Esquema (Fallback)...');
        const result = await callGemini(false);
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Limpieza de emergencia por si la IA devuelve Markdown
        if (text) {
          text = text.replace(/```json/g, '').replace(/```/g, '').trim();
          return res.status(200).json({ ok: true, data: JSON.parse(text) });
        }
      } catch (error2) {
        // Si fallan los dos, nos rendimos y mostramos el error real
        console.error('Falló Intento 2:', error2.message);
        return res.status(500).json({ 
          error: 'No se pudo generar el contenido.', 
          details: `Intento 1: ${error1.message} | Intento 2: ${error2.message}` 
        });
      }
    }

  } catch (e) {
    return res.status(500).json({ error: 'Error crítico del servidor', details: e.message });
  }
}
