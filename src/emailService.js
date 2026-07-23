const nodemailer = require('nodemailer');

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
  const subject = 'Restablecer Contraseña - G-IBRO';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 25px; color: #333; max-width: 600px; margin: auto; border: 1px solid #e4e4e7; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ef4444; padding-bottom: 15px;">
        <h2 style="color: #002060; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px;">G-IBRO S.A.S.</h2>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 12px; font-weight: bold; text-transform: uppercase;">Portal Corporativo</p>
      </div>
      <h3 style="color: #1f2937; font-size: 16px;">Hola ${name},</h3>
      <p style="line-height: 1.6; font-size: 14px; color: #4b5563;">Has solicitado restablecer tu contraseña para acceder a la plataforma corporativa G-IBRO.</p>
      <p style="line-height: 1.6; font-size: 14px; color: #4b5563;">Haz clic en el siguiente botón para cambiar tu contraseña de forma segura:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${resetLink}" style="background-color: #002060; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 8px rgba(0, 32, 96, 0.25);">Restablecer Contraseña</a>
      </div>
      <p style="line-height: 1.6; font-size: 13px; color: #4b5563;">O copia y pega el siguiente enlace en tu navegador:</p>
      <div style="background-color: #f3f4f6; padding: 12px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 11px; color: #002060; border: 1px solid #e5e7eb;">
        <a href="${resetLink}" style="color: #002060; text-decoration: none; font-weight: bold;">${resetLink}</a>
      </div>
      <p style="line-height: 1.6; font-size: 12px; color: #ef4444; font-weight: bold; margin-top: 20px;"><i class="fa-solid fa-clock"></i> Este enlace de seguridad expirará en 1 hora.</p>
      <div style="font-size: 10px; text-align: center; color: #71717a; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5;">
        <strong>IBRO S.A.S. - Aire Acondicionado y Climatización</strong><br>
        Este es un correo automatizado del sistema, por favor no lo respondas de forma directa.
      </div>
    </div>
  `;

  // 1. HTTP API: Resend
  if (process.env.RESEND_API_KEY) {
    console.log(`[EMAIL SERVICE] Enviando correo vía Resend API hacia "${email}"...`);
    const from = process.env.EMAIL_FROM || 'Soporte G-IBRO <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        html
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend API Error: ${response.status} - ${errText}`);
    }
    console.log(`[EMAIL SERVICE] Correo enviado exitosamente con Resend.`);
    return { sent: true };
  }

  // 2. HTTP API: Brevo
  if (process.env.BREVO_API_KEY) {
    console.log(`[EMAIL SERVICE] Enviando correo vía Brevo API hacia "${email}"...`);
    const fromEmail = process.env.EMAIL_FROM || 'soporte-no-reply@ibroerp.com';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Soporte G-IBRO', email: fromEmail },
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

  // 3. SMTP local / estándar
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (smtpUser && smtpPass) {
    console.log(`[EMAIL SERVICE] Intentando enviar correo vía SMTP desde "${smtpUser}" hacia "${email}"...`);
    const mailOptions = {
      from: `"Soporte G-IBRO" <${smtpUser}>`,
      to: email,
      subject,
      html,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Correo enviado con éxito vía SMTP hacia: ${email}`);
    return { sent: true };
  }

  console.log(`[EMAIL SERVICE MOCK] No email credentials configured. Link: ${resetLink}`);
  return { sent: false, mockMode: true, resetLink };
}

async function verifySmtpConnection() {
  if (process.env.RESEND_API_KEY) {
    console.log('[SMTP TEST] Usando servicio Resend HTTP API (No requiere verificación SMTP).');
    return;
  }
  if (process.env.BREVO_API_KEY) {
    console.log('[SMTP TEST] Usando servicio Brevo HTTP API (No requiere verificación SMTP).');
    return;
  }

  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (!smtpUser || !smtpPass) {
    console.warn('[SMTP TEST] SMTP credentials not set in .env. Email service will run in MOCK mode.');
    return;
  }

  console.log(`[SMTP TEST] Verificando conexión SMTP para ${smtpUser}...`);
  const transporter = getTransporter();
  try {
    await transporter.verify();
    console.log('[SMTP TEST SUCCESS] Conexión SMTP establecida correctamente.');
  } catch (error) {
    console.error('[SMTP TEST ERROR] Falló la conexión SMTP en el arranque:', error.message);
  }
}

async function sendLockoutEmail(email, name, unlockLink) {
  const subject = 'Alerta de Seguridad: Cuenta Bloqueada - G-IBRO';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 25px; color: #333; max-width: 600px; margin: auto; border: 1px solid #ef4444; border-radius: 12px; box-shadow: 0 4px 12px rgba(239,68,68,0.15);">
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ef4444; padding-bottom: 15px;">
        <h2 style="color: #ef4444; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px;">G-IBRO S.A.S. - SEGURIDAD</h2>
      </div>
      <h3 style="color: #1f2937; font-size: 16px;">Hola ${name},</h3>
      <p style="line-height: 1.6; font-size: 14px; color: #4b5563;">Tu cuenta ha sido bloqueada temporalmente tras detectar <strong>3 intentos fallidos de inicio de sesión</strong> consecutivos.</p>
      <p style="line-height: 1.6; font-size: 14px; color: #4b5563;">Si fuiste tú y olvidaste tu contraseña, o si deseas desbloquear la cuenta, haz clic en el siguiente botón:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${unlockLink}" style="background-color: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 8px rgba(239, 68, 68, 0.25);">Desbloquear y Restablecer Contraseña</a>
      </div>
      <div style="background-color: #f3f4f6; padding: 12px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 11px; color: #ef4444; border: 1px solid #e5e7eb;">
        <a href="${unlockLink}" style="color: #ef4444; text-decoration: none; font-weight: bold;">${unlockLink}</a>
      </div>
      <div style="font-size: 10px; text-align: center; color: #71717a; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5;">
        <strong>IBRO S.A.S. - Departamento de IT</strong>
      </div>
    </div>
  `;

  // Intentamos con SMTP Local (El preferido según el backend actual)
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (smtpUser && smtpPass) {
    try {
      const mailOptions = {
        from: `"Seguridad G-IBRO" <${smtpUser}>`,
        to: email,
        subject,
        html,
      };
      const transporter = getTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`[EMAIL SERVICE] Correo de bloqueo enviado a: ${email}`);
      return { sent: true };
    } catch (err) {
      console.error(`[EMAIL SERVICE] Error enviando correo de bloqueo:`, err);
    }
  }

  console.log(`[EMAIL SERVICE MOCK] Lockout Email to ${email}. Link: ${unlockLink}`);
  return { sent: false, mockMode: true, unlockLink };
}

module.exports = {
  sendRecoveryEmail,
  sendLockoutEmail,
  verifySmtpConnection
};
