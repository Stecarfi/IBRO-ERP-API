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
  });
};

async function sendRecoveryEmail(email, name, resetLink) {
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  const mailOptions = {
    from: `"Soporte G-IBRO" <${smtpUser || 'soporte-no-reply@ibroerp.com'}>`,
    to: email,
    subject: 'Restablecer Contraseña - G-IBRO',
    html: `
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
    `,
  };

  // Validar si las credenciales de correo están configuradas
  if (smtpUser && smtpPass) {
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Recovery email sent successfully to ${email}`);
    return { sent: true };
  } else {
    console.log(`[EMAIL SERVICE MOCK] SMTP not configured. Outputting link to logs:\nLink: ${resetLink}`);
    return { sent: false, mockMode: true, resetLink };
  }
}

module.exports = {
  sendRecoveryEmail
};
