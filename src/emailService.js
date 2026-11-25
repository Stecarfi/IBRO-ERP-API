const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Crear el transportador utilizando variables de entorno
const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    connectionTimeout: 5000, // 5 segundos
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
};

async function sendRecoveryEmail(email, name, resetLink) {
  const subject = 'Restablecer Contraseña - C-ERP SaaS';
  const html = `
    <div style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; font-size: 12px; padding: 25px; color: #333; max-width: 600px; margin: auto; border: 1px solid #e4e4e7; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <style>@import url('https://fonts.googleapis.com/css2?family=Alice&display=swap');</style>
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #F87171; padding-bottom: 15px;">
        <h2 style="font-family: 'Alice', Georgia, serif; color: #002060; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">C-ERP SaaS</h2>
        <p style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; color: #666; margin: 5px 0 0 0; font-size: 12px; font-weight: bold; text-transform: uppercase;">Portal Corporativo Cloud</p>
      </div>
      <h3 style="font-family: 'Alice', Georgia, serif; color: #1f2937; font-size: 20px;">Hola ${name},</h3>
      <p style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; line-height: 1.6; font-size: 12px; color: #4b5563;">Has solicitado restablecer tu contraseña para acceder a la plataforma corporativa C-ERP SaaS.</p>
      <p style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; line-height: 1.6; font-size: 12px; color: #4b5563;">Haz clic en el siguiente botón para cambiar tu contraseña de forma segura:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${resetLink}" style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; background-color: #002060; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 12px; display: inline-block; box-shadow: 0 4px 8px rgba(0, 32, 96, 0.25);">Restablecer Contraseña</a>
      </div>
      <p style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; line-height: 1.6; font-size: 12px; color: #4b5563;">O copia y pega el siguiente enlace en tu navegador:</p>
      <div style="background-color: #f3f4f6; padding: 12px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 11px; color: #002060; border: 1px solid #e5e7eb;">
        <a href="${resetLink}" style="color: #002060; text-decoration: none; font-weight: bold;">${resetLink}</a>
      </div>
      <p style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; line-height: 1.6; font-size: 12px; color: #F87171; font-weight: bold; margin-top: 20px;">⏰ Este enlace de seguridad expirará en 1 hora.</p>
      <div style="font-family: Tahoma, Verdana, Segoe UI, sans-serif; font-size: 12px; text-align: center; color: #71717a; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5;">
        <strong>C-ERP SaaS - Plataforma Cloud Empresarial</strong><br>
        Este es un correo automatizado del sistema, por favor no lo respondas de forma directa.
      </div>
    </div>
  `;

  // 1. SMTP local / estándar
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (smtpUser && smtpPass) {
    console.log(`[EMAIL SERVICE] Intentando enviar correo vía SMTP desde "${smtpUser}" hacia "${email}"...`);
    const mailOptions = {
      from: `"Soporte C-ERP" <${smtpUser}>`,
      to: email,
      subject,
      html,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Correo enviado con éxito vía SMTP hacia: ${email}`);
    return { sent: true };
  }

  // 2. HTTP API: Resend (SDK)
  if (process.env.RESEND_API_KEY) {
    console.log(`[EMAIL SERVICE] Enviando correo vía Resend SDK hacia "${email}"...`);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Soporte C-ERP <onboarding@resend.dev>';
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error(`[EMAIL SERVICE] Resend SDK Error:`, error);
      throw new Error(`Resend SDK Error: ${error.message}`);
    }

    console.log(`[EMAIL SERVICE] Correo enviado exitosamente con Resend:`, data);
    return { sent: true };
  }

  // 3. HTTP API: Brevo
  if (process.env.BREVO_API_KEY) {
    console.log(`[EMAIL SERVICE] Enviando correo vía Brevo API hacia "${email}"...`);
    const fromEmail = process.env.EMAIL_FROM || 'soporte-no-reply@c-erp.com';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Soporte C-ERP', email: fromEmail },
        to: [{ email, name }],
        subject,
        htmlContent: html
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Brevo API Error: ${response.status} - ${errText}`);
    }
    console.log(`[EMAIL SERVICE] Correo enviado exitosamente con Brevo.`);
    return { sent: true };
  }

  // Seguridad: el enlace (contiene el código de restablecimiento) solo se imprime fuera de producción
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL SERVICE MOCK] No email credentials configured. Link: ${resetLink}`);
  } else {
    console.warn('[EMAIL SERVICE MOCK] No hay credenciales de correo configuradas: no se pudo enviar el correo de recuperación.');
  }
  return { sent: false, mockMode: true };
}

async function verifySmtpConnection() {
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (smtpUser && smtpPass) {
    console.log(`[SMTP TEST] Verificando conexión SMTP para ${smtpUser}...`);
    const transporter = getTransporter();
    try {
      await transporter.verify();
      console.log('[SMTP TEST SUCCESS] Conexión SMTP establecida correctamente.');
      return;
    } catch (error) {
      console.error('[SMTP TEST ERROR] Falló la conexión SMTP en el arranque:', error.message);
    }
  }

  if (process.env.RESEND_API_KEY) {
    console.log('[SMTP TEST] Usando servicio Resend HTTP API (No requiere verificación SMTP).');
    return;
  }
  if (process.env.BREVO_API_KEY) {
    console.log('[SMTP TEST] Usando servicio Brevo HTTP API (No requiere verificación SMTP).');
    return;
  }

  if (!smtpUser || !smtpPass) {
    console.warn('[SMTP TEST] SMTP credentials not set in .env. Email service will run in MOCK mode.');
  }
}

async function sendLockoutEmail(email, name, unlockLink) {
  const subject = 'Alerta de Seguridad: Cuenta Bloqueada - C-ERP SaaS';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 25px; color: #333; max-width: 600px; margin: auto; border: 1px solid #F87171; border-radius: 12px; box-shadow: 0 4px 12px rgba(248,113,113,0.15);">
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #F87171; padding-bottom: 15px;">
        <h2 style="color: #F87171; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px;">C-ERP SaaS - SEGURIDAD</h2>
      </div>
      <h3 style="color: #1f2937; font-size: 16px;">Hola ${name},</h3>
      <p style="line-height: 1.6; font-size: 14px; color: #4b5563;">Tu cuenta ha sido bloqueada temporalmente tras detectar <strong>3 intentos fallidos de inicio de sesión</strong> consecutivos.</p>
      <p style="line-height: 1.6; font-size: 14px; color: #4b5563;">Si fuiste tú y olvidaste tu contraseña, o si deseas desbloquear la cuenta, haz clic en el siguiente botón:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${unlockLink}" style="background-color: #F87171; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 8px rgba(248, 113, 113, 0.25);">Desbloquear y Restablecer Contraseña</a>
      </div>
      <div style="background-color: #f3f4f6; padding: 12px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 11px; color: #F87171; border: 1px solid #e5e7eb;">
        <a href="${unlockLink}" style="color: #F87171; text-decoration: none; font-weight: bold;">${unlockLink}</a>
      </div>
      <div style="font-size: 10px; text-align: center; color: #71717a; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5;">
        <strong>C-ERP SaaS - Seguridad & IT</strong>
      </div>
    </div>
  `;

  // 1. SMTP Local
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (smtpUser && smtpPass) {
    try {
      const mailOptions = {
        from: `"Seguridad C-ERP" <${smtpUser}>`,
        to: email,
        subject,
        html,
      };
      const transporter = getTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`[EMAIL SERVICE] Correo de bloqueo enviado a: ${email}`);
      return { sent: true };
    } catch (error) {
      console.error(`[EMAIL SERVICE] Error inesperado enviando correo de bloqueo a ${email}:`, error);
    }
  }

  // 2. HTTP API: Resend (SDK)
  if (process.env.RESEND_API_KEY) {
    console.log(`[EMAIL SERVICE] Enviando correo de bloqueo vía Resend SDK hacia "${email}"...`);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Seguridad C-ERP <onboarding@resend.dev>';
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error(`[EMAIL SERVICE] Resend SDK Error en bloqueo:`, error);
    } else {
      console.log(`[EMAIL SERVICE] Correo de bloqueo enviado exitosamente con Resend:`, data);
      return { sent: true };
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL SERVICE MOCK] Lockout Email to ${email}. Link: ${unlockLink}`);
  } else {
    console.warn('[EMAIL SERVICE MOCK] No hay credenciales de correo configuradas: no se pudo enviar el correo de bloqueo.');
  }
  return { sent: false, mockMode: true };
}

function formatColombiaDateTime(date, timeZone = 'America/Bogota') {
  if (!date) return 'Sin registros previos';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Fecha inválida';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d) + ' (COT / UTC-5)';
}

function formatColombiaTime(date, timeZone = 'America/Bogota') {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

function formatTimeAgo(date, now = new Date()) {
  if (!date) return 'Nunca ha ingresado';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Fecha inválida';
  
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 'Hace unos momentos';
  
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'Hace menos de 1 min';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHours < 24) {
    const remMin = diffMin % 60;
    return `Hace ${diffHours}h ${remMin > 0 ? remMin + 'm' : ''}`.trim();
  }
  const remHours = diffHours % 24;
  return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''} ${remHours > 0 ? 'y ' + remHours + 'h' : ''}`.trim();
}

async function sendDailyLoginReportEmail(optsOrEmails, activeUsersArg, inactiveUsersArg, dateStrArg, reportNameArg = "Corte Diario") {
  let adminEmails = [];
  let onlineUsers = [];
  let activeTodayUsers = [];
  let inactiveUsers = [];
  let dateStr = "";
  let reportName = "Corte Diario";
  let timeZone = "America/Bogota";
  let metaInfo = {};

  if (Array.isArray(optsOrEmails)) {
    adminEmails = optsOrEmails;
    activeTodayUsers = Array.isArray(activeUsersArg) ? activeUsersArg : [];
    inactiveUsers = Array.isArray(inactiveUsersArg) ? inactiveUsersArg : [];
    dateStr = dateStrArg || new Date().toLocaleDateString('es-CO');
    reportName = reportNameArg;
  } else if (typeof optsOrEmails === 'object' && optsOrEmails !== null) {
    adminEmails = optsOrEmails.adminEmails || [];
    onlineUsers = optsOrEmails.onlineUsers || [];
    activeTodayUsers = optsOrEmails.activeTodayUsers || optsOrEmails.activeUsers || [];
    inactiveUsers = optsOrEmails.inactiveUsers || [];
    dateStr = optsOrEmails.dateStr || new Date().toLocaleDateString('es-CO');
    reportName = optsOrEmails.reportName || "Corte Diario";
    timeZone = optsOrEmails.timeZone || "America/Bogota";
    metaInfo = optsOrEmails.metaInfo || {};
  }

  const now = new Date();
  const horaCorteColombia = formatColombiaDateTime(now, timeZone);
  const horaCorteUTC = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  // Clasificar inactivos entre pendientes recientes (<3 días) y prolongados (>=3 días o nunca)
  const tresDiasMs = 3 * 24 * 3600 * 1000;
  const inactivosPendientes = [];
  const inactivosProlongados = [];

  inactiveUsers.forEach(u => {
    const lastDate = u.ultimoAccesoHistorico || u.lastLogin ? new Date(u.ultimoAccesoHistorico || u.lastLogin) : null;
    if (!lastDate || isNaN(lastDate.getTime()) || (now.getTime() - lastDate.getTime()) >= tresDiasMs) {
      inactivosProlongados.push(u);
    } else {
      inactivosPendientes.push(u);
    }
  });

  const subject = `📊 Auditoría de Sesiones y Presencia (${reportName}) - ${dateStr}`;

  // 1. Filas Usuarios en Línea
  let onlineRowsHtml = '';
  if (onlineUsers.length === 0) {
    onlineRowsHtml = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #6b7280; font-style: italic;">No hay colaboradores con actividad verificada en los últimos 5 minutos.</td></tr>`;
  } else {
    onlineRowsHtml = onlineUsers.map((u, idx) => {
      const horaIngreso = u.primerIngreso ? formatColombiaTime(u.primerIngreso, timeZone) : 'Hoy';
      const ultActividad = u.ultimoAccesoHoy ? formatColombiaTime(u.ultimoAccesoHoy, timeZone) : 'Reciente';
      const ev = u.evidencia || {};
      const eventoDesc = ev.ultimoEventoDesc ? (ev.ultimoEventoDesc.length > 35 ? ev.ultimoEventoDesc.substring(0, 32) + '...' : ev.ultimoEventoDesc) : (ev.ultimoEventoTipo || 'Interacción');
      const moduloStr = ev.ultimoEventoModulo || 'Sistema';
      const dispInfo = `${ev.dispositivo || 'Desktop'} · ${ev.ip || 'IP'}`;

      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-weight: 600; color: #111827;">
            ${u.nombre}
            <div style="font-size: 11px; color: #6b7280; font-weight: normal;">@${u.user} · ${u.cargo || 'Colaborador'}</div>
          </td>
          <td style="padding: 10px 12px; color: #374151; font-size: 12px;">${u.correo || 'Sin correo'}</td>
          <td style="padding: 10px 12px; color: #047857; font-size: 12px; font-weight: 600;">${horaIngreso}</td>
          <td style="padding: 10px 12px; color: #1f2937; font-size: 12px;">
            <div style="font-weight: 700; color: #111827;">${ultActividad}</div>
            <div style="font-size: 10px; color: #059669; font-weight: 600;">Hace ${u.minutesSinceLast !== null ? u.minutesSinceLast : 0} min</div>
          </td>
          <td style="padding: 10px 12px; font-size: 11px; color: #4b5563;">
            <div style="font-weight: 700; color: #1e3a8a;">📁 ${moduloStr}: <span style="font-weight: normal; color: #374151;">${eventoDesc}</span></div>
            <div style="font-size: 10px; color: #6b7280;">💻 ${dispInfo}</div>
          </td>
          <td style="padding: 10px 12px; text-align: center;">
            <span style="display: inline-block; background-color: #d1fae5; color: #065f46; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 9999px;">
              🟢 EN LÍNEA
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 2. Filas Usuarios Activos Hoy (Desconectados)
  let activeTodayRowsHtml = '';
  if (activeTodayUsers.length === 0) {
    activeTodayRowsHtml = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #6b7280; font-style: italic;">No hay colaboradores desconectados con actividad previa registrada hoy.</td></tr>`;
  } else {
    activeTodayRowsHtml = activeTodayUsers.map((u, idx) => {
      const horaIngreso = u.primerIngreso ? formatColombiaTime(u.primerIngreso, timeZone) : 'Hoy';
      const ultActividad = u.ultimoAccesoHoy ? formatColombiaTime(u.ultimoAccesoHoy, timeZone) : 'Hoy';
      const tiempoOff = u.ultimoAccesoHoy ? formatTimeAgo(u.ultimoAccesoHoy, now) : 'Hace poco';
      const ev = u.evidencia || {};
      const eventoDesc = ev.ultimoEventoDesc ? (ev.ultimoEventoDesc.length > 35 ? ev.ultimoEventoDesc.substring(0, 32) + '...' : ev.ultimoEventoDesc) : (ev.ultimoEventoTipo || 'Interacción');
      const moduloStr = ev.ultimoEventoModulo || 'Sistema';

      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-weight: 600; color: #111827;">
            ${u.nombre}
            <div style="font-size: 11px; color: #6b7280; font-weight: normal;">@${u.user} · ${u.cargo || 'Colaborador'}</div>
          </td>
          <td style="padding: 10px 12px; color: #374151; font-size: 12px;">${u.correo || 'Sin correo'}</td>
          <td style="padding: 10px 12px; color: #1e40af; font-size: 12px; font-weight: 600;">${horaIngreso}</td>
          <td style="padding: 10px 12px; color: #1f2937; font-size: 12px;">${ultActividad}</td>
          <td style="padding: 10px 12px; font-size: 11px; color: #4b5563;">
            <div style="font-weight: 600; color: #475569;">📁 ${moduloStr}: ${eventoDesc}</div>
            <div style="font-size: 10px; color: #94a3b8;">${ev.dispositivo || 'Desktop'} · ${ev.ip || 'IP'}</div>
          </td>
          <td style="padding: 10px 12px; text-align: center;">
            <span style="display: inline-block; background-color: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 9999px;">
              ⏱️ ${tiempoOff}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 3. Filas Usuarios Inactivos
  let inactiveRowsHtml = '';
  if (inactiveUsers.length === 0) {
    inactiveRowsHtml = `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #047857; font-weight: 600;">¡Excelente! El 100% de los colaboradores habilitados ingresaron o están activos hoy.</td></tr>`;
  } else {
    inactiveRowsHtml = inactiveUsers.map((u, idx) => {
      const lastAcc = u.ultimoAccesoHistorico || u.lastLogin;
      const ultAccesoStr = lastAcc ? formatColombiaDateTime(lastAcc, timeZone) : 'Sin historial';
      const tiempoSinEntrar = formatTimeAgo(lastAcc, now);
      const esProlongado = !lastAcc || (now.getTime() - new Date(lastAcc).getTime()) >= tresDiasMs;
      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fef2f2'}; border-bottom: 1px solid #fee2e2;">
          <td style="padding: 10px 12px; font-weight: 600; color: #111827;">
            ${u.nombre}
            <div style="font-size: 11px; color: #6b7280; font-weight: normal;">@${u.user} · ${u.cargo || 'Colaborador'}</div>
          </td>
          <td style="padding: 10px 12px; color: #374151; font-size: 12px;">${u.correo || 'Sin correo'}</td>
          <td style="padding: 10px 12px; color: #4b5563; font-size: 12px;">${ultAccesoStr}</td>
          <td style="padding: 10px 12px; font-weight: 600; color: ${esProlongado ? '#dc2626' : '#b45309'}; font-size: 12px;">${tiempoSinEntrar}</td>
          <td style="padding: 10px 12px; text-align: center;">
            <span style="display: inline-block; background-color: ${esProlongado ? '#fee2e2' : '#fef3c7'}; color: ${esProlongado ? '#991b1b' : '#92400e'}; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 9999px;">
              ${esProlongado ? '🔴 PROLONGADA' : '⚠️ PENDIENTE HOY'}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
      <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
        
        <!-- HEADER -->
        <div style="background: linear-gradient(135deg, #002060 0%, #1e3a8a 100%); color: #ffffff; padding: 25px 30px; text-align: left;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td>
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">CONTROL GERENCIAL · AUDITORÍA DE SESIONES</h1>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #bfdbfe;">Reporte Oficial de Presencia e Inicios de Sesión</p>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <span style="background-color: rgba(255, 255, 255, 0.2); padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: bold; letter-spacing: 0.5px;">
                  ${reportName.toUpperCase()}
                </span>
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.15); font-size: 12px; color: #e0e7ff; display: flex; justify-content: space-between;">
            <div>📅 <strong>Fecha:</strong> ${dateStr}</div>
            <div>⏰ <strong>Corte:</strong> ${horaCorteColombia}</div>
            <div>🌐 <strong>Ref Universal:</strong> ${horaCorteUTC}</div>
          </div>
        </div>

        <div style="padding: 25px 30px;">
          
          <!-- RESUMEN EJECUTIVO (KPIs) -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 25px;">
            <tr>
              <td style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                <div style="font-size: 26px; font-weight: 800; color: #065f46;">${onlineUsers.length}</div>
                <div style="font-size: 11px; font-weight: bold; color: #047857; text-transform: uppercase;">🟢 En Línea Ahora</div>
              </td>
              <td style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                <div style="font-size: 26px; font-weight: 800; color: #1e40af;">${activeTodayUsers.length}</div>
                <div style="font-size: 11px; font-weight: bold; color: #1d4ed8; text-transform: uppercase;">✅ Activos Hoy (Off)</div>
              </td>
              <td style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                <div style="font-size: 26px; font-weight: 800; color: #92400e;">${inactivosPendientes.length}</div>
                <div style="font-size: 11px; font-weight: bold; color: #b45309; text-transform: uppercase;">⚠️ Pendientes Hoy</div>
              </td>
              <td style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                <div style="font-size: 26px; font-weight: 800; color: #991b1b;">${inactivosProlongados.length}</div>
                <div style="font-size: 11px; font-weight: bold; color: #b91c1c; text-transform: uppercase;">🔴 Sin Acceso >3 Días</div>
              </td>
            </tr>
          </table>

          <!-- SECCIÓN 1: USUARIOS EN LÍNEA -->
          <div style="margin-bottom: 25px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <h2 style="margin: 0; font-size: 15px; font-weight: 700; color: #065f46; letter-spacing: -0.2px;">
                🟢 1. Colaboradores Conectados en Tiempo Real (${onlineUsers.length})
              </h2>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f3f4f6; color: #4b5563; text-transform: uppercase; font-size: 10px; font-weight: 700; text-align: left; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 8px 12px;">Colaborador</th>
                  <th style="padding: 8px 12px;">Correo</th>
                  <th style="padding: 8px 12px;">Primer Ingreso</th>
                  <th style="padding: 8px 12px;">Última Actividad Real</th>
                  <th style="padding: 8px 12px;">Evidencia Frontend</th>
                  <th style="padding: 8px 12px; text-align: center;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${onlineRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- SECCIÓN 2: ACTIVOS EN JORNADA (FUERA DE LÍNEA) -->
          <div style="margin-bottom: 25px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <h2 style="margin: 0; font-size: 15px; font-weight: 700; color: #1e40af; letter-spacing: -0.2px;">
                ✅ 2. Colaboradores con Actividad Hoy en Jornada (${activeTodayUsers.length})
              </h2>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f3f4f6; color: #4b5563; text-transform: uppercase; font-size: 10px; font-weight: 700; text-align: left; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 8px 12px;">Colaborador</th>
                  <th style="padding: 8px 12px;">Correo</th>
                  <th style="padding: 8px 12px;">Primer Ingreso</th>
                  <th style="padding: 8px 12px;">Último Registro</th>
                  <th style="padding: 8px 12px;">Evidencia Frontend</th>
                  <th style="padding: 8px 12px; text-align: center;">Desconectado</th>
                </tr>
              </thead>
              <tbody>
                ${activeTodayRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- SECCIÓN 3: NO HAN INGRESADO HOY -->
          <div style="margin-bottom: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <h2 style="margin: 0; font-size: 15px; font-weight: 700; color: #991b1b; letter-spacing: -0.2px;">
                ⚠️ 3. Colaboradores que NO Han Ingresado Hoy (${inactiveUsers.length})
              </h2>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #fee2e2; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #fef2f2; color: #991b1b; text-transform: uppercase; font-size: 10px; font-weight: 700; text-align: left; border-bottom: 2px solid #fecaca;">
                  <th style="padding: 8px 12px;">Colaborador</th>
                  <th style="padding: 8px 12px;">Correo</th>
                  <th style="padding: 8px 12px;">Último Acceso Real</th>
                  <th style="padding: 8px 12px;">Tiempo Sin Ingresar</th>
                  <th style="padding: 8px 12px; text-align: center;">Criticidad</th>
                </tr>
              </thead>
              <tbody>
                ${inactiveRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- FOOTER / NOTA DE AUDITORÍA -->
          <div style="margin-top: 30px; padding: 15px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5;">
            <p style="margin: 0 0 6px 0;"><strong>ℹ️ Nota de Trazabilidad Técnica:</strong></p>
            <p style="margin: 0;">Este reporte evalúa conexiones Socket.IO activas, inicios de sesión verificados mediante JWT, jornadas laborales en campo, telemetría y registros inmutables de auditoría. Los horarios están computados con base en la <strong>Hora Legal de Colombia (UTC-5)</strong> y correlacionados con la <strong>Hora Universal Coordinada (UTC)</strong> para garantizar fidelidad absoluta frente al uso del sistema.</p>
          </div>

        </div>

        <div style="background-color: #f9fafb; padding: 15px 30px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">
          IBRO ERP SaaS · Sistema Integral de Gestión Empresarial y Operaciones en Campo
        </div>

      </div>
    </body>
    </html>
  `;

  let sentCount = 0;
  for (const email of adminEmails) {
    if (!email) continue;
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';

    try {
      if (smtpUser && smtpPass) {
        const mailOptions = {
          from: `"Control Gerencial IBRO" <${smtpUser}>`,
          to: email,
          subject,
          html,
        };
        const transporter = getTransporter();
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SERVICE] Reporte de auditoría de sesiones enviado exitosamente vía SMTP a: ${email}`);
        sentCount++;
      } else if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'Control Gerencial <onboarding@resend.dev>',
          to: [email],
          subject: subject,
          html: html,
        });
        console.log(`[EMAIL SERVICE] Reporte de auditoría enviado con Resend a: ${email}`);
        sentCount++;
      } else {
        console.log(`[EMAIL SERVICE MOCK] Reporte generado para ${email} (sin credenciales SMTP configuradas).`);
      }
    } catch (e) {
      console.error(`[EMAIL SERVICE] Error enviando reporte de sesiones a ${email}:`, e);
    }
  }

  return { success: true, sentCount, totalRecipients: adminEmails.length };
}

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSolicitudDate(dateVal) {
  if (!dateVal) return 'Sin fecha';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function csvCell(val) {
  const str = val === null || val === undefined ? '' : String(val);
  // Neutralizar fórmulas de Excel (CSV injection)
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function buildSolicitudesCsv(solicitudes = []) {
  const headers = [
    'ID',
    'Colaborador',
    'Usuario',
    'Correo Colaborador',
    'Cargo',
    'Tipo de Solicitud',
    'Días de Incapacidad',
    'Estado',
    'Fecha Radicado',
    'Fecha Requerida',
    'Justificación',
    'Resolución / Observaciones',
    'Evidencia'
  ];

  const rows = solicitudes.map((s) => {
    const colaborador = s.nombreAsesor || (s.asesor ? `${s.asesor.nombre || ''} ${s.asesor.apellido || ''}`.trim() : '') || s.asesorUser || 'Colaborador';
    const usuario = (s.asesor && s.asesor.user) || s.asesorUser || '';
    const correo = (s.asesor && s.asesor.correo) || '';
    const cargo = (s.asesor && s.asesor.cargo) || '';
    return [
      s.id || '',
      colaborador,
      usuario,
      correo,
      cargo,
      s.tipo || '',
      s.diasIncapacidad ? String(s.diasIncapacidad) : '',
      s.estado || '',
      s.fechaRadicado ? formatColombiaDateTime(s.fechaRadicado) : '',
      formatSolicitudDate(s.fecha),
      s.detalle || '',
      s.comentario || '',
      s.fileUrl || s.evidencia || ''
    ].map(csvCell).join(',');
  });

  return '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\r\n');
}

function getEstadoBadgeStyle(estado) {
  switch (estado) {
    case 'Aprobado':
      return { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0', label: 'APROBADO' };
    case 'Rechazado':
      return { bg: '#ffe4e6', color: '#9f1239', border: '#fecdd3', label: 'RECHAZADO' };
    case 'Pendiente':
      return { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa', label: 'PENDIENTE' };
    default:
      return { bg: '#e0f2fe', color: '#075985', border: '#bae6fd', label: String(estado || 'REGISTRADA').toUpperCase() };
  }
}

async function sendSolicitudesEmail({
  recipients = [],
  solicitudes = [],
  subject = '',
  customMessage = '',
  includeCsv = true,
  senderName = 'Talento Humano G-IBRO',
  filterLabel = 'Todas'
}) {
  const validRecipients = Array.from(new Set(
    (Array.isArray(recipients) ? recipients : [])
      .map(e => String(e || '').trim().toLowerCase())
      .filter(Boolean)
  ));

  if (validRecipients.length === 0) {
    throw new Error('Debe indicar al menos un correo destinatario válido.');
  }
  if (!Array.isArray(solicitudes) || solicitudes.length === 0) {
    throw new Error('No hay registros de solicitudes laborales para enviar.');
  }

  const now = new Date();
  const fechaGeneracion = formatColombiaDateTime(now);
  const dateSlug = now.toISOString().slice(0, 10);
  const isSingle = solicitudes.length === 1;

  const finalSubject = (subject && String(subject).trim()) || (
    isSingle
      ? `Registro de Solicitud Laboral: ${solicitudes[0].tipo || 'Laboral'} (${solicitudes[0].estado || 'Pendiente'}) - G-IBRO`
      : `Reporte de Solicitudes Laborales (${solicitudes.length} registros) - ${dateSlug} - G-IBRO`
  );

  const customNoteHtml = customMessage && String(customMessage).trim()
    ? `
      <div style="margin-bottom: 22px; padding: 14px 18px; background-color: #eff6ff; border-left: 4px solid #1E88FF; border-radius: 8px; color: #1e3a8a; font-size: 13px; line-height: 1.6;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #0A2F8F; margin-bottom: 4px;">Mensaje adjunto</div>
        <div style="white-space: pre-wrap;">${escapeHtml(customMessage.trim())}</div>
      </div>
    `
    : '';

  let bodyContentHtml = '';

  if (isSingle) {
    const s = solicitudes[0];
    const badge = getEstadoBadgeStyle(s.estado);
    const colaborador = s.nombreAsesor || (s.asesor ? `${s.asesor.nombre || ''} ${s.asesor.apellido || ''}`.trim() : '') || s.asesorUser || 'Colaborador';
    const cargo = (s.asesor && s.asesor.cargo) ? ` · ${s.asesor.cargo}` : '';
    const correoColab = (s.asesor && s.asesor.correo) || 'No registrado';
    const evidenciaHtml = s.fileUrl
      ? `<a href="${escapeHtml(s.fileUrl)}" style="color: #1E88FF; font-weight: 700; text-decoration: none;">📎 ${escapeHtml(s.evidencia || 'Ver soporte adjunto')}</a>`
      : (s.evidencia ? escapeHtml(s.evidencia) : '<span style="color: #9ca3af;">Sin adjunto</span>');

    bodyContentHtml = `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
        <div style="background-color: #f8fafc; padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; background-color: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.border}; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; letter-spacing: 0.5px;">
            ${escapeHtml(badge.label)}
          </span>
          <h2 style="margin: 10px 0 4px 0; font-size: 20px; color: #002060;">${escapeHtml(s.tipo || 'Solicitud Laboral')}</h2>
          <div style="font-size: 12px; color: #64748b;">Radicada el ${escapeHtml(s.fechaRadicado ? formatColombiaDateTime(s.fechaRadicado) : formatSolicitudDate(s.fecha))}</div>
        </div>
        <div style="padding: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 35%; font-weight: 700;">Colaborador:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${escapeHtml(colaborador)}${escapeHtml(cargo)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-weight: 700;">Correo del Colaborador:</td>
              <td style="padding: 8px 0; color: #334155;">${escapeHtml(correoColab)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-weight: 700;">Fecha Requerida / Uso:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${escapeHtml(formatSolicitudDate(s.fecha))}</td>
            </tr>
            ${s.diasIncapacidad ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-weight: 700;">Días de Incapacidad:</td>
              <td style="padding: 8px 0; color: #0A2F8F; font-weight: 800;">${escapeHtml(s.diasIncapacidad)} ${Number(s.diasIncapacidad) === 1 ? 'día' : 'días'}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-weight: 700;">Evidencia Documental:</td>
              <td style="padding: 8px 0; color: #334155;">${evidenciaHtml}</td>
            </tr>
          </table>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #475569; margin-bottom: 6px;">Justificación del Colaborador</div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; color: #1e293b; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(s.detalle || 'Sin detalle registrado.')}</div>
          </div>

          ${s.comentario ? `
            <div>
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #0A2F8F; margin-bottom: 6px;">Resolución / Observaciones de Talento Humano</div>
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; color: #14532d; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(s.comentario)}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  } else {
    const total = solicitudes.length;
    const pendientes = solicitudes.filter(s => s.estado === 'Pendiente').length;
    const aprobadas = solicitudes.filter(s => s.estado === 'Aprobado').length;
    const rechazadas = solicitudes.filter(s => s.estado === 'Rechazado').length;

    const rowsHtml = solicitudes.map((s, idx) => {
      const badge = getEstadoBadgeStyle(s.estado);
      const colaborador = s.nombreAsesor || (s.asesor ? `${s.asesor.nombre || ''} ${s.asesor.apellido || ''}`.trim() : '') || s.asesorUser || 'Colaborador';
      const detalleShort = s.detalle && s.detalle.length > 140 ? `${s.detalle.slice(0, 137)}...` : (s.detalle || '—');
      const obsShort = s.comentario && s.comentario.length > 120 ? `${s.comentario.slice(0, 117)}...` : (s.comentario || '—');
      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 10px; font-weight: 700; color: #0f172a; font-size: 12px;">
            ${escapeHtml(colaborador)}
            ${s.asesor && s.asesor.correo ? `<div style="font-size: 10px; font-weight: normal; color: #64748b;">${escapeHtml(s.asesor.correo)}</div>` : ''}
          </td>
          <td style="padding: 10px 10px; color: #002060; font-weight: 700; font-size: 12px;">
            ${escapeHtml(s.tipo || '')}
            ${s.diasIncapacidad ? `<div style="font-size: 10px; font-weight: 700; color: #6C4DFF;">${escapeHtml(s.diasIncapacidad)} ${Number(s.diasIncapacidad) === 1 ? 'día' : 'días'}</div>` : ''}
          </td>
          <td style="padding: 10px 10px; color: #334155; font-size: 11px; white-space: nowrap;">
            <div><strong>Uso:</strong> ${escapeHtml(formatSolicitudDate(s.fecha))}</div>
            <div style="color: #64748b;"><strong>Rad:</strong> ${escapeHtml(formatSolicitudDate(s.fechaRadicado || s.fecha))}</div>
          </td>
          <td style="padding: 10px 10px; text-align: center;">
            <span style="display: inline-block; background-color: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.border}; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px;">
              ${escapeHtml(badge.label)}
            </span>
          </td>
          <td style="padding: 10px 10px; color: #334155; font-size: 11px; line-height: 1.4;">${escapeHtml(detalleShort)}</td>
          <td style="padding: 10px 10px; color: #475569; font-size: 11px; line-height: 1.4;">${escapeHtml(obsShort)}</td>
        </tr>
      `;
    }).join('');

    bodyContentHtml = `
      <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;">
        <tr>
          <td style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
            <div style="font-size: 22px; font-weight: 800; color: #0A2F8F;">${total}</div>
            <div style="font-size: 10px; font-weight: 700; color: #1e40af; text-transform: uppercase;">Total</div>
          </td>
          <td style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
            <div style="font-size: 22px; font-weight: 800; color: #9a3412;">${pendientes}</div>
            <div style="font-size: 10px; font-weight: 700; color: #c2410c; text-transform: uppercase;">Pendientes</div>
          </td>
          <td style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
            <div style="font-size: 22px; font-weight: 800; color: #065f46;">${aprobadas}</div>
            <div style="font-size: 10px; font-weight: 700; color: #047857; text-transform: uppercase;">Aprobadas</div>
          </td>
          <td style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
            <div style="font-size: 22px; font-weight: 800; color: #9f1239;">${rechazadas}</div>
            <div style="font-size: 10px; font-weight: 700; color: #be123c; text-transform: uppercase;">Rechazadas</div>
          </td>
        </tr>
      </table>

      <div style="margin-bottom: 10px; font-size: 12px; color: #475569;">
        <strong>Filtro aplicado:</strong> ${escapeHtml(filterLabel)} · <strong>Registros incluidos:</strong> ${total}
      </div>

      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #002060; color: #ffffff; text-transform: uppercase; font-size: 10px; font-weight: 700; text-align: left;">
            <th style="padding: 10px;">Colaborador</th>
            <th style="padding: 10px;">Tipo</th>
            <th style="padding: 10px;">Fechas</th>
            <th style="padding: 10px; text-align: center;">Estado</th>
            <th style="padding: 10px;">Justificación</th>
            <th style="padding: 10px;">Resolución</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(finalSubject)}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <div style="max-width: 820px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 32, 96, 0.08); border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #002060 0%, #0A2F8F 60%, #1E88FF 100%); color: #ffffff; padding: 24px 28px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">G-IBRO · SOLICITUDES LABORALES</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #dbeafe;">
            ${isSingle ? 'Registro Individual de Solicitud Laboral' : `Reporte Consolidado de Solicitudes Laborales (${solicitudes.length} registros)`}
          </p>
          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; color: #e0f2fe;">
            Enviado por: <strong>${escapeHtml(senderName)}</strong> · Fecha de envío: <strong>${escapeHtml(fechaGeneracion)}</strong>
          </div>
        </div>

        <div style="padding: 26px 28px;">
          ${customNoteHtml}
          ${bodyContentHtml}
          ${includeCsv ? `
            <div style="margin-top: 18px; padding: 12px 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #475569;">
              📎 Se adjunta el archivo <strong>solicitudes_laborales_${dateSlug}.csv</strong> (compatible con Microsoft Excel) con el detalle completo de los registros.
            </div>
          ` : ''}
        </div>

        <div style="background-color: #f8fafc; padding: 14px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          IBRO ERP SaaS · Talento Humano y Gestión de Colaboradores
        </div>
      </div>
    </body>
    </html>
  `;

  const csvFilename = `solicitudes_laborales_${dateSlug}.csv`;
  const csvBuffer = includeCsv ? Buffer.from(buildSolicitudesCsv(solicitudes), 'utf-8') : null;

  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasBrevo = Boolean(process.env.BREVO_API_KEY);

  if (!smtpUser && !hasResend && !hasBrevo) {
    console.warn(`[EMAIL SERVICE MOCK] Solicitudes (${solicitudes.length}) -> ${validRecipients.join(', ')} (sin credenciales de correo configuradas).`);
    return {
      success: true,
      sentCount: 0,
      failedRecipients: [],
      totalRecipients: validRecipients.length,
      mockMode: true
    };
  }

  let sentCount = 0;
  const failedRecipients = [];

  for (const email of validRecipients) {
    let delivered = false;
    let lastErr = null;

    if (smtpUser && smtpPass) {
      try {
        const transporter = getTransporter();
        const mailOptions = {
          from: `"Talento Humano G-IBRO" <${smtpUser}>`,
          to: email,
          subject: finalSubject,
          html,
          ...(csvBuffer ? { attachments: [{ filename: csvFilename, content: csvBuffer, contentType: 'text/csv; charset=utf-8' }] } : {})
        };
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SERVICE] Solicitudes laborales enviadas vía SMTP a: ${email}`);
        delivered = true;
      } catch (err) {
        lastErr = err;
        console.error(`[EMAIL SERVICE] Error SMTP enviando solicitudes a ${email}:`, err.message);
      }
    }

    if (!delivered && hasResend) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.EMAIL_FROM || 'Talento Humano G-IBRO <onboarding@resend.dev>';
        const payload = {
          from: fromEmail,
          to: [email],
          subject: finalSubject,
          html,
          ...(csvBuffer ? { attachments: [{ filename: csvFilename, content: csvBuffer }] } : {})
        };
        const { error } = await resend.emails.send(payload);
        if (error) throw new Error(error.message || 'Resend error');
        console.log(`[EMAIL SERVICE] Solicitudes laborales enviadas vía Resend a: ${email}`);
        delivered = true;
      } catch (err) {
        lastErr = err;
        console.error(`[EMAIL SERVICE] Error Resend enviando solicitudes a ${email}:`, err.message);
      }
    }

    if (!delivered && hasBrevo) {
      try {
        const fromEmail = process.env.EMAIL_FROM || 'talento-humano@ibrosas.com';
        const bodyPayload = {
          sender: { name: 'Talento Humano G-IBRO', email: fromEmail },
          to: [{ email }],
          subject: finalSubject,
          htmlContent: html,
          ...(csvBuffer ? { attachment: [{ name: csvFilename, content: csvBuffer.toString('base64') }] } : {})
        };
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bodyPayload)
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Brevo ${response.status}: ${errText}`);
        }
        console.log(`[EMAIL SERVICE] Solicitudes laborales enviadas vía Brevo a: ${email}`);
        delivered = true;
      } catch (err) {
        lastErr = err;
        console.error(`[EMAIL SERVICE] Error Brevo enviando solicitudes a ${email}:`, err.message);
      }
    }

    if (delivered) {
      sentCount++;
    } else {
      failedRecipients.push({ email, error: lastErr ? lastErr.message : 'No se pudo enviar el correo' });
    }
  }

  return {
    success: sentCount > 0,
    sentCount,
    failedRecipients,
    totalRecipients: validRecipients.length,
    mockMode: false
  };
}

async function sendNewSolicitudAlertEmail({
  recipients = [],
  solicitud,
  colaboradorName = 'Un colaborador'
}) {
  if (!solicitud) return { success: false, sentCount: 0, totalRecipients: 0 };
  const validRecipients = Array.from(new Set(
    (Array.isArray(recipients) ? recipients : [])
      .map(e => String(e || '').trim().toLowerCase())
      .filter(e => e && e.includes('@'))
  ));
  if (validRecipients.length === 0) {
    return { success: false, sentCount: 0, totalRecipients: 0 };
  }

  const tipo = solicitud.tipo || 'Solicitud Laboral';
  const diasText = solicitud.diasIncapacidad ? ` (${solicitud.diasIncapacidad} ${Number(solicitud.diasIncapacidad) === 1 ? 'día' : 'días'})` : '';
  const subject = `Nueva Solicitud Laboral por Atender: ${tipo}${diasText} - ${colaboradorName}`;
  const customMessage = `Hay una nueva solicitud laboral de ${colaboradorName} pendiente por atender.\n\nPor favor ingrese al aplicativo IBRO ERP → módulo Solicitudes Laborales para revisarla y dar respuesta.`;

  return sendSolicitudesEmail({
    recipients: validRecipients,
    solicitudes: [solicitud],
    subject,
    customMessage,
    includeCsv: false,
    senderName: 'IBRO ERP · Notificación Automática',
    filterLabel: 'Nueva solicitud por atender'
  });
}

module.exports = {
  sendRecoveryEmail,
  sendLockoutEmail,
  verifySmtpConnection,
  sendDailyLoginReportEmail,
  sendSolicitudesEmail,
  sendNewSolicitudAlertEmail,
  buildSolicitudesCsv,
  escapeHtml
};
