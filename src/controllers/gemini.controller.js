const { askGemini, geminiLogs } = require('../geminiService');

class GeminiController {
    async testKey(req, res) {
        const key = process.env.GEMINI_API_KEY || '';
        if (!key) {
            return res.json({ hasKey: false, message: 'No hay ninguna clave configurada en process.env.GEMINI_API_KEY' });
        }
        return res.json({
            hasKey: true,
            length: key.length,
            prefix: key.substring(0, 6) + '...',
            suffix: '...' + key.substring(key.length - 4),
            message: 'Compara este prefijo y sufijo con tu clave copiada de Google AI Studio para verificar si Render ya aplicó los cambios.'
        });
    }

    async getLogs(req, res) {
        return res.json({
            logs: geminiLogs || []
        });
    }

    async listModels(req, res) {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
            return res.json({ success: false, error: 'No hay API Key configurada' });
        }
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const result = await genAI.listModels();
            return res.json({
                success: true,
                models: result.models || result
            });
        } catch (error) {
            return res.json({
                success: false,
                error: error.message
            });
        }
    }

    async chat(req, res) {
        const { prompt, history, model } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Falta el parámetro "prompt"' });
        }

        try {
            const aiResponse = await askGemini(prompt, history || [], model || null);
            res.json({ response: aiResponse });
        } catch (error) {
            console.error('Gemini chat error:', error.message);
            res.status(500).json({ error: error.message || 'Error interno al procesar con Gemini' });
        }
    }
}

module.exports = new GeminiController();
