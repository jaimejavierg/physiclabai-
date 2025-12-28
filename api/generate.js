// api/generate.js
export default async function handler(req, res) {
  // 1. Configuración de CORS (Para que el navegador no bloquee la petición)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Responder a peticiones "pre-flight" de navegadores
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Solo aceptamos POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 2. Verificamos que la llave esté en Vercel
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server Error: Missing GEMINI_API_KEY environment variable.' });
    }

    const body = req.body || {};
    const { prompt, responseSchema, temperature = 0.3 } = body;

    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Modelos a probar (si el 2.0 falla, intentará con el 1.5)
    const candidates = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    
    let lastError = null;

    // --- FUNCIÓN PARA LLAMAR A GOOGLE ---
    const callGoogle = async (model, useSchema) => {
      // Si useSchema es true, enviamos el esquema estricto. Si es false, solo pedimos JSON.
      const generationConfig = {
        temperature,
        responseMimeType: 'application/json'
      };

      if (useSchema && responseSchema) {
        generationConfig.responseSchema = responseSchema;
      }

      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      };

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
        }
      );

      const data = await r.json();
      
      if (!r.ok) {
        throw new Error(data.error?.message || r.statusText);
      }
      
      return data;
    };

    // --- BUCLE DE INTENTOS INTELIGENTE ---
    for (const model of candidates) {
      try {
        console.log(`Intentando con modelo: ${model} (Modo Estricto)...`);
        
        // INTENTO 1: Con Schema estricto (lo ideal)
        const jsonResponse = await callGoogle(model, true);
        
        const text = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text); 
          return res.status(200).json({ ok: true, data: parsed, model });
        }

      } catch (e) {
        console.warn(`Falló modo estricto en ${model}: ${e.message}`);
        
        // INTENTO 2: Si falló por culpa del Schema ("Invalid Argument"), probamos SIN schema
        // Esto soluciona tu error de "enum" y validaciones
        if (e.message.includes('INVALID_ARGUMENT') || e.message.includes('Json') || e.message.includes('400')) {
           try {
             console.log(`Reintentando ${model} en Modo Flexible (sin schema)...`);
             
             // Llamada sin pasarle el esquema, solo el prompt
             const looseResponse = await callGoogle(model, false); 
             
             const text = looseResponse.candidates?.[0]?.content?.parts?.[0]?.text;
             if (text) {
               // Limpieza manual del JSON (quita ```json y ``` que a veces pone la IA)
               const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
               const parsed = JSON.parse(cleaned);
               return res.status(200).json({ ok: true, data: parsed, model, method: 'fallback' });
             }
           } catch (looseErr) {
             console.warn(`Falló modo flexible en ${model}: ${looseErr.message}`);
             lastError = looseErr.message;
           }
        } else {
          lastError = e.message;
        }
      }
    }

    // Si llegamos aquí, fallaron todos los intentos
    return res.status(500).json({ 
      error: 'No se pudo generar el contenido tras varios intentos.', 
      detail: lastError 
    });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error desconocido en el servidor' });
  }
}
