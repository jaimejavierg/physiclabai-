// api/generate.mjs - Versión 5.0 (Multi-Modelo)
export default async function handler(req, res) {
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

    const { prompt, responseSchema, temperature = 0.3 } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

    // LISTA DE MODELOS A PROBAR (En orden de preferencia)
    // Usamos las versiones "-001" que son las estables y seguras.
    const models = [
      'gemini-1.5-flash-001',  // El más rápido y estable hoy
      'gemini-1.5-flash',      // El alias corto (por si acaso)
      'gemini-1.5-pro-001',    // Más potente
      'gemini-pro'             // El clásico (versión 1.0) de respaldo
    ];

    let lastError = null;

    // Función que intenta conectar con un modelo específico
    const tryModel = async (modelName) => {
      console.log(`Probando modelo: ${modelName}...`);
      
      // Intentamos primero SIN esquema estricto para evitar errores de validación
      // (Es la estrategia más segura para que funcione sí o sí)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Si el error es "Not Found", lanzamos error para probar el siguiente modelo
        throw new Error(data.error?.message || response.statusText);
      }

      return data;
    };

    // BUCLE PRINCIPAL: Prueba los modelos uno por uno
    for (const model of models) {
      try {
        const result = await tryModel(model);
        
        // Si llegamos aquí, ¡funciono!
        // Limpiamos la respuesta
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          text = text.replace(/```json/g, '').replace(/```/g, '').trim();
          return res.status(200).json({ ok: true, data: JSON.parse(text), modelUsed: model });
        }
      } catch (e) {
        console.warn(`Falló ${model}: ${e.message}`);
        lastError = e.message;
        // Si falla, el bucle 'for' continúa automáticamente con el siguiente modelo
      }
    }

    // Si probamos todos y ninguno funcionó:
    return res.status(500).json({ 
      error: 'No se pudo generar contenido con ningún modelo.', 
      detail: lastError 
    });

  } catch (e) {
    return res.status(500).json({ error: 'Error del servidor', detail: e.message });
  }
}
