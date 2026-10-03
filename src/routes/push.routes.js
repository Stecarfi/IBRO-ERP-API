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
    icon: '/LOGO_IBRO_TRANSPARENTE.png',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    data: { url: '/?mod=chat' }
  });
  res.json({ success: true, deliveredTo: count });
});

module.exports = router;
