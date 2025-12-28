// api/generate.mjs — Versión 10.0 (Cazador de Modelos)
export default async function handler(req, res) {
  // 1. Configuración CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta la API Key en Vercel' });
  }

  const { prompt, responseSchema, temperature = 0.3 } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

  // --- LISTA DE MODELOS A PROBAR (EN ORDEN) ---
  const modelsToTry = [
    { id: 'gemini-1.5-flash', supportsJson: true },       // Opción A: El más rápido
    { id: 'gemini-1.5-flash-latest', supportsJson: true }, // Opción B: Alias alternativo
    { id: 'gemini-pro', supportsJson: false }             // Opción C: El clásico (Backup seguro)
  ];

  let lastError = null;

  // --- BUCLE DE INTENTOS ---
  for (const modelConfig of modelsToTry) {
    const modelName = modelConfig.id;
    console.log(`🔄 Intentando conectar con modelo: ${modelName}...`);

    try {
      // Configurar petición según capacidades del modelo
      const requestBody = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: temperature }
      };

      // Solo activamos JSON nativo para los modelos 1.5
      if (modelConfig.supportsJson) {
        requestBody.generationConfig.responseMimeType = "application/json";
        if (responseSchema) {
          requestBody.generationConfig.responseSchema = responseSchema;
        }
      }

      // Llamada a Google
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );

      const data = await response.json();

      // Si falla este modelo, lanzamos error para saltar al siguiente en el bucle
      if (!response.ok) {
        throw new Error(data.error?.message || response.statusText);
      }

      // ¡ÉXITO! Procesamos la respuesta
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error('Respuesta vacía');

      // Limpieza y Parseo
      const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const parsedData = JSON.parse(cleanedText);
        // Si llegamos aquí, funcionó. Retornamos y terminamos la función.
        console.log(`✅ ÉXITO con modelo: ${modelName}`);
        return res.status(200).json({ ok: true, data: parsedData, modelUsed: modelName });
      } catch (e) {
        // Si el JSON falla, no es culpa del modelo sino del formato, pero devolvemos error
        // para que el usuario sepa que la IA respondió mal.
        console.error(`⚠️ El modelo ${modelName} respondió, pero el JSON no era válido.`);
        throw new Error('JSON inválido en la respuesta'); 
      }

    } catch (error) {
      console.warn(`❌ Falló modelo ${modelName}: ${error.message}`);
      lastError = error.message;
      // El bucle continuará automáticamente con el siguiente modelo de la lista
    }
  }

  // --- SI LLEGAMOS AQUÍ, TODOS FALLARON ---
  return res.status(500).json({ 
    error: 'No se pudo generar contenido con ningún modelo.', 
    detail: `Último error: ${lastError}`,
    tips: 'Verifica que la API "Generative Language API" esté habilitada en Google Cloud.'
  });
}
