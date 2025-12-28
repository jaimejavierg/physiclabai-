// api/generate.mjs
export default async function handler(req, res) {
  // 1. Configuración de cabeceras CORS (Permite que tu HTML hable con este backend)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // En producción, idealmente pon tu dominio aquí
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Manejo de la solicitud "preflight" de CORS
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Solo aceptamos peticiones POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Verificamos que la llave exista en Vercel
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Falta la API Key en las variables de entorno' });
    }

    // Extraemos los datos. Ignoramos el 'model' del frontend para forzar el uso del correcto aquí.
    const { prompt, responseSchema, temperature = 0.3 } = req.body || {};
    
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

    // --- CONFIGURACIÓN DE GEMINI ---
    // Usamos 'v1beta' para tener acceso a funcionalidades avanzadas como responseSchema
    const apiVersion = 'v1beta'; 
    // Usamos 'gemini-1.5-flash' que es rápido, barato y soporta JSON nativo
    const model = 'gemini-1.5-flash';

    console.log(`Conectando a modelo: ${model} via ${apiVersion}...`);

    // Construimos la petición para Google
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperature,
        // CRUCIAL: Esto fuerza a Gemini a responder SIEMPRE en JSON válido
        responseMimeType: "application/json", 
      }
    };

    // Si tu frontend envió una estructura (schema), se la pasamos a la IA
    if (responseSchema) {
      requestBody.generationConfig.responseSchema = responseSchema;
    }

    // Hacemos la llamada a la API de Google usando fetch (nativo en Node 18+)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Error devuelto por Google:", data);
      throw new Error(data.error?.message || response.statusText);
    }

    // Extraemos el texto de la respuesta
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      // Como usamos responseMimeType, el texto YA es un JSON string. Lo parseamos.
      try {
        const parsed = JSON.parse(text);
        return res.status(200).json({ ok: true, data: parsed, modelUsed: model });
      } catch (jsonError) {
        console.error("Error parseando JSON:", text);
        // Intento de rescate si la IA falló en el formato
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedRetry = JSON.parse(cleanedText);
        return res.status(200).json({ ok: true, data: parsedRetry, modelUsed: model });
      }
    } else {
      throw new Error('La IA respondió vacío.');
    }

  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ 
      error: 'Error interno del servidor', 
      detail: e.message 
    });
  }
}
