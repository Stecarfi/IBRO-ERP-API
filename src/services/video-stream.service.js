const fs = require('fs');
const path = require('path');
const stream = require('stream');
const driveService = require('./drive.service');

/**
 * Servicio de Streaming de Video de Alto Rendimiento para Google Drive
 * Proporciona:
 * 1. Soporte estricto de HTTP 206 Partial Content (RFC 7233)
 * 2. Caché en memoria de metadatos (evita latencia de 800ms por cada chunk)
 * 3. Smart Video Disk Cache (reproducción instantánea desde disco tras la primera descarga)
 * 4. Control de desconexión (destruye streams en desuso evitando fugas de ancho de banda)
 */
class VideoStreamService {
    constructor() {
        // En memoria: caché de metadatos de archivos de Google Drive (TTL 60 minutos)
        this.metadataCache = new Map();
        this.METADATA_TTL_MS = 60 * 60 * 1000;

        // Directorio de almacenamiento en caché en disco para streaming progresivo ultra-rápido
        this.cacheDir = path.resolve(__dirname, '../../temp_video_cache');
        this.initCacheDir();

        // Registro de descargas activas a caché en segundo plano
        this.activeCacheJobs = new Map();

        // Mantenimiento periódico de caché en disco (cada 24 horas)
        this.cleanOldCache();
        const cleanupTimer = setInterval(() => this.cleanOldCache(), 24 * 60 * 60 * 1000);
        if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
    }

    initCacheDir() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
        } catch (err) {
            console.warn('[VIDEO-STREAM] No se pudo crear directorio de caché de videos:', err.message);
        }
    }

    getCacheFilePath(fileId) {
        return path.join(this.cacheDir, `${fileId}.mp4`);
    }

    getTempDownloadPath(fileId) {
        return path.join(this.cacheDir, `${fileId}.downloading`);
    }

    /**
     * Almacena directamente en caché local el buffer de un video subido para disponibilidad instantánea (latencia 1ms)
     */
    saveToCache(fileId, buffer, meta = null) {
        if (!fileId || !buffer) return false;
        try {
            const cachedFile = this.getCacheFilePath(fileId);
            fs.writeFileSync(cachedFile, buffer);
            if (meta) {
                this.metadataCache.set(fileId, {
                    data: {
                        id: fileId,
                        name: meta.name || `video-${fileId}.mp4`,
                        mimeType: meta.mimeType || 'video/mp4',
                        size: buffer.length
                    },
                    timestamp: Date.now()
                });
            }
            console.log(`[VIDEO-STREAM-CACHE] Video ${fileId} almacenado de inmediato en caché local (${buffer.length} bytes).`);
            return true;
        } catch (err) {
            console.warn(`[VIDEO-STREAM-CACHE] No se pudo guardar video ${fileId} en caché:`, err.message);
            return false;
        }
    }

    async getFileMetadata(fileId) {
        const cached = this.metadataCache.get(fileId);
        const now = Date.now();
        if (cached && (now - cached.timestamp < this.METADATA_TTL_MS)) {
            return cached.data;
        }

        if (driveService && typeof driveService.isAvailable === 'function' && driveService.isAvailable()) {
            try {
                const metaRes = await driveService.drive.files.get({
                    fileId: fileId,
                    fields: 'id, name, mimeType, size',
                    supportsAllDrives: true
                });
                const meta = {
                    id: metaRes.data.id,
                    name: metaRes.data.name || `video-${fileId}.mp4`,
                    mimeType: metaRes.data.mimeType || 'video/mp4',
                    size: metaRes.data.size ? parseInt(metaRes.data.size, 10) : null
                };
                this.metadataCache.set(fileId, { data: meta, timestamp: now });
                return meta;
            } catch (err) {
                console.warn(`[VIDEO-STREAM] Error al consultar metadatos de Drive para ${fileId}:`, err.message);
            }
        }

        return null;
    }

    /**
     * Inicia una descarga en segundo plano hacia la caché en disco si aún no existe ni está en proceso.
     */
    triggerBackgroundCache(fileId, meta) {
        const cachedFile = this.getCacheFilePath(fileId);
        if (fs.existsSync(cachedFile)) return;
        if (this.activeCacheJobs.has(fileId)) return;

        if (!driveService || typeof driveService.isAvailable !== 'function' || !driveService.isAvailable()) {
            return;
        }

        const tempFile = this.getTempDownloadPath(fileId);
        const jobPromise = (async () => {
            let writeStream = null;
            let driveStream = null;
            try {
                console.log(`[VIDEO-STREAM-CACHE] Iniciando descarga a caché local para ${fileId} (${meta?.name || 'video'})...`);
                driveStream = await driveService.drive.files.get(
                    { fileId: fileId, alt: 'media', supportsAllDrives: true },
                    { responseType: 'stream' }
                );

                writeStream = fs.createWriteStream(tempFile);
                await new Promise((resolve, reject) => {
                    driveStream.data
                        .pipe(writeStream)
                        .on('finish', resolve)
                        .on('error', reject);
                    driveStream.data.on('error', reject);
                });

                // Renombrar de .downloading a .mp4 atómicamente
                if (fs.existsSync(tempFile)) {
                    fs.renameSync(tempFile, cachedFile);
                    console.log(`[VIDEO-STREAM-CACHE] Video ${fileId} almacenado exitosamente en caché local.`);
                }
            } catch (err) {
                console.warn(`[VIDEO-STREAM-CACHE] Error en descarga a caché para ${fileId}:`, err.message);
                if (fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch (_) {}
                }
            } finally {
                this.activeCacheJobs.delete(fileId);
            }
        })();

        this.activeCacheJobs.set(fileId, jobPromise);
    }

    /**
     * Limpieza automática de videos antiguos en caché si el volumen supera 3 GB o tienen más de 7 días
     */
    cleanOldCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) return;
            const files = fs.readdirSync(this.cacheDir);
            const now = Date.now();
            let totalBytes = 0;
            const fileStats = [];

            for (const f of files) {
                const fp = path.join(this.cacheDir, f);
                try {
                    const st = fs.statSync(fp);
                    totalBytes += st.size;
                    fileStats.push({ path: fp, mtime: st.mtimeMs, size: st.size });
                } catch (_) {}
            }

            // Si supera 3GB o archivos de más de 7 días, eliminar los más antiguos
            const MAX_BYTES = 3 * 1024 * 1024 * 1024; // 3GB
            const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

            fileStats.sort((a, b) => a.mtime - b.mtime); // más antiguos primero

            for (const item of fileStats) {
                const isTooOld = (now - item.mtime) > MAX_AGE_MS;
                const isOverLimit = totalBytes > MAX_BYTES;
                if (isTooOld || isOverLimit) {
                    try {
                        fs.unlinkSync(item.path);
                        totalBytes -= item.size;
                    } catch (_) {}
                }
            }
        } catch (err) {
            console.warn('[VIDEO-STREAM-CACHE] Error en limpieza de caché:', err.message);
        }
    }

    /**
     * Manejador maestro de streaming HTTP (con soporte estricto HTTP 206 Range Requests)
     */
    async handleStream(req, res) {
        try {
            const { fileId } = req.params;
            if (!fileId) return res.status(400).json({ error: 'fileId es requerido' });

            // CORS & Headers estándar
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range, Accept-Ranges, Content-Disposition');

            if (req.method === 'OPTIONS') {
                return res.sendStatus(204);
            }

            // Obtener metadatos (desde caché en memoria o consulta a Drive)
            let meta = await this.getFileMetadata(fileId);

            // 1. RUTA ÓPTIMA: ARCHIVO YA ALMACENADO EN CACHÉ LOCAL EN DISCO (Latencia ~1ms)
            const cachedFilePath = this.getCacheFilePath(fileId);
            if (fs.existsSync(cachedFilePath)) {
                try {
                    const stat = fs.statSync(cachedFilePath);
                    if (stat.size > 0) {
                        const totalSize = stat.size;
                        const mimeType = meta?.mimeType || 'video/mp4';
                        const fileName = meta?.name || `video-${fileId}.mp4`;

                        res.setHeader('Accept-Ranges', 'bytes');
                        res.setHeader('Content-Type', mimeType);
                        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
                        res.setHeader('Cache-Control', 'public, max-age=86400');

                        const range = req.headers.range;
                        if (range) {
                            const parts = range.replace(/bytes=/, '').split('-');
                            const start = parseInt(parts[0], 10) || 0;
                            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

                            if (start >= totalSize || end >= totalSize || start > end) {
                                res.status(416);
                                res.setHeader('Content-Range', `bytes */${totalSize}`);
                                return res.end();
                            }

                            const chunkSize = (end - start) + 1;
                            res.status(206);
                            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
                            res.setHeader('Content-Length', chunkSize.toString());

                            if (req.method === 'HEAD') return res.end();

                            const fileStream = fs.createReadStream(cachedFilePath, { start, end });
                            req.on('close', () => {
                                try { fileStream.destroy(); } catch (_) {}
                            });
                            return fileStream.pipe(res);
                        } else {
                            res.status(200);
                            res.setHeader('Content-Length', totalSize.toString());
                            if (req.method === 'HEAD') return res.end();

                            const fileStream = fs.createReadStream(cachedFilePath);
                            req.on('close', () => {
                                try { fileStream.destroy(); } catch (_) {}
                            });
                            return fileStream.pipe(res);
                        }
                    }
                } catch (diskErr) {
                    console.warn(`[VIDEO-STREAM] Error leyendo archivo de caché local para ${fileId}, usando Drive:`, diskErr.message);
                }
            }

            // Si no está en disco, iniciar en segundo plano la descarga a caché local
            this.triggerBackgroundCache(fileId, meta);

            // 2. RUTA STREAMING DIRECTO DESDE GOOGLE DRIVE CON SERVICE ACCOUNT Y RANGE ESTRICTO
            if (driveService && typeof driveService.isAvailable === 'function' && driveService.isAvailable()) {
                try {
                    const totalSize = meta?.size || null;
                    const requestHeaders = {};
                    let start = 0;
                    let end = totalSize ? totalSize - 1 : null;
                    let isRangeRequest = false;

                    if (req.headers.range) {
                        isRangeRequest = true;
                        requestHeaders.Range = req.headers.range;
                        const parts = req.headers.range.replace(/bytes=/, '').split('-');
                        start = parseInt(parts[0], 10) || 0;
                        if (parts[1]) {
                            end = parseInt(parts[1], 10);
                        } else if (totalSize) {
                            end = totalSize - 1;
                        }
                    }

                    const driveStream = await driveService.drive.files.get(
                        { fileId: fileId, alt: 'media', supportsAllDrives: true },
                        { responseType: 'stream', headers: requestHeaders }
                    );

                    // Helper para encabezados (compatible con Headers API y objetos simples)
                    const getH = (name) => {
                        const h = driveStream.headers;
                        if (!h) return null;
                        if (typeof h.get === 'function') {
                            const val = h.get(name);
                            if (val) return val;
                        }
                        return h[name] || h[name.toLowerCase()] || null;
                    };

                    const upstreamRange = getH('content-range');
                    const upstreamLength = getH('content-length');
                    const mimeType = meta?.mimeType || getH('content-type') || 'video/mp4';
                    const fileName = meta?.name || `video-${fileId}.mp4`;

                    res.setHeader('Accept-Ranges', 'bytes');
                    res.setHeader('Content-Type', mimeType);
                    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
                    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

                    if (isRangeRequest) {
                        res.status(206);
                        if (upstreamRange) {
                            res.setHeader('Content-Range', upstreamRange);
                            if (upstreamLength) {
                                res.setHeader('Content-Length', upstreamLength);
                            } else if (totalSize && end !== null) {
                                res.setHeader('Content-Length', ((end - start) + 1).toString());
                            }
                        } else if (totalSize) {
                            const effectiveEnd = end !== null ? Math.min(end, totalSize - 1) : totalSize - 1;
                            const chunkSize = (effectiveEnd - start) + 1;
                            res.setHeader('Content-Range', `bytes ${start}-${effectiveEnd}/${totalSize}`);
                            res.setHeader('Content-Length', chunkSize.toString());
                        }
                    } else {
                        res.status(driveStream.status || 200);
                        if (upstreamLength) {
                            res.setHeader('Content-Length', upstreamLength);
                        } else if (totalSize) {
                            res.setHeader('Content-Length', totalSize.toString());
                        }
                    }

                    if (req.method === 'HEAD') {
                        if (driveStream.data && typeof driveStream.data.destroy === 'function') {
                            driveStream.data.destroy();
                        }
                        return res.end();
                    }

                    // Cancelar upstream stream si el cliente se desconecta
                    req.on('close', () => {
                        if (driveStream.data && typeof driveStream.data.destroy === 'function') {
                            driveStream.data.destroy();
                        }
                    });

                    return driveStream.data.pipe(res);
                } catch (authErr) {
                    console.warn('[VIDEO-STREAM] Streaming con Service Account falló, usando respaldo público:', authErr.message);
                }
            }

            // 3. RESPALDO UNIVERSAL DIRECTO (URL pública de Google Drive)
            const directDriveUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
            const fetchHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
            if (req.headers.range) {
                fetchHeaders.Range = req.headers.range;
            }

            const abortController = new AbortController();
            req.on('close', () => abortController.abort());

            let fetchRes = await fetch(directDriveUrl, {
                headers: fetchHeaders,
                redirect: 'follow',
                signal: abortController.signal
            });

            let contentType = fetchRes.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                const htmlText = await fetchRes.text();
                const confirmMatch = htmlText.match(/href="(\/uc\?export=download[^"]+confirm=[^"&]+[^"]*)"/) ||
                                     htmlText.match(/href="(https:\/\/[^"]+confirm=[^"&]+[^"]*)"/);
                if (confirmMatch) {
                    const confirmedUrl = confirmMatch[1].startsWith('http') ? confirmMatch[1] : `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, '&')}`;
                    fetchRes = await fetch(confirmedUrl, {
                        headers: fetchHeaders,
                        redirect: 'follow',
                        signal: abortController.signal
                    });
                    contentType = fetchRes.headers.get('content-type') || 'video/mp4';
                }
            }

            if (!fetchRes.ok && fetchRes.status !== 206) {
                return res.status(fetchRes.status || 500).json({ error: 'No se pudo descargar el video desde Google Drive' });
            }

            const contentLength = fetchRes.headers.get('content-length');
            const contentRange = fetchRes.headers.get('content-range');

            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', contentType.includes('text/html') ? 'video/mp4' : (contentType || 'video/mp4'));
            res.setHeader('Content-Disposition', `inline; filename="video-${fileId}.mp4"`);
            res.setHeader('Cache-Control', 'public, max-age=3600');

            if (req.headers.range && (fetchRes.status === 206 || contentRange)) {
                res.status(206);
                if (contentRange) res.setHeader('Content-Range', contentRange);
                if (contentLength) res.setHeader('Content-Length', contentLength);
            } else {
                res.status(fetchRes.status || 200);
                if (contentLength) res.setHeader('Content-Length', contentLength);
            }

            if (req.method === 'HEAD') {
                return res.end();
            }

            if (fetchRes.body) {
                const nodeStream = stream.Readable.fromWeb ? stream.Readable.fromWeb(fetchRes.body) : null;
                if (nodeStream) {
                    req.on('close', () => {
                        try { nodeStream.destroy(); } catch (_) {}
                    });
                    return nodeStream.pipe(res);
                }
            }

            const arrayBuffer = await fetchRes.arrayBuffer();
            return res.send(Buffer.from(arrayBuffer));
        } catch (err) {
            console.error('[VIDEO-STREAM] Error al transmitir video:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error al transmitir video desde Drive' });
            }
        }
    }
}

module.exports = new VideoStreamService();
