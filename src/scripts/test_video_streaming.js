const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const videoStreamService = require('../services/video-stream.service');

class MockResponse extends Writable {
    constructor() {
        super();
        this.headers = {};
        this.statusCode = 200;
        this.data = [];
    }

    setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    json(payload) {
        this.jsonData = payload;
        return this;
    }

    sendStatus(code) {
        this.statusCode = code;
        return this;
    }

    _write(chunk, encoding, callback) {
        this.data.push(chunk);
        callback();
    }
}

async function runTests() {
    console.log('--- INICIANDO PRUEBAS DE VIDEO STREAMING SERVICE ---');
    let passed = 0;
    let failed = 0;

    const assert = (condition, name) => {
        if (condition) {
            console.log(`  ✓ [PASS] ${name}`);
            passed++;
        } else {
            console.error(`  ✗ [FAIL] ${name}`);
            failed++;
        }
    };

    // Crear un archivo de video simulado en la carpeta de caché
    const testFileId = 'test-video-123456';
    const testFilePath = videoStreamService.getCacheFilePath(testFileId);
    const dummyData = Buffer.alloc(5 * 1024 * 1024, 0x41); // 5 MB de datos simulados
    fs.writeFileSync(testFilePath, dummyData);

    try {
        // Prueba 1: Range Request parcial (primeros 1MB: 0 - 1048575)
        {
            const mockReq = {
                method: 'GET',
                params: { fileId: testFileId },
                headers: { range: 'bytes=0-1048575' },
                on: () => {}
            };
            const mockRes = new MockResponse();

            await videoStreamService.handleStream(mockReq, mockRes);
            await new Promise(r => mockRes.on('finish', r));

            assert(mockRes.statusCode === 206, 'HTTP Status es 206 Partial Content');
            assert(mockRes.headers['accept-ranges'] === 'bytes', 'Accept-Ranges es "bytes"');
            assert(mockRes.headers['content-range'] === `bytes 0-1048575/${dummyData.length}`, `Content-Range es exacto: ${mockRes.headers['content-range']}`);
            assert(mockRes.headers['content-length'] === '1048576', `Content-Length es exactamente 1048576 bytes: ${mockRes.headers['content-length']}`);
            const totalReceived = Buffer.concat(mockRes.data).length;
            assert(totalReceived === 1048576, `Bytes recibidos por stream: ${totalReceived}`);
        }

        // Prueba 2: Range Request segundo tramo (bytes 1048576 - 2097151)
        {
            const mockReq = {
                method: 'GET',
                params: { fileId: testFileId },
                headers: { range: 'bytes=1048576-2097151' },
                on: () => {}
            };
            const mockRes = new MockResponse();

            await videoStreamService.handleStream(mockReq, mockRes);
            await new Promise(r => mockRes.on('finish', r));

            assert(mockRes.statusCode === 206, 'Segundo chunk: HTTP Status 206');
            assert(mockRes.headers['content-range'] === `bytes 1048576-2097151/${dummyData.length}`, `Segundo chunk: Content-Range exacto`);
            assert(mockRes.headers['content-length'] === '1048576', 'Segundo chunk: Content-Length exacto (1MB)');
            const totalReceived = Buffer.concat(mockRes.data).length;
            assert(totalReceived === 1048576, `Segundo chunk bytes recibidos: ${totalReceived}`);
        }

        // Prueba 3: Petición sin Range (reproducción completa normal)
        {
            const mockReq = {
                method: 'GET',
                params: { fileId: testFileId },
                headers: {},
                on: () => {}
            };
            const mockRes = new MockResponse();

            await videoStreamService.handleStream(mockReq, mockRes);
            await new Promise(r => mockRes.on('finish', r));

            assert(mockRes.statusCode === 200, 'Sin cabecera Range: HTTP Status 200 OK');
            assert(mockRes.headers['content-length'] === dummyData.length.toString(), 'Sin cabecera Range: Content-Length es tamaño total');
            const totalReceived = Buffer.concat(mockRes.data).length;
            assert(totalReceived === dummyData.length, `Recibido archivo completo: ${totalReceived} bytes`);
        }

        // Prueba 4: Rango fuera de límites (HTTP 416 Range Not Satisfiable)
        {
            const mockReq = {
                method: 'GET',
                params: { fileId: testFileId },
                headers: { range: `bytes=${dummyData.length + 1000}-${dummyData.length + 2000}` },
                on: () => {}
            };
            const mockRes = new MockResponse();

            await videoStreamService.handleStream(mockReq, mockRes);

            assert(mockRes.statusCode === 416, 'Rango fuera de límites: HTTP Status 416');
            assert(mockRes.headers['content-range'] === `bytes */${dummyData.length}`, `Rango fuera de límites: Content-Range bytes */${dummyData.length}`);
        }

        // Prueba 5: Caché de metadatos en memoria
        {
            videoStreamService.metadataCache.set('fake-meta-id', {
                data: { id: 'fake-meta-id', name: 'demo.mp4', mimeType: 'video/mp4', size: 99999 },
                timestamp: Date.now()
            });

            const t0 = performance.now();
            const meta = await videoStreamService.getFileMetadata('fake-meta-id');
            const t1 = performance.now();

            assert(meta !== null && meta.name === 'demo.mp4', 'Metadatos recuperados de la caché');
            assert((t1 - t0) < 5, `Tiempo de recuperación de metadatos ultra-rápido: ${(t1 - t0).toFixed(3)} ms`);
        }

    } finally {
        // Limpiar archivo temporal de prueba
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    }

    console.log(`\nRESULTADO: ${passed} pruebas exitosas, ${failed} fallidas.`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Error fatal durante las pruebas:', err);
    process.exit(1);
});
