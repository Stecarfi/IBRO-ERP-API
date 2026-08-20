const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('./prisma');

const geminiLogs = [];
function addLog(msg) {
  geminiLogs.push(`[${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`);
  if (geminiLogs.length > 50) geminiLogs.shift();
  console.log(msg);
}

const systemInstruction = `
Eres G-IBRO-AI, el asistente inteligente oficial de la plataforma G-IBRO S.A.S. (empresa de soluciones de climatización, aire acondicionado y sistemas HVAC en Cartagena, Colombia, fundada en 2003, con más de 73,000 unidades vendidas).
Tu objetivo es ayudar al equipo de dirección y empleados de la empresa a resolver dudas, analizar el estado del ERP, redactar correos para respuestas de PQRs (quejas de clientes), redactar propuestas comerciales de cotizaciones e informar sobre indicadores de ventas y stock.

Directrices de comportamiento:
1. Responde de forma muy profesional, comercial, empática, y precisa.
2. Comunícate en Español colombiano/latinoamericano neutro.
3. Formatea las respuestas usando markdown estructurado (títulos, listas con viñetas, tablas de datos si es relevante).
4. Usa los datos del contexto de la empresa en tiempo real suministrados en el prompt para responder preguntas específicas sobre clientes, ventas, inventario y PQRs.
`;

async function getCompanyContext() {
  try {
    const clientsCount = await prisma.cliente.count();
    const productsCount = await prisma.inventario.count();
    const salesCount = await prisma.venta.count();
    const pqrsCount = await prisma.pQR.count();
    const activePqrs = await prisma.pQR.count({ where: { estado: { not: 'Solucionado' } } });
    
    // Obtener los productos con bajo stock (cant < 5)
    const lowStockProducts = await prisma.inventario.findMany({
      where: { cant: { lt: 5 } },
      take: 5,
      select: { ref: true, nom: true, cant: true }
    });

    // Obtener últimas 5 ventas
    const recentSales = await prisma.venta.findMany({
      take: 5,
      orderBy: { fechaIso: 'desc' },
      include: { cliente: true, producto: true }
    });

    const salesList = recentSales.map(v => `- Factura ${v.id}: Cliente ${v.cliente.nom}, Producto ${v.producto.ref}, Total: $${v.total.toLocaleString('es-CO')}`).join('\n');
    const stockList = lowStockProducts.map(p => `- ${p.nom} (${p.ref}): ${p.cant} unidades`).join('\n');

    return `
=== CONTEXTO DEL ERP EN TIEMPO REAL ===
- Clientes totales: ${clientsCount}
- Referencias de producto en inventario: ${productsCount}
- Facturas / Ventas totales registradas: ${salesCount}
- PQRs totales radicadas: ${pqrsCount} (PQRs pendientes de solucionar: ${activePqrs})

Productos con bajo stock (menos de 5 unidades):
${stockList || '- Ninguno, todo el stock está al día.'}

Últimas 5 ventas realizadas en el sistema:
${salesList || '- No hay ventas recientes.'}
======================================
`;
  } catch (err) {
    console.error("Error gathering company context for Gemini:", err);
    return "\n=== CONTEXTO DEL ERP ===\nNo se pudo recopilar datos en tiempo real debido a un error técnico en el acceso a la base de datos.\n========================\n";
  }
}

async function askGemini(userPrompt, chatHistory = [], selectedModel = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error("Clave de API no configurada. Por favor agrega tu GEMINI_API_KEY en el archivo .env del backend.");
  }
  addLog(`[GEMINI DEBUG] Usando API KEY activa. Prefijo: ${apiKey.substring(0, 6)}... Sufijo: ${apiKey.substring(apiKey.length - 4)}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const context = await getCompanyContext();
  
  // Mapear y sanitizar el historial al formato compatible con el SDK de Gemini
  let formattedHistory = (chatHistory || []).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: (msg.parts && msg.parts[0] && msg.parts[0].text) ? msg.parts[0].text : '' }]
  }));

  // Regla 1: Debe iniciar con un mensaje de rol 'user'
  while (formattedHistory.length > 0 && formattedHistory[0].role !== 'user') {
    formattedHistory.shift();
  }

  // Regla 2: Debe alternar estrictamente de forma secuencial: user -> model -> user -> model...
  const cleanHistory = [];
  let expectedRole = 'user';
  for (const msg of formattedHistory) {
    if (msg.role === expectedRole) {
      cleanHistory.push(msg);
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }
  formattedHistory = cleanHistory;

  // Enviar el prompt inyectando las instrucciones del sistema y el contexto de la base de datos en tiempo real al mensaje final del usuario
  const fullPrompt = `${systemInstruction}\n\n${context}\n\nPregunta/Instrucción del usuario:\n${userPrompt}`;

  let availableModelsInfo = [];
  let errorListing = "";
  let finalModelToUse = "gemini-1.5-flash"; // Default fallback

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      availableModelsInfo = listData.models || [];
      
      const supported = availableModelsInfo.filter(m => 
        m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
      ).map(m => m.name.replace("models/", ""));

      if (supported.length > 0) {
        if (supported.includes("gemini-1.5-flash")) finalModelToUse = "gemini-1.5-flash";
        else if (supported.includes("gemini-1.5-pro")) finalModelToUse = "gemini-1.5-pro";
        else if (supported.includes("gemini-1.0-pro")) finalModelToUse = "gemini-1.0-pro";
        else finalModelToUse = supported[0];
      }
    } else {
      const errText = await listRes.text();
      errorListing = `HTTP ${listRes.status}: ${errText}`;
    }
  } catch (err) {
    errorListing = err.message;
  }

  // Si el usuario solicitó uno explícitamente y está disponible, lo usamos
  if (selectedModel && availableModelsInfo.some(m => m.name.includes(selectedModel))) {
    finalModelToUse = selectedModel;
  }

  try {
    addLog(`[GEMINI] Intentando iniciar chat con modelo AUTO-DETECTADO: ${finalModelToUse}`);
    const model = genAI.getGenerativeModel({
      model: finalModelToUse
    });
    const chat = model.startChat({
      history: formattedHistory,
    });
    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;
    addLog(`[GEMINI SUCCESS] ¡Conectado con éxito al modelo ${finalModelToUse}!`);
    return response.text();
  } catch (err) {
    addLog(`[GEMINI ERROR] Falló el modelo ${finalModelToUse}: ${err.message}`);
    
    // Generar reporte detallado
    let report = `No se pudo generar respuesta con el modelo ${finalModelToUse}. Detalle: ${err.message}\n\n`;
    if (errorListing) {
      report += `Además, falló la consulta manual de modelos: ${errorListing}\n`;
    } else {
      const names = availableModelsInfo.map(m => m.name.replace("models/", "")).join(", ");
      report += `Modelos que SÍ soporta tu API Key actualmente: ${names || "Ninguno"}\n`;
      report += `\nNota: Si no ves gemini-1.5-flash en la lista, es posible que tu cuenta de Google AI Studio o la región de tu API Key no tenga acceso a este modelo.`;
    }
    
    if (err.message.includes("API key not valid") || err.message.includes("API_KEY_INVALID")) {
      throw new Error("Clave de API de Gemini inválida. Por favor, verifica tu clave en el panel de Google AI Studio.");
    }
    
    throw new Error(report);
  }
}

module.exports = {
  askGemini,
  geminiLogs
};
