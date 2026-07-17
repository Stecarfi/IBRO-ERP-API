const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

async function askGemini(userPrompt, chatHistory = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error("Clave de API no configurada. Por favor agrega tu GEMINI_API_KEY en el archivo .env del backend.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: systemInstruction
  });

  const context = await getCompanyContext();
  
  // Mapear el historial al formato compatible con el SDK de Gemini
  // [{ role: 'user' | 'model', parts: [{ text: '...' }] }]
  const formattedHistory = chatHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.parts[0].text }]
  }));

  // Crear la sesión de chat con el historial previo
  const chat = model.startChat({
    history: formattedHistory,
  });

  // Enviar el prompt inyectando el contexto de la base de datos en tiempo real al mensaje final del usuario
  const fullPrompt = `${context}\n\nPregunta/Instrucción del usuario:\n${userPrompt}`;

  const result = await chat.sendMessage(fullPrompt);
  const response = await result.response;
  return response.text();
}

module.exports = {
  askGemini
};
