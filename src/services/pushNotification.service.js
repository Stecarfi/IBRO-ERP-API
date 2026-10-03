const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

// Configuración VAPID para IBRO ERP
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BBTPzc_5DWtTh6KjQyeboDU-m1CPg8eSN2BymJ5_J75AWutqLVYX3ZqQkvkkZKyEjB0MunfsIBVw5tg8NP5_MfM";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "ezNB94zddPln8NhUWM_l_ni36JnfnDkKIaMZc-JIvpA";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:soporte@ibrosas.com";

webpush.setVapidDetails(
  VAPID_EMAIL,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');

// Asegurar directorio de datos
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

function loadSubscriptions() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    const content = fs.readFileSync(SUBS_FILE, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('[PushService] Error leyendo suscripciones:', err.message);
    return [];
  }
}

function saveSubscriptions(subs) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch (err) {
    console.error('[PushService] Error guardando suscripciones:', err.message);
  }
}

class PushNotificationService {
  getPublicKey() {
    return VAPID_PUBLIC_KEY;
  }

  saveSubscription(userId, username, subscription, userAgent = '') {
    if (!subscription || !subscription.endpoint) return false;
    const subs = loadSubscriptions();
    
    // Normalizar usuario
    const uName = (username || '').trim().toLowerCase();
    const uId = userId ? String(userId).trim() : '';

    // Filtrar duplicados por endpoint
    const existingIndex = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    const subRecord = {
      id: existingIndex >= 0 ? subs[existingIndex].id : 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      userId: uId,
      username: uName,
      subscription,
      userAgent: userAgent || 'mobile-browser',
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      subs[existingIndex] = subRecord;
    } else {
      subs.push(subRecord);
    }

    saveSubscriptions(subs);
    console.log(`[PushService] Suscripción registrada para usuario: ${uName || uId}`);
    return true;
  }

  removeSubscription(endpoint) {
    if (!endpoint) return;
    const subs = loadSubscriptions();
    const filtered = subs.filter(s => s.subscription && s.subscription.endpoint !== endpoint);
    if (filtered.length !== subs.length) {
      saveSubscriptions(filtered);
      console.log(`[PushService] Suscripción removida: ${endpoint.substring(0, 30)}...`);
    }
  }

  async sendToSubscription(subRecord, payload) {
    try {
      const stringifiedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      await webpush.sendNotification(subRecord.subscription, stringifiedPayload);
      return true;
    } catch (err) {
      // Si la suscripción expiró o ya no es válida (HTTP 410 Gone / 404 Not Found), removerla
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.warn(`[PushService] Suscripción caducada (${err.statusCode}). Limpiando...`);
        this.removeSubscription(subRecord.subscription.endpoint);
      } else {
        console.error('[PushService] Error enviando push:', err.message);
      }
      return false;
    }
  }

  async sendNotificationToUser(targetUsernameOrId, payload) {
    if (!targetUsernameOrId) return 0;
    const target = String(targetUsernameOrId).trim().toLowerCase();
    const subs = loadSubscriptions();
    const userSubs = subs.filter(s => 
      (s.username && s.username.toLowerCase() === target) ||
      (s.userId && String(s.userId).toLowerCase() === target)
    );

    if (userSubs.length === 0) return 0;

    let sentCount = 0;
    await Promise.all(userSubs.map(async (s) => {
      const ok = await this.sendToSubscription(s, payload);
      if (ok) sentCount++;
    }));

    return sentCount;
  }

  async sendNotificationToGroup(members, payload, excludeUsername = '') {
    if (!Array.isArray(members) || members.length === 0) return 0;
    const subs = loadSubscriptions();
    const exclude = String(excludeUsername || '').trim().toLowerCase();

    const targets = new Set(
      members.map(m => {
        const u = typeof m === 'string' ? m : (m.user || m.username || m.id || '');
        return String(u).trim().toLowerCase();
      }).filter(u => u && u !== exclude)
    );

    const groupSubs = subs.filter(s => 
      (s.username && targets.has(s.username.toLowerCase())) ||
      (s.userId && targets.has(String(s.userId).toLowerCase()))
    );

    let sentCount = 0;
    await Promise.all(groupSubs.map(async (s) => {
      const ok = await this.sendToSubscription(s, payload);
      if (ok) sentCount++;
    }));

    return sentCount;
  }

  async sendNotificationToAll(payload, excludeUsername = '') {
    const subs = loadSubscriptions();
    const exclude = String(excludeUsername || '').trim().toLowerCase();
    const targets = subs.filter(s => !exclude || s.username.toLowerCase() !== exclude);

    let sentCount = 0;
    await Promise.all(targets.map(async (s) => {
      const ok = await this.sendToSubscription(s, payload);
      if (ok) sentCount++;
    }));

    return sentCount;
  }
}

module.exports = new PushNotificationService();
