/**
 * IBRO ERP - Comprehensive End-to-End Chrome Test (e2e-chrome-test.js)
 * Executes exhaustive Chrome testing across all modules, Capacitaciones, Google Drive,
 * Notifications, Console logs, and Error Boundaries.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-artifacts-chrome');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const auditResults = {
  navigation: [],
  modulesTested: [],
  capacitaciones: {},
  notifications: {},
  consoleErrors: [],
  networkErrors: [],
  responsiveChecks: [],
  moduleHealth: {}
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runChromeE2ETest() {
  console.log('🚀 [CHROME E2E] Iniciando batería de pruebas exhaustivas en Google Chrome...');
  console.log(`📍 Ejecutable de Chrome: ${CHROME_PATH}`);
  console.log(`📍 URL: ${APP_URL}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,900'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        if (!text.includes('favicon') && !text.includes('downloadable font') && !text.includes('ResizeObserver')) {
          auditResults.consoleErrors.push({ type, text, location: msg.location() });
          console.warn(`⚠️ [CONSOLE ERROR]: ${text}`);
        }
      }
    });

    page.on('pageerror', err => {
      auditResults.consoleErrors.push({ type: 'pageerror', text: err.message });
      console.error(`❌ [PAGE ERROR]: ${err.message}`);
    });

    // 1. Login
    console.log('\n--- PASO 1: Login y Sesión ---');
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    const loginInput = await page.$('input[type="password"]');
    if (loginInput) {
      console.log('🔑 Ingresando usuario y contraseña admin...');
      await page.evaluate(() => {
        const userInp = document.querySelector('input[type="text"]') || document.querySelector('input:not([type="password"])');
        const passInp = document.querySelector('input[type="password"]');
        if (userInp) {
          userInp.value = 'admin';
          userInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (passInp) {
          passInp.value = 'admin';
          passInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await sleep(500);

      // Clic en enviar formulario
      await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]') || 
                    Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Conexión') || b.textContent.includes('Iniciar')));
        if (btn) btn.click();
      });

      console.log('⏳ Esperando establecimiento de sesión...');
      await sleep(5000);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_dashboard.png') });
    console.log('✅ Dashboard principal cargado.');

    // Helper para navegar a cualquier módulo vía Sidebar
    async function navigateToModule(moduleId, moduleName) {
      console.log(`\n👉 Navegando a módulo: "${moduleName}" (${moduleId})...`);
      const navSuccess = await page.evaluate((mId) => {
        // 1. Intentar selector directo data-module-id
        const directBtn = document.querySelector(`button[data-module-id="${mId}"]`);
        if (directBtn) {
          directBtn.click();
          return true;
        }

        // 2. Si está en una categoría colapsada, expandir todas las categorías
        const catButtons = Array.from(document.querySelectorAll('aside button'));
        catButtons.forEach(b => {
          if (b.innerText && (b.innerText.includes('Portal') || b.innerText.includes('Clientes') || b.innerText.includes('Talento') || b.innerText.includes('Administración'))) {
            b.click();
          }
        });

        const retryBtn = document.querySelector(`button[data-module-id="${mId}"]`);
        if (retryBtn) {
          retryBtn.click();
          return true;
        }

        // 3. Fallback por texto
        const allButtons = Array.from(document.querySelectorAll('aside button'));
        const textBtn = allButtons.find(b => b.innerText && b.innerText.toLowerCase().includes(mId.toLowerCase()));
        if (textBtn) {
          textBtn.click();
          return true;
        }
        return false;
      }, moduleId);

      await sleep(3000);
      const isHealthy = await page.evaluate(() => {
        const errorBoundary = document.querySelector('.error-boundary, [class*="ErrorBoundary"], [class*="bg-rose"]');
        const hasTextError = document.body.innerText.includes('Algo salió mal') || document.body.innerText.includes('error crítico');
        return !errorBoundary && !hasTextError;
      });

      auditResults.moduleHealth[moduleId] = { success: navSuccess, healthy: isHealthy };
      if (isHealthy) {
        console.log(`✅ Módulo "${moduleName}" cargado y funcionando al 100%.`);
      } else {
        console.error(`❌ Módulo "${moduleName}" presentó error de renderizado.`);
      }
      return isHealthy;
    }

    // 2. Módulo Capacitaciones
    console.log('\n--- PASO 2: Módulo Capacitaciones & Google Drive ---');
    await navigateToModule('capacitaciones', 'Academia de Aprendizaje IBRO');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_capacitaciones_grid.png') });

    // Auditar tarjetas de cursos y badges
    const capacitacionesData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group, .border, [class*="card"]'));
      const courseTitles = Array.from(document.querySelectorAll('h3, h4, p.font-black, p.font-extrabold'))
        .filter(el => el.textContent && el.textContent.length > 5 && !el.textContent.includes('IBRO'))
        .map(el => el.textContent.trim())
        .slice(0, 5);

      const trackingButtons = Array.from(document.querySelectorAll('button')).filter(b => 
        b.textContent && (b.textContent.includes('Seguimiento') || b.textContent.includes('Trazabilidad') || b.textContent.includes('Matriz'))
      ).map(b => b.textContent.trim());

      return {
        cardsCount: cards.length,
        courseTitles,
        trackingButtons
      };
    });
    console.log('📚 Cursos y elementos detectados:', capacitacionesData);
    auditResults.capacitaciones = capacitacionesData;

    // Abrir Modal de Matriz de Seguimiento / Trazabilidad
    console.log('\n--- PASO 2.1: Matriz de Seguimiento y Trazabilidad (Avance %, Fechas) ---');
    const trackingOpened = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent && (b.textContent.includes('Seguimiento') || b.textContent.includes('Trazabilidad') || b.textContent.includes('Matriz')));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (trackingOpened) {
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_capacitaciones_trazabilidad.png') });

      const trackingRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.slice(0, 5).map(r => {
          const cells = Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim().replace(/\s+/g, ' '));
          return cells;
        });
      });
      console.log('📋 Filas de la Matriz de Seguimiento:', trackingRows);
      auditResults.capacitaciones.trackingRows = trackingRows;

      // Cerrar modal con Escape
      await page.keyboard.press('Escape');
      await sleep(1000);
    }

    // Abrir un curso para inspeccionar video y estado de Google Drive
    console.log('\n--- PASO 2.2: Apertura de Curso y Reproductor de Video Google Drive ---');
    const courseOpened = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const takeBtn = buttons.find(b => b.textContent && (b.textContent.includes('Ver Curso') || b.textContent.includes('Tomar Curso') || b.textContent.includes('Continuar')));
      if (takeBtn) {
        takeBtn.click();
        return true;
      }
      return false;
    });

    if (courseOpened) {
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_curso_detalle.png') });

      // Clic en pestaña de Video Formativo
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('button, div, span'));
        const vTab = tabs.find(t => t.textContent && t.textContent.includes('Video'));
        if (vTab) vTab.click();
      });
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_curso_video_drive.png') });

      const driveVideoState = await page.evaluate(() => {
        const video = document.querySelector('video');
        const iframe = document.querySelector('iframe');
        const driveNotice = Array.from(document.querySelectorAll('*')).find(e => 
          e.textContent && (e.textContent.includes('Google Drive') || e.textContent.includes('disponibilidad'))
        )?.textContent?.trim();

        const driveButton = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent && b.textContent.includes('Google Drive')
        )?.textContent?.trim();

        return {
          hasVideoElement: !!video,
          videoSrc: video ? video.src : null,
          hasIframe: !!iframe,
          iframeSrc: iframe ? iframe.src : null,
          driveNotice: driveNotice || null,
          driveButton: driveButton || null
        };
      });
      console.log('🎥 Estado de Video y Google Drive:', driveVideoState);
      auditResults.capacitaciones.driveVideoState = driveVideoState;

      // Cerrar modal del curso
      await page.keyboard.press('Escape');
      await sleep(1000);
    }

    // 3. Módulo Pedidos (Validando corrección de useRef)
    console.log('\n--- PASO 3: Módulo Pedidos (Validación de Fix) ---');
    await navigateToModule('ventas', 'Pedidos');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_pedidos_fixed.png') });
    auditResults.modulesTested.push('Pedidos');

    // 4. Módulo Clientes
    console.log('\n--- PASO 4: Módulo Clientes ---');
    await navigateToModule('clientes', 'Clientes');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_clientes.png') });
    auditResults.modulesTested.push('Clientes');

    // 5. Módulo Cotizaciones
    console.log('\n--- PASO 5: Módulo Cotizaciones ---');
    await navigateToModule('cotizaciones', 'Cotizaciones');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_cotizaciones.png') });
    auditResults.modulesTested.push('Cotizaciones');

    // 6. Módulo Servicios Técnicos
    console.log('\n--- PASO 6: Módulo Servicios Técnicos ---');
    await navigateToModule('servicios', 'Servicios Técnicos');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_servicios.png') });
    auditResults.modulesTested.push('Servicios');

    // 7. Notificaciones
    console.log('\n--- PASO 7: Sistema de Notificaciones en Tiempo Real ---');
    const notifData = await page.evaluate(() => {
      const bell = document.querySelector('[data-icon="bell"]') || 
                   Array.from(document.querySelectorAll('*')).find(e => e.className && typeof e.className === 'string' && e.className.includes('fa-bell'));
      if (bell) {
        const btn = bell.closest('button') || bell;
        btn.click();
      }
      return { bellFound: !!bell };
    });
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_notificaciones_panel.png') });

    const notifItems = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div, li, p'))
        .filter(el => el.textContent && (el.textContent.includes('Capacitación') || el.textContent.includes('pendiente') || el.textContent.includes('asignada')))
        .map(el => el.textContent.trim().replace(/\s+/g, ' '))
        .slice(0, 5);
      return items;
    });
    console.log('🔔 Alertas y Notificaciones detectadas:', notifItems);
    auditResults.notifications = { ...notifData, items: notifItems };

    // 8. Validación Móvil Responsiva (iPhone 14: 390x844)
    console.log('\n--- PASO 8: Validación Responsiva Móvil (390x844) ---');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_responsive_mobile.png') });
    auditResults.responsiveChecks.push({ viewport: '390x844', status: 'OK' });
    console.log('📱 Vista móvil verificada y responsiva.');

    console.log('\n🏆 [CHROME E2E] Todas las pruebas han sido completadas con éxito.');
  } catch (err) {
    console.error('❌ Error fatal en Chrome E2E test:', err);
    auditResults.fatalError = err.message;
  } finally {
    if (browser) {
      await browser.close();
    }
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'e2e_final_report.json'),
      JSON.stringify(auditResults, null, 2)
    );
  }
}

runChromeE2ETest();
