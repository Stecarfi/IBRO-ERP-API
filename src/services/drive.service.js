const { google } = require('googleapis');
const stream = require('stream');

/**
 * Servicio para subir archivos a Google Drive
 */
class DriveService {
    constructor() {
        this.drive = null;
        this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        this.init();
    }

    init() {
        try {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
            
            if (!clientId || !clientSecret || !refreshToken) {
                console.warn('[DRIVE SERVICE] Faltan variables de entorno GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REFRESH_TOKEN. La subida a Drive no funcionará.');
                return;
            }

            if (!this.folderId) {
                console.warn('[DRIVE SERVICE] GOOGLE_DRIVE_FOLDER_ID no está configurado. La subida a Drive no funcionará.');
                return;
            }

            // Autenticación con OAuth2 usando Refresh Token
            const oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                'https://developers.google.com/oauthplayground' // Redirect URI
            );

            oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            this.drive = google.drive({ version: 'v3', auth: oauth2Client });
            console.log('[DRIVE SERVICE] Servicio de Google Drive (OAuth2) inicializado correctamente.');
        } catch (error) {
            console.error('[DRIVE SERVICE] Error al inicializar Google Drive:', error);
        }
    }

    /**
     * Sube un archivo a Google Drive
     * @param {Buffer} buffer - El buffer de memoria del archivo (desde multer)
     * @param {string} originalName - El nombre original del archivo
     * @param {string} mimeType - El tipo MIME del archivo
     * @returns {Promise<string>} - La URL webViewLink pública del archivo en Drive
     */
    async uploadFile(buffer, originalName, mimeType) {
        if (!this.drive) {
            throw new Error('El servicio de Google Drive no está inicializado.');
        }

        // Crear un Readable Stream desde el Buffer
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        // Sufijo de tiempo para evitar colisiones de nombres
        const safeName = `${Date.now()}-${originalName}`;

        const fileMetadata = {
            name: safeName,
            parents: [this.folderId]
        };

        const media = {
            mimeType: mimeType,
            body: bufferStream
        };

        try {
            console.log(`[DRIVE SERVICE] Subiendo archivo ${safeName} a Drive...`);
            // Subir el archivo
            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink, webContentLink' // Solicitamos los links en la respuesta
            });

            const fileId = response.data.id;
            console.log(`[DRIVE SERVICE] Archivo subido con éxito. ID: ${fileId}`);

            // Hacer el archivo público para que cualquiera con el enlace (ej. el frontend) pueda verlo
            try {
                await this.drive.permissions.create({
                    fileId: fileId,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone',
                    }
                });
            } catch (permError) {
                console.warn(`[DRIVE SERVICE] No se pudo hacer público el archivo ${fileId} automáticamente. Si la carpeta es pública, ignorar. Error:`, permError.message);
            }

            // Extraer de nuevo los detalles para asegurar que se guardaron los permisos
            await this.drive.files.get({
                fileId: fileId,
                fields: 'id'
            });

            // Retornamos un enlace thumbnail que funciona perfecto en etiquetas <img> de HTML/React
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        } catch (error) {
            console.error('[DRIVE SERVICE] Error durante la subida:', error);
            throw error;
        }
    }
}

module.exports = new DriveService();
