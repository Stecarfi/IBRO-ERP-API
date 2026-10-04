const express = require('express');
const router = express.Router();
const pushService = require('../services/pushNotification.service');

// Obtener clave pública VAPID para que el navegador/PWA se suscriba
router.get('/public-key', (req, res) => {
  res.json({ publicKey: pushService.getPublicKey() });
});

// Registrar o actualizar suscripción push del usuario
router.post('/subscribe', (req, res) => {
  const { subscription, userId, username, userAgent } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Suscripción inválida o incompleta' });
  }
  const ok = pushService.saveSubscription(userId, username, subscription, userAgent);
  res.json({ success: ok, message: 'Suscripción push registrada correctamente' });
});

// Cancelar suscripción
router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  pushService.removeSubscription(endpoint);
  res.json({ success: true, message: 'Suscripción push eliminada' });
});

// Prueba de notificación push
router.post('/test', async (req, res) => {
  const { username, title, body } = req.body;
  const count = await pushService.sendNotificationToUser(username, {
    title: title || 'IBRO ERP - Notificación Push',
    body: body || 'Prueba de mensajería en segundo plano activa.',
    icon: '/icons/icon-192.png',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    data: { url: '/?mod=chat' }
  });

  if (count === 0) {
    return res.status(404).json({
      success: false,
      deliveredTo: 0,
      message: `No hay dispositivos móviles ni navegadores registrados para el usuario '${username}'. Debes abrir el aplicativo en tu teléfono (vía HTTPS) y presionar 'Activar en mi Celular' primero.`
    });
  }

  res.json({ 
    success: true, 
    deliveredTo: count, 
    message: `Notificación push enviada con éxito a ${count} dispositivo(s) registrado(s).` 
  });
});

const prisma = require('../prisma');

// Endpoint para Periodic Background Sync: consultar novedades en segundo plano
router.get('/unread-summary', async (req, res) => {
  try {
    const username = (req.query.username || '').trim().toLowerCase();
    let unreadCount = 0;
    let latestMessage = null;

    if (username) {
      const dbUser = await prisma.user.findFirst({
        where: { user: { equals: username, mode: 'insensitive' } }
      });

      if (dbUser) {
        const notifCount = await prisma.notificacion.count({
          where: {
            paraId: dbUser.id,
            leida: false
          }
        });

        const unreadChats = await prisma.chat.count({
          where: {
            OR: [
              { receiverId: dbUser.id, readAt: null },
              { receiverId: null, senderTabId: null, readAt: null }
            ],
            senderId: { not: dbUser.id }
          }
        });

        unreadCount = notifCount + unreadChats;

        latestMessage = await prisma.chat.findFirst({
          where: {
            OR: [
              { receiverId: dbUser.id },
              { receiverId: null, senderTabId: null }
            ],
            senderId: { not: dbUser.id }
          },
          orderBy: { timestamp: 'desc' },
          select: { text: true, nombre: true }
        });
      }
    }

    res.json({
      success: true,
      unreadCount,
      latest: latestMessage ? `${latestMessage.nombre}: ${latestMessage.text}` : null
    });
  } catch (err) {
    res.json({ success: true, unreadCount: 0 });
  }
});

// Marcar mensaje como leído desde la notificación push (sin abrir la PWA)
router.post('/mark-read', async (req, res) => {
  try {
    const { messageId } = req.body;
    if (messageId) {
      await prisma.chat.updateMany({
        where: { id: messageId },
        data: { readAt: new Date() }
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
