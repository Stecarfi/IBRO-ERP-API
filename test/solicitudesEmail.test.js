const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSolicitudesCsv,
  escapeHtml,
  sendSolicitudesEmail
} = require('../src/emailService');

test('escapeHtml escapes HTML special characters safely', () => {
  const input = '<script>alert("xss")</script> & \'test\'';
  const out = escapeHtml(input);
  assert.equal(out, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
});

test('buildSolicitudesCsv generates UTF-8 BOM CSV and neutralizes formula injection', () => {
  const csv = buildSolicitudesCsv([
    {
      id: 'sol_1',
      nombreAsesor: 'Juan Pérez',
      asesor: { user: 'jperez', correo: 'juan@empresa.com', cargo: 'Asesor' },
      tipo: 'Vacaciones Anuales',
      estado: 'Aprobado',
      fecha: '2026-12-01T00:00:00.000Z',
      fechaRadicado: '2026-11-25T12:00:00.000Z',
      detalle: '=SUM(A1:A2) solicitud normal',
      comentario: 'Aprobado por "Talento Humano"',
      evidencia: 'soporte.pdf',
      fileUrl: 'https://example.com/soporte.pdf'
    }
  ]);

  assert.ok(csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM for Excel');
  assert.ok(csv.includes('"Colaborador"'));
  assert.ok(csv.includes('"Juan Pérez"'));
  assert.ok(csv.includes('"\'=SUM(A1:A2) solicitud normal"'), 'Formula cells should be neutralized');
  assert.ok(csv.includes('"Aprobado por ""Talento Humano"""'), 'Quotes should be doubled');
});

test('sendSolicitudesEmail validates empty recipients and empty solicitudes', async () => {
  await assert.rejects(
    () => sendSolicitudesEmail({ recipients: [], solicitudes: [{ id: '1' }] }),
    /correo destinatario/i
  );
  await assert.rejects(
    () => sendSolicitudesEmail({ recipients: ['test@example.com'], solicitudes: [] }),
    /No hay registros/i
  );
});

test('sendSolicitudesEmail returns mockMode when no email credentials are set', async () => {
  const saved = {
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    BREVO_API_KEY: process.env.BREVO_API_KEY
  };
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.RESEND_API_KEY;
  delete process.env.BREVO_API_KEY;

  try {
    const res = await sendSolicitudesEmail({
      recipients: ['rrhh@empresa.com'],
      solicitudes: [
        {
          id: 'sol_2',
          nombreAsesor: 'Ana Gómez',
          tipo: 'Permiso de Salud',
          estado: 'Pendiente',
          fecha: '2026-11-26T00:00:00.000Z',
          detalle: 'Cita médica general'
        }
      ]
    });
    assert.equal(res.success, true);
    assert.equal(res.mockMode, true);
    assert.equal(res.totalRecipients, 1);
  } finally {
    Object.entries(saved).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
    });
  }
});
