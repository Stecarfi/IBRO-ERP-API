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
            const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
            
            if (!credentialsBase64) {
                console.warn('[DRIVE SERVICE] GOOGLE_CREDENTIALS_BASE64 no está configurado. La subida a Drive no funcionará.');
                return;
            }

            if (!this.folderId) {
                console.warn('[DRIVE SERVICE] GOOGLE_DRIVE_FOLDER_ID no está configurado. La subida a Drive no funcionará.');
                return;
            }

            // Decodificar Base64 a JSON
            const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
            const credentials = JSON.parse(credentialsJson);

            // Autenticación con Google Auth usando las credenciales del Service Account
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
            });

            this.drive = google.drive({ version: 'v3', auth });
            console.log('[DRIVE SERVICE] Servicio de Google Drive inicializado correctamente.');
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

            // Extraer de nuevo los detalles para obtener el webViewLink si la creación de permisos afectó
            const finalFile = await this.drive.files.get({
                fileId: fileId,
                fields: 'webViewLink, webContentLink'
            });

            // webViewLink es ideal para previsualizar (por ejemplo, avatares o PDFs)
            return finalFile.data.webViewLink;
        } catch (error) {
            console.error('[DRIVE SERVICE] Error durante la subida:', error);
            throw error;
        }
    }
}

module.exports = new DriveService();
