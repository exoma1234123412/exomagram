/**
 * Seed FRESH sample data for today (2026-05-28) and yesterday (2026-05-27)
 * Does NOT delete existing data — only inserts new entries.
 * Run with: node scripts/seed-fresh-today.mjs
 */

const SUPABASE_URL = 'https://yoghuincawtswvttuvzi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZ2h1aW5jYXd0c3d2dHR1dnppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkxNTM4MSwiZXhwIjoyMDk1NDkxMzgxfQ.GsJbUEtU1T5PqNdT-ATa26seIdwNrwNiKasYUJf4pDE';

const ORG_ID = '04371022-2d43-4908-959e-cfc81c0172e7';

const TODAY = '2026-05-28';
const YESTERDAY = '2026-05-27';

const USERS = {
  exoma:  { id: 'bdb0db8b-e08c-4cfb-a873-b8f50aa3e474', name: 'EXOMAP' },
  erik:    { id: '9a8ba6e7-934f-4dc2-a69e-1a9efd65a485', name: 'Erik' },
  andres:  { id: 'd4003fc5-3c26-457c-8e94-95729bba5cc3', name: 'Andres' },
  eugenio: { id: 'd417dd6f-d8ed-45a8-b5bb-b76675acae66', name: 'Eugenio' },
  emilio:  { id: '7b257057-da65-4192-b0cc-c5de9801955d', name: 'Emilio' },
};

// ============================================================
// Helpers
// ============================================================

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function supabaseUpsertBatch(table, rows, onConflictCols) {
  if (!rows || rows.length === 0) return [];
  const chunkSize = 50;
  const allResults = [];
  const qs = onConflictCols ? `?on_conflict=${onConflictCols}` : '';
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`ERROR upserting into ${table} (chunk ${i / chunkSize}):`, res.status, text);
      console.error('First row:', JSON.stringify(chunk[0], null, 2));
      throw new Error(`Upsert failed for ${table}`);
    }
    const data = await res.json();
    allResults.push(...data);
  }
  console.log(`  ✓ Upserted ${allResults.length} rows into ${table}`);
  return allResults;
}

async function supabaseInsertOnly(table, rows) {
  if (!rows || rows.length === 0) return [];
  const chunkSize = 50;
  const allResults = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`ERROR inserting into ${table} (chunk ${i / chunkSize}):`, res.status, text);
      console.error('First row:', JSON.stringify(chunk[0], null, 2));
      throw new Error(`Insert failed for ${table}`);
    }
    const data = await res.json();
    allResults.push(...data);
  }
  console.log(`  ✓ Inserted ${allResults.length} rows into ${table}`);
  return allResults;
}

async function supabaseUpsert(table, row, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  ERROR upserting into ${table}:`, res.status, text);
    return null;
  }
  return await res.json();
}

// ============================================================
// TODAY's Time Entries (2026-05-28) — hours 8-14
// ============================================================

function generateTodayTimeEntries() {
  const entries = [];

  // EXOMAP — CEO: mix of meetings, planning, admin, some deep_work
  const exomaEntries = [
    { hour: 8,  category: 'admin',     title: 'Revisar métricas de adquisición de usuarios del fin de semana', mood: 4, energy: 5, proof: null, late: false },
    { hour: 9,  category: 'meeting',   title: 'Call con fondo de inversión Series A — presentación de tracción', mood: 4, energy: 4, proof: 'https://notion.so/exoma/series-a-deck-v3-2f8a9c', late: false },
    { hour: 10, category: 'meeting',   title: 'Sync semanal con equipo comercial — pipeline de demos Q2', mood: 3, energy: 4, proof: 'https://notion.so/exoma/sales-sync-052826', late: false },
    { hour: 11, category: 'planning',  title: 'Definir criterios de aceptación para feature de reportes enterprise', mood: 4, energy: 3, proof: 'https://linear.app/exoma/project/sprint-32', late: false },
    { hour: 12, category: 'break',     title: 'Almuerzo con mentor — conversación sobre estrategia de pricing', mood: 4, energy: 3, proof: null, late: false },
    { hour: 13, category: 'deep_work', title: 'Redactar propuesta de partnership con plataforma de HR', mood: 3, energy: 3, proof: null, late: true, minutesLate: 45 },
    { hour: 14, category: 'review',    title: 'Revisar mockups del dashboard público con Emilio', mood: 3, energy: 2, proof: 'https://figma.com/file/x8k2mq9r3f/dashboard-publico', late: false },
  ];

  // ERIK — CTO: heavy deep_work, code reviews, some meetings
  const erikEntries = [
    { hour: 8,  category: 'deep_work', title: 'Implementar middleware de autenticación con refresh token rotation', mood: 5, energy: 5, proof: 'https://github.com/exoma-dev/exomagram/pull/387', late: false },
    { hour: 9,  category: 'deep_work', title: 'Configurar edge functions para procesamiento de webhooks de GitHub', mood: 4, energy: 5, proof: 'https://github.com/exoma-dev/exomagram/commit/a3f29b1e', late: false },
    { hour: 10, category: 'review',    title: 'Code review: PR de Eugenio — optimización de queries de trust score', mood: 4, energy: 4, proof: 'https://github.com/exoma-dev/exomagram/pull/391#pullrequestreview-48291', late: false },
    { hour: 11, category: 'meeting',   title: 'Pair programming con Andres — integración de calendario con Google API', mood: 4, energy: 4, proof: null, late: false },
    { hour: 12, category: 'break',     title: 'Almuerzo y lectura de RFC sobre HTTP/3', mood: 4, energy: 3, proof: null, late: false },
    { hour: 13, category: 'deep_work', title: 'Diseñar schema de rate limiting con sliding window por tenant', mood: 3, energy: 3, proof: 'https://linear.app/exoma/issue/EXO-412', late: false },
  ];

  // ANDRES — Full Stack Dev: coding, some review, meetings
  const andresEntries = [
    { hour: 8,  category: 'deep_work', title: 'Desarrollar endpoint REST para exportación de reportes en PDF', mood: 4, energy: 5, proof: 'https://github.com/exoma-dev/exomagram/pull/389', late: false },
    { hour: 9,  category: 'deep_work', title: 'Implementar validación de formulario de time entry con Zod + React Hook Form', mood: 4, energy: 4, proof: 'https://github.com/exoma-dev/exomagram/commit/b7e1a2c4', late: false },
    { hour: 10, category: 'meeting',   title: 'Daily standup — revisión de blockers y prioridades del día', mood: 4, energy: 4, proof: null, late: false },
    { hour: 11, category: 'deep_work', title: 'Construir componente de filtros avanzados para vista de equipo con debounce', mood: 3, energy: 3, proof: 'https://github.com/exoma-dev/exomagram/pull/390', late: true, minutesLate: 60 },
    { hour: 12, category: 'break',     title: 'Almuerzo', mood: 3, energy: 3, proof: null, late: false },
    { hour: 13, category: 'review',    title: 'QA del flujo completo de daily closeout antes de merge a main', mood: 3, energy: 2, proof: null, late: false },
    { hour: 14, category: 'deep_work', title: 'Integrar notificaciones push con Supabase Realtime para shoutouts', mood: 3, energy: 2, proof: 'https://linear.app/exoma/issue/EXO-398', late: true, minutesLate: 35 },
  ];

  // EUGENIO — Backend Dev: DB work, optimization, backend features
  const eugenioEntries = [
    { hour: 8,  category: 'deep_work', title: 'Escribir stored procedure para cálculo semanal de trust score', mood: 5, energy: 5, proof: 'https://github.com/exoma-dev/exomagram/pull/392', late: false },
    { hour: 9,  category: 'deep_work', title: 'Implementar cron job para generar accountability flags automáticas a las 19:00', mood: 4, energy: 4, proof: 'https://github.com/exoma-dev/exomagram/commit/c4d82f1a', late: false },
    { hour: 10, category: 'review',    title: 'Validar integridad referencial después de migración v5 en staging', mood: 4, energy: 4, proof: null, late: false },
    { hour: 11, category: 'meeting',   title: 'Sesión de debugging con Erik — latencia en queries de dashboard', mood: 3, energy: 3, proof: null, late: false },
    { hour: 12, category: 'break',     title: 'Almuerzo y café', mood: 4, energy: 3, proof: null, late: false },
    { hour: 13, category: 'deep_work', title: 'Optimizar índice compuesto en time_entries para filtros de fecha + categoría', mood: 3, energy: 3, proof: 'https://linear.app/exoma/issue/EXO-405', late: false },
  ];

  // EMILIO — Frontend Dev: UI/UX work, design, components
  const emilioEntries = [
    { hour: 8,  category: 'deep_work', title: 'Implementar vista responsive de war room para pantallas < 768px', mood: 4, energy: 5, proof: 'https://github.com/exoma-dev/exomagram/pull/388', late: false },
    { hour: 9,  category: 'deep_work', title: 'Crear componente reutilizable de tarjeta de promesa con estados animados', mood: 4, energy: 4, proof: 'https://figma.com/file/k9a3bm2q/promise-cards-v2', late: false },
    { hour: 10, category: 'meeting',   title: 'Revisión de prototipos de landing page con EXOMAP y equipo', mood: 4, energy: 4, proof: null, late: true, minutesLate: 20 },
    { hour: 11, category: 'deep_work', title: 'Desarrollar animación de transición entre páginas con Framer Motion', mood: 4, energy: 3, proof: 'https://github.com/exoma-dev/exomagram/commit/e2f8a91b', late: false },
    { hour: 13, category: 'deep_work', title: 'Implementar gráfica de radar para distribución semanal de categorías', mood: 3, energy: 2, proof: 'https://github.com/exoma-dev/exomagram/pull/393', late: false },
    { hour: 14, category: 'admin',     title: 'Actualizar Storybook con los 6 nuevos componentes de esta semana', mood: 3, energy: 2, proof: null, late: true, minutesLate: 50 },
  ];

  const allUserEntries = {
    exoma: exomaEntries,
    erik: erikEntries,
    andres: andresEntries,
    eugenio: eugenioEntries,
    emilio: emilioEntries,
  };

  for (const [userKey, userEntries] of Object.entries(allUserEntries)) {
    const user = USERS[userKey];
    for (const e of userEntries) {
      const isLate = e.late || false;
      const minutesLate = e.minutesLate || 0;

      const loggedAt = new Date(`${TODAY}T${String(e.hour).padStart(2, '0')}:${String(rand(2, 55)).padStart(2, '0')}:00-06:00`);
      if (isLate) {
        loggedAt.setMinutes(loggedAt.getMinutes() + minutesLate);
      }

      entries.push({
        user_id: user.id,
        org_id: ORG_ID,
        date: TODAY,
        hour: e.hour,
        category: e.category,
        title: e.title,
        description: null,
        mood: e.mood,
        energy: e.energy,
        links: [],
        auto_captured: false,
        verification_status: e.proof ? (Math.random() < 0.4 ? 'verified' : 'unverified') : 'unverified',
        proof_urls: e.proof ? [e.proof] : [],
        is_late: isLate,
        minutes_late: minutesLate,
        logged_at: loggedAt.toISOString(),
        project: pick(['exomagram-app', 'exomagram-api', 'exomagram-infra', null]),
      });
    }
  }

  return entries;
}

// ============================================================
// TODAY's Standups (2026-05-28) — all 5 people
// ============================================================

function generateTodayStandups() {
  return [
    {
      user_id: USERS.exoma.id,
      org_id: ORG_ID,
      date: TODAY,
      yesterday: 'Cerré la presentación para Series A con el fondo. Revisé OKRs del equipo y tuve 1:1s con Erik y Emilio sobre prioridades de producto.',
      today_plan: 'Call con fondo de inversión a las 9am. Definir criterios de reportes enterprise. Revisar mockups del dashboard público con Emilio.',
      blockers: null,
      mood: 4,
      submitted_at: new Date(`${TODAY}T08:12:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      date: TODAY,
      yesterday: 'Implementé el sistema de refresh token rotation y resolví el bug de sesiones expiradas. Hice code review de 2 PRs grandes y avancé en el diseño de webhooks.',
      today_plan: 'Terminar middleware de auth. Configurar edge functions de webhooks. Pair programming con Andres sobre Google Calendar API.',
      blockers: 'Necesito que Eugenio valide el schema de rate limiting antes de implementar.',
      mood: 5,
      submitted_at: new Date(`${TODAY}T08:05:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      date: TODAY,
      yesterday: 'Completé el endpoint de exportación CSV y arreglé 3 bugs en el formulario de time entries. El flujo de closeout ya pasa todos los tests.',
      today_plan: 'Desarrollar endpoint de exportación PDF. Implementar filtros avanzados en vista de equipo. Integrar notificaciones push.',
      blockers: 'Esperando definición de diseño de filtros de Emilio para componente de equipo.',
      mood: 4,
      submitted_at: new Date(`${TODAY}T08:20:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      date: TODAY,
      yesterday: 'Terminé la migración v5 en staging sin errores. Optimicé 3 queries que estaban haciendo full table scans. Escribí tests para el módulo de scoring.',
      today_plan: 'Stored procedure de trust score semanal. Cron job de accountability flags. Optimizar índices de time_entries para filtros complejos.',
      blockers: null,
      mood: 4,
      submitted_at: new Date(`${TODAY}T08:08:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      date: TODAY,
      yesterday: 'Implementé dark mode en 80% de las vistas. El responsive del war room quedó listo. Arreglé inconsistencias de tipografía en 4 páginas.',
      today_plan: 'Vista responsive de war room para mobile. Componente de tarjeta de promesa. Landing page con animaciones. Gráfica de radar semanal.',
      blockers: 'El bundle size sigue creciendo — necesito investigar si es culpa de Framer Motion o de los iconos.',
      mood: 3,
      submitted_at: new Date(`${TODAY}T08:35:00-06:00`).toISOString(),
    },
  ];
}

// ============================================================
// TODAY's Daily Promises (2026-05-28) — all 5 people, mix of statuses
// ============================================================

function generateTodayPromises() {
  return [
    // EXOMAP — 3 promises: 1 delivered, 2 pending
    {
      user_id: USERS.exoma.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Terminar la presentación de tracción para el fondo de inversión',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:15:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.exoma.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Definir criterios de aceptación de reportes enterprise con Erik',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:16:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.exoma.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Enviar propuesta de partnership a plataforma de HR antes de las 6pm',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:17:00-06:00`).toISOString(),
    },

    // Erik — 3 promises: 2 delivered, 1 pending
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Completar middleware de refresh token rotation y desplegarlo en staging',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:06:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Hacer code review del PR de Eugenio sobre trust score',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:07:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Terminar diseño del schema de rate limiting por tenant',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:08:00-06:00`).toISOString(),
    },

    // Andres — 4 promises: 2 delivered, 2 pending
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Entregar endpoint de exportación PDF con tests',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:22:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Implementar componente de filtros avanzados en vista de equipo',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:23:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Integrar notificaciones push para shoutouts con Supabase Realtime',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:24:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Corregir bug de validación en formulario de time entry',
      status: 'pending',
      created_at: new Date(`${TODAY}T10:15:00-06:00`).toISOString(),
    },

    // Eugenio — 3 promises: 1 delivered, 2 pending
    {
      user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Escribir stored procedure completa del trust score semanal',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:10:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Implementar cron job de accountability flags automáticas',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:11:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Optimizar índice compuesto de time_entries para queries de dashboard',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:12:00-06:00`).toISOString(),
    },

    // Emilio — 3 promises: 1 delivered, 1 pending, 1 broken (he couldn't finish animations)
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Terminar vista responsive del war room para mobile',
      status: 'delivered',
      created_at: new Date(`${TODAY}T08:36:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Crear componente de tarjeta de promesa con animaciones de estado',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:37:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      date: TODAY,
      title: 'Implementar gráfica de radar para distribución semanal de categorías',
      status: 'pending',
      created_at: new Date(`${TODAY}T08:38:00-06:00`).toISOString(),
    },
  ];
}

// ============================================================
// TODAY's Live Status (2026-05-28) — all 5 people, mixed statuses
// ============================================================

function generateLiveStatuses() {
  const now = new Date().toISOString();
  return [
    {
      user_id: USERS.exoma.id,
      org_id: ORG_ID,
      status: 'in_meeting',
      current_task: 'Revisando mockups del dashboard público con Emilio',
      started_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      status: 'deep_work',
      current_task: 'Diseñando schema de rate limiting con sliding window',
      started_at: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      status: 'online',
      current_task: 'Integrando notificaciones push con Supabase Realtime',
      started_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
    {
      user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      status: 'deep_work',
      current_task: 'Optimizando índices compuestos en time_entries',
      started_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      status: 'idle',
      current_task: 'Actualizando Storybook con componentes nuevos',
      started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      last_heartbeat: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    },
  ];
}

// ============================================================
// YESTERDAY's Closeouts (2026-05-27) — all 5 people
// ============================================================

function generateYesterdayCloseouts() {
  return [
    {
      user_id: USERS.exoma.id,
      org_id: ORG_ID,
      date: YESTERDAY,
      summary: 'Día enfocado en fundraising y alineación de equipo. Terminé la v3 del pitch deck para la ronda Series A. Tuve reuniones con 2 fondos y el feedback fue positivo — piden más datos de retención. También hice 1:1 con Erik para priorizar el backlog técnico del Q3.',
      blockers: null,
      tomorrow_plan: 'Call con fondo de inversión. Definir criterios de reportes enterprise. Revisar diseño del dashboard público.',
      mood: 4,
      hours_logged: 8,
      hours_with_proof: 4,
      submitted_at: new Date(`${YESTERDAY}T18:15:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      date: YESTERDAY,
      summary: 'Gran avance en seguridad: completé el refactor de refresh token rotation que llevaba pendiente 2 sprints. El flow de PKCE ahora funciona correctamente con Supabase Auth. Hice 2 code reviews largos y encontré un bug crítico en el manejo de sesiones expiradas.',
      blockers: 'El servicio de email transaccional sigue sin darnos las API keys — llevo 3 días esperando.',
      tomorrow_plan: 'Middleware de auth, edge functions de webhooks, pair programming con Andres para Google Calendar.',
      mood: 4,
      hours_logged: 9,
      hours_with_proof: 7,
      submitted_at: new Date(`${YESTERDAY}T18:40:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      date: YESTERDAY,
      summary: 'Completé el endpoint de exportación CSV con streaming para archivos grandes. Arreglé 3 bugs que los usuarios reportaron en el formulario de time entries — el peor era un race condition al guardar. Los tests e2e del closeout ya pasan en CI.',
      blockers: 'Falta definición de diseño de filtros por parte de Emilio — no puedo avanzar con el componente sin eso.',
      tomorrow_plan: 'Endpoint de exportación PDF, filtros avanzados en vista de equipo, integración de notificaciones push.',
      mood: 4,
      hours_logged: 8,
      hours_with_proof: 6,
      submitted_at: new Date(`${YESTERDAY}T18:05:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      date: YESTERDAY,
      summary: 'La migración v5 pasó sin errores en staging después de 3 intentos. Identifiqué y corregí 3 queries que hacían full table scans — la más costosa era la del leaderboard. Escribí 12 tests unitarios para el módulo de scoring que cubren todos los edge cases.',
      blockers: 'El entorno de staging tiene límite de 20 conexiones — con los cron jobs se satura rápido.',
      tomorrow_plan: 'Stored procedure de trust score, cron job de flags, optimización de índices.',
      mood: 5,
      hours_logged: 9,
      hours_with_proof: 7,
      submitted_at: new Date(`${YESTERDAY}T18:50:00-06:00`).toISOString(),
    },
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      date: YESTERDAY,
      summary: 'Logré implementar dark mode en el 80% de las vistas — solo faltan los gráficos de Recharts que necesitan tema custom. El responsive del war room está terminado y se ve bien en iPhone y Android. Corregí inconsistencias de tipografía en 4 páginas.',
      blockers: 'Framer Motion está inflando el bundle — voy a investigar alternativas más ligeras mañana.',
      tomorrow_plan: 'Responsive de war room mobile, tarjeta de promesa, animaciones de transición, gráfica de radar.',
      mood: 3,
      hours_logged: 7,
      hours_with_proof: 5,
      submitted_at: new Date(`${YESTERDAY}T17:45:00-06:00`).toISOString(),
    },
  ];
}

// ============================================================
// Main execution
// ============================================================

async function main() {
  console.log('=== Exomagram Fresh Seed — Today + Yesterday ===\n');

  // 1. Time entries for today (upsert — unique on user_id, org_id, date, hour)
  console.log('1. Upserting time entries for today (2026-05-28)...');
  const todayEntries = generateTodayTimeEntries();
  console.log(`   Generated ${todayEntries.length} entries`);
  await supabaseUpsertBatch('time_entries', todayEntries, 'user_id,org_id,date,hour');

  // 2. Standups for today (upsert — unique on user_id, org_id, date)
  console.log('\n2. Upserting standups for today...');
  const standups = generateTodayStandups();
  await supabaseUpsertBatch('standups', standups, 'user_id,org_id,date');

  // 3. Daily promises for today (plain insert — no unique constraint)
  console.log('\n3. Inserting daily promises for today...');
  const promises = generateTodayPromises();
  await supabaseInsertOnly('daily_promises', promises);

  // 4. Live statuses (upsert — primary key is user_id)
  console.log('\n4. Upserting live statuses for all 5 people...');
  const liveStatuses = generateLiveStatuses();
  for (const status of liveStatuses) {
    await supabaseUpsert('live_status', status);
  }
  console.log(`  ✓ Upserted ${liveStatuses.length} live statuses`);

  // 5. Daily closeouts for yesterday (upsert — unique on user_id, org_id, date)
  console.log('\n5. Upserting daily closeouts for yesterday (2026-05-27)...');
  const closeouts = generateYesterdayCloseouts();
  await supabaseUpsertBatch('daily_closeouts', closeouts, 'user_id,org_id,date');

  console.log('\n=== Seed complete! ===');
  console.log(`  Today entries: ${todayEntries.length}`);
  console.log(`  Standups: ${standups.length}`);
  console.log(`  Promises: ${promises.length}`);
  console.log(`  Live statuses: ${liveStatuses.length}`);
  console.log(`  Closeouts (yesterday): ${closeouts.length}`);
}

main().catch(console.error);
