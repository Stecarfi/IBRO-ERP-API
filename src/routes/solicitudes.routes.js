const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const authenticateToken = require('../middlewares/auth.middleware');
const { requireModuleAccess, getAccessContext } = require('../middlewares/rbac.middleware');
const { sendSolicitudesEmail } = require('../emailService');

router.use(authenticateToken);
router.use(requireModuleAccess('solicitudes'));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALID_ESTADOS = ['Pendiente', 'Aprobado', 'Rechazado'];

function parseRecipients(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    list = raw.split(/[,;\n]+/);
  }
  const normalized = Array.from(new Set(
    list.map(e => String(e || '').trim().toLowerCase()).filter(Boolean)
  ));
  const valid = normalized.filter(e => EMAIL_REGEX.test(e));
  const invalid = normalized.filter(e => !EMAIL_REGEX.test(e));
  return { valid, invalid };
}

/**
 * POST /api/solicitudes/enviar-correo
 * Envía por correo electrónico uno o varios registros de solicitudes laborales
 * con resumen HTML corporativo y archivo CSV adjunto opcional.
 */
router.post('/enviar-correo', async (req, res) => {
  try {
    const {
      recipients,
      solicitudIds,
      solicitudData = null,
      estado = 'Todas',
      subject = '',
      customMessage = '',
      includeCsv = true
    } = req.body || {};

    const { valid: validRecipients, invalid: invalidRecipients } = parseRecipients(recipients);
    if (invalidRecipients.length > 0) {
      return res.status(400).json({
        error: `Correo(s) con formato inválido: ${invalidRecipients.join(', ')}`
      });
    }
    if (validRecipients.length === 0) {
      return res.status(400).json({
        error: 'Debe ingresar al menos un correo electrónico destinatario válido.'
      });
    }
    if (validRecipients.length > 20) {
      return res.status(400).json({
        error: 'Se permite un máximo de 20 destinatarios por envío.'
      });
    }

    const accessCtx = await getAccessContext(req.user);
    const canSeeAll = accessCtx.isAdmin || accessCtx.hasAction('solicitudes', 'tramitar');

    const where = {};
    if (!canSeeAll) {
      where.asesorId = accessCtx.userId;
    }

    const hasIds = Array.isArray(solicitudIds) && solicitudIds.length > 0;
    if (hasIds) {
      const cleanIds = solicitudIds
        .map(id => String(id || '').trim())
        .filter(Boolean)
        .slice(0, 500);
      where.id = { in: cleanIds };
    } else if (estado && estado !== 'Todas' && VALID_ESTADOS.includes(String(estado))) {
      where.estado = String(estado);
    }

    let solicitudes = await prisma.solicitud.findMany({
      where,
      include: {
        asesor: {
          select: {
            id: true,
            user: true,
            nombre: true,
            apellido: true,
            correo: true,
            cargo: true
          }
        }
      },
      orderBy: [
        { fechaRadicado: 'desc' },
        { fecha: 'desc' }
      ],
      take: 500
    });

    // Fallback seguro para solicitudes recién radicadas que aún estén sincronizando con la BD
    if ((!solicitudes || solicitudes.length === 0) && hasIds && solicitudIds.length === 1 && solicitudData && typeof solicitudData === 'object') {
      const authUser = req.user?.id
        ? await prisma.user.findUnique({
            where: { id: String(req.user.id) },
            select: { id: true, user: true, nombre: true, apellido: true, correo: true, cargo: true }
          })
        : null;

      if (authUser) {
        const fullName = `${authUser.nombre || ''} ${authUser.apellido || ''}`.trim() || authUser.user;
        solicitudes = [{
          id: String(solicitudData.id || solicitudIds[0]).slice(0, 100),
          asesorId: authUser.id,
          asesor: authUser,
          nombreAsesor: fullName,
          tipo: String(solicitudData.tipo || 'Solicitud Laboral').slice(0, 120),
          detalle: String(solicitudData.detalle || '').slice(0, 4000),
          comentario: String(solicitudData.comentario || '').slice(0, 2000),
          evidencia: solicitudData.evidencia ? String(solicitudData.evidencia).slice(0, 255) : '',
          fileUrl: solicitudData.fileUrl ? String(solicitudData.fileUrl).slice(0, 1000) : null,
          estado: VALID_ESTADOS.includes(String(solicitudData.estado)) ? String(solicitudData.estado) : 'Pendiente',
          fecha: solicitudData.fecha || new Date().toISOString(),
          fechaRadicado: solicitudData.fechaRadicado || new Date().toISOString(),
          diasIncapacidad: solicitudData.diasIncapacidad ? (parseInt(solicitudData.diasIncapacidad, 10) || null) : null
        }];
      }
    }

    if (!solicitudes || solicitudes.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron registros de solicitudes laborales para enviar. Si acaba de radicar una solicitud, espere unos segundos e intente nuevamente.'
      });
    }

    let senderName = req.user?.nombre || req.user?.user || 'Talento Humano G-IBRO';
    try {
      if (req.user?.id) {
        const sender = await prisma.user.findUnique({
          where: { id: String(req.user.id) },
          select: { nombre: true, apellido: true, user: true }
        });
        if (sender) {
          senderName = `${sender.nombre || ''} ${sender.apellido || ''}`.trim() || sender.user || senderName;
        }
      }
    } catch (_) {}

    const filterLabel = hasIds
      ? (solicitudes.length === 1 ? 'Solicitud individual' : `Selección manual (${solicitudes.length})`)
      : (estado && estado !== 'Todas' ? `Estado: ${estado}` : 'Todas las solicitudes');

    const safeSubject = String(subject || '').trim().slice(0, 200);
    const safeMessage = String(customMessage || '').trim().slice(0, 2000);

    const result = await sendSolicitudesEmail({
      recipients: validRecipients,
      solicitudes,
      subject: safeSubject,
      customMessage: safeMessage,
      includeCsv: Boolean(includeCsv),
      senderName,
      filterLabel
    });

    if (!result.success && !result.mockMode) {
      return res.status(502).json({
        error: 'No se pudo entregar el correo a ningún destinatario. Verifique la configuración del servidor de correo.',
        failedRecipients: result.failedRecipients
      });
    }

    // Registrar auditoría (best-effort)
    try {
      if (req.user?.id) {
        await prisma.auditoria.create({
          data: {
            userId: String(req.user.id),
            action: 'Enviar Solicitudes por Correo',
            modulo: 'solicitudes',
            recordDetails: `Enviados ${solicitudes.length} registro(s) de solicitudes laborales a ${validRecipients.join(', ')}`
          }
        });
      }
    } catch (auditErr) {
      console.warn('[POST /api/solicitudes/enviar-correo] Error registrando auditoría:', auditErr.message);
    }

    const message = result.mockMode
      ? 'Correo procesado en modo de prueba (sin credenciales SMTP/Resend configuradas en el servidor).'
      : (result.failedRecipients.length > 0
          ? `Correo enviado a ${result.sentCount} de ${result.totalRecipients} destinatario(s).`
          : `Se enviaron ${solicitudes.length} registro(s) de solicitudes laborales a ${result.sentCount} destinatario(s).`);

    return res.json({
      success: true,
      message,
      count: solicitudes.length,
      sentCount: result.sentCount,
      totalRecipients: result.totalRecipients,
      failedRecipients: result.failedRecipients,
      mockMode: Boolean(result.mockMode)
    });
  } catch (err) {
    console.error('[POST /api/solicitudes/enviar-correo Error]:', err);
    return res.status(500).json({ error: err.message || 'Error interno enviando las solicitudes por correo.' });
  }
});

module.exports = router;
