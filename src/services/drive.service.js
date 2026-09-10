const { google } = require('googleapis');
const stream = require('stream');

/**
 * Servicio para gestionar archivos en Google Drive
 */
class DriveService {
    constructor() {
        this.drive = null;
        this.authType = null;
        this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
        this.init();
    }

    init() {
        try {
            // 1. Prioridad: Service Account via GOOGLE_CREDENTIALS_BASE64
            if (process.env.GOOGLE_CREDENTIALS_BASE64) {
                try {
                    const credentialsJson = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
                    const credentials = JSON.parse(credentialsJson);

                    const auth = new google.auth.JWT({
                        email: credentials.client_email,
                        key: credentials.private_key ? credentials.private_key.replace(/\\n/g, '\n') : credentials.private_key,
                        scopes: ['https://www.googleapis.com/auth/drive']
                    });

                    this.drive = google.drive({ version: 'v3', auth });
                    this.authType = 'SERVICE_ACCOUNT';
                    console.log(`[DRIVE SERVICE] Servicio de Google Drive inicializado con Service Account: ${credentials.client_email}`);
                    return;
                } catch (saErr) {
                    console.error('[DRIVE SERVICE] Error procesando GOOGLE_CREDENTIALS_BASE64:', saErr.message);
                }
            }

            // 2. Opción: OAuth2 con Client ID, Secret y Refresh Token
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

            if (clientId && clientSecret && refreshToken) {
                const oauth2Client = new google.auth.OAuth2(
                    clientId,
                    clientSecret,
                    'https://developers.google.com/oauthplayground'
                );

                oauth2Client.setCredentials({
                    refresh_token: refreshToken
                });

                this.drive = google.drive({ version: 'v3', auth: oauth2Client });
                this.authType = 'OAUTH2';
                console.log('[DRIVE SERVICE] Servicio de Google Drive inicializado con OAuth2.');
                return;
            }

            console.warn('[DRIVE SERVICE] No se encontraron credenciales válidas de Google Drive (ni GOOGLE_CREDENTIALS_BASE64 ni OAuth2).');
        } catch (error) {
            console.error('[DRIVE SERVICE] Error al inicializar Google Drive:', error);
        }
    }

    /**
     * Comprueba si el cliente de Drive está disponible
     */
    isAvailable() {
        return !!this.drive;
    }

    /**
     * Extrae el ID del archivo de Google Drive desde cualquier formato común de URL
     * @param {string} url - URL del archivo
     * @returns {string|null} - ID del archivo o null si no se reconoce
     */
    extractFileId(url) {
        if (!url || typeof url !== 'string') return null;
        const matchIdParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (matchIdParam) return matchIdParam[1];

        const matchDirect = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (matchDirect) return matchDirect[1];

        return null;
    }

    /**
     * Elimina un archivo de Google Drive a partir de su URL
     * @param {string} url - URL del archivo en Google Drive
     * @returns {Promise<boolean>}
     */
    async deleteByUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (!url.includes('drive.google.com')) return false;

        const fileId = this.extractFileId(url);
        if (fileId) {
            return await this.deleteFile(fileId);
        }
        return false;
    }

    /**
     * Sube una imagen a Google Drive y retorna un enlace optimizado para <img>
     * @param {Buffer} buffer - Buffer del archivo
     * @param {string} originalName - Nombre original
     * @param {string} mimeType - Tipo MIME
     * @returns {Promise<string>} - URL directa de Google Drive
     */
    async uploadFile(buffer, originalName, mimeType) {
        if (!this.drive) {
            throw new Error('El servicio de Google Drive no está inicializado.');
        }

        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        const safeName = `${Date.now()}-${originalName}`;
        const fileMetadata = {
            name: safeName,
            ...(this.folderId ? { parents: [this.folderId] } : {})
        };

        const media = {
            mimeType: mimeType,
            body: bufferStream
        };

        try {
            console.log(`[DRIVE SERVICE] Subiendo archivo ${safeName} a Drive...`);
            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink, webContentLink',
                supportsAllDrives: true
            });

            const fileId = response.data.id;
            console.log(`[DRIVE SERVICE] Archivo subido con éxito. ID: ${fileId}`);

            // Otorgar permisos de lectura pública
            try {
                await this.drive.permissions.create({
                    fileId: fileId,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone',
                    },
                    supportsAllDrives: true
                });
            } catch (permError) {
                console.warn(`[DRIVE SERVICE] No se pudo hacer público el archivo ${fileId} automáticamente:`, permError.message);
            }

            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        } catch (error) {
            console.error('[DRIVE SERVICE] Error durante la subida a Drive:', error.message);
            throw error;
        }
    }

    /**
     * Sube un documento (PDF, PPT, Word) a Google Drive y retorna el enlace de visualización (webViewLink)
     */
    async uploadDocument(buffer, originalName, mimeType) {
        if (!this.drive) throw new Error('El servicio de Google Drive no está inicializado.');

        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        const safeName = `${Date.now()}-${originalName}`;
        const fileMetadata = {
            name: safeName,
            ...(this.folderId ? { parents: [this.folderId] } : {})
        };
        const media = { mimeType: mimeType, body: bufferStream };

        try {
            console.log(`[DRIVE SERVICE] Subiendo documento ${safeName} a Drive...`);
            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink, webContentLink',
                supportsAllDrives: true
            });

            const fileId = response.data.id;
            try {
                await this.drive.permissions.create({
                    fileId: fileId,
                    requestBody: { role: 'reader', type: 'anyone' },
                    supportsAllDrives: true
                });
            } catch (e) {
                console.warn(`[DRIVE SERVICE] No se pudo asignar permisos públicos al documento ${fileId}:`, e.message);
            }

            return response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
        } catch (error) {
            console.error('[DRIVE SERVICE] Error durante la subida de documento a Drive:', error.message);
            throw error;
        }
    }

    /**
     * Elimina un archivo de Google Drive por su fileId
     * @param {string} fileId - ID del archivo
     */
    async deleteFile(fileId) {
        if (!this.drive) {
            console.warn('[DRIVE SERVICE] Drive no disponible para eliminar archivo:', fileId);
            return false;
        }
        try {
            await this.drive.files.delete({ fileId: fileId, supportsAllDrives: true });
            console.log(`[DRIVE SERVICE] Archivo eliminado con éxito de Drive. ID: ${fileId}`);
            return true;
        } catch (error) {
            console.error(`[DRIVE SERVICE] Error al eliminar el archivo ${fileId} de Drive:`, error.message);
            return false;
        }
    }
}

module.exports = new DriveService();
