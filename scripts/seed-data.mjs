/**
 * Seed realistic sample data for Exomagram
 * Run with: node scripts/seed-data.mjs
 */

const SUPABASE_URL = 'https://yoghuincawtswvttuvzi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZ2h1aW5jYXd0c3d2dHR1dnppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkxNTM4MSwiZXhwIjoyMDk1NDkxMzgxfQ.GsJbUEtU1T5PqNdT-ATa26seIdwNrwNiKasYUJf4pDE';

const ORG_ID = '04371022-2d43-4908-959e-cfc81c0172e7';

const USERS = {
  exoma: { id: 'bdb0db8b-e08c-4cfb-a873-b8f50aa3e474', name: 'EXOMAP', role: 'CEO' },
  erik:   { id: '9a8ba6e7-934f-4dc2-a69e-1a9efd65a485', name: 'Erik',   role: 'CTO' },
  andres: { id: 'd4003fc5-3c26-457c-8e94-95729bba5cc3', name: 'Andres', role: 'Full Stack Dev' },
  eugenio:{ id: 'd417dd6f-d8ed-45a8-b5bb-b76675acae66', name: 'Eugenio',role: 'Backend Dev' },
  emilio: { id: '7b257057-da65-4192-b0cc-c5de9801955d', name: 'Emilio', role: 'Frontend Dev' },
};

// Date range: 2026-05-22 to 2026-05-28
const DATES = [];
for (let d = 22; d <= 28; d++) {
  DATES.push(`2026-05-${String(d).padStart(2, '0')}`);
}

// ============================================================
// Helper functions
// ============================================================

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function uuid() {
  return crypto.randomUUID();
}

async function supabaseInsert(table, rows) {
  if (!rows || rows.length === 0) return [];
  // Batch in chunks of 50 to avoid payload limits
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
      console.error('First row of failed chunk:', JSON.stringify(chunk[0], null, 2));
      throw new Error(`Insert failed for ${table}`);
    }
    const data = await res.json();
    allResults.push(...data);
  }
  console.log(`  ✓ Inserted ${allResults.length} rows into ${table}`);
  return allResults;
}

// ============================================================
// Task pools per user role
// ============================================================

const TASKS_EXOMAP = {
  meeting: [
    'Reunión de alineación con inversionistas',
    'Call con partner potencial de integración',
    'Sync semanal con equipo de producto',
    'Junta directiva mensual - revisión métricas',
    'Entrevista candidato Senior Engineer',
    'Reunión 1:1 con Erik sobre roadmap técnico',
    'Llamada con cliente enterprise piloto',
    'Sync con equipo de ventas - pipeline Q2',
    'Revisión OKRs del trimestre con líderes',
    'Reunión con abogado sobre términos de servicio',
  ],
  planning: [
    'Definir prioridades del sprint siguiente',
    'Planificación estratégica Q3 - análisis de mercado',
    'Revisión y ajuste del product roadmap',
    'Diseñar estructura de precios para enterprise',
    'Planificar contrataciones del próximo trimestre',
    'Elaborar propuesta para ronda de inversión',
    'Redactar plan de go-to-market para LATAM',
  ],
  admin: [
    'Revisar y aprobar gastos operativos del mes',
    'Actualizar tablero de métricas clave',
    'Preparar deck para presentación a inversionistas',
    'Responder correos de partners y clientes',
    'Organizar agenda de la semana para el equipo',
    'Gestionar accesos y licencias de herramientas',
  ],
  deep_work: [
    'Escribir blog post sobre cultura de transparencia',
    'Analizar datos de retención de usuarios',
    'Documentar procesos de onboarding para nuevos empleados',
    'Investigar competidores y diferenciales del mercado',
  ],
  review: [
    'Revisar propuesta de diseño para dashboard público',
    'Feedback sobre release notes del sprint',
    'Revisar PRs de features clave antes de deploy',
  ],
  learning: [
    'Leer artículo sobre gestión de equipos remotos',
    'Webinar sobre métricas SaaS con a16z',
  ],
  break: [
    'Almuerzo y descanso',
    'Café y lectura rápida',
    'Pausa entre reuniones',
  ],
  blocked: [
    'Esperando respuesta de cliente sobre contrato',
    'Bloqueado por decisión legal pendiente',
  ],
};

const TASKS_ERIK = {
  deep_work: [
    'Refactorizar módulo de autenticación con PKCE flow',
    'Implementar sistema de cache distribuido con Redis',
    'Optimizar queries de dashboard - reducir N+1',
    'Diseñar arquitectura de webhooks para integraciones',
    'Migrar endpoints legacy a nueva versión de API',
    'Implementar rate limiting por tenant',
    'Configurar pipeline de CI/CD con tests e2e',
    'Escribir middleware de validación con Zod schemas',
    'Debugging de memory leak en worker de background jobs',
    'Implementar sistema de feature flags dinámico',
  ],
  review: [
    'Code review: PR de Andres - módulo de notificaciones',
    'Code review: PR de Eugenio - optimización de queries',
    'Revisar RFC de nueva arquitectura de microservicios',
    'Review del schema de migración v5',
    'Code review: PR de Emilio - componentes de dashboard',
    'Auditoría de seguridad del flujo de autenticación',
  ],
  meeting: [
    'Daily standup técnico',
    '1:1 con EXOMAP - prioridades técnicas',
    'Sesión de pair programming con Andres',
    'Sync con equipo sobre deuda técnica',
    'Entrevista técnica candidato backend',
  ],
  planning: [
    'Estimación de esfuerzo para features del sprint',
    'Definir standards de código y linting rules',
    'Planificar migración de base de datos',
    'Diseñar estrategia de testing automatizado',
  ],
  admin: [
    'Actualizar documentación técnica en Notion',
    'Configurar alertas de monitoreo en Datadog',
    'Gestionar dependencias y actualizar packages',
  ],
  learning: [
    'Investigar Drizzle ORM como alternativa a Prisma',
    'Estudiar patterns de Edge Functions en Vercel',
    'Leer RFC de React Server Components streaming',
  ],
  break: [
    'Almuerzo',
    'Café y descanso mental',
    'Pausa para estiramientos',
  ],
  blocked: [
    'Bloqueado esperando access keys de servicio externo',
    'Esperando resolución de ticket con Supabase support',
  ],
};

const TASKS_ANDRES = {
  deep_work: [
    'Implementar página de perfil de usuario con edición',
    'Construir componente de timeline interactivo',
    'Desarrollar API endpoint para exportar datos CSV',
    'Implementar sistema de notificaciones en tiempo real',
    'Crear formulario de time entry con validación completa',
    'Desarrollar vista de calendario semanal con drag & drop',
    'Implementar filtros avanzados en vista de equipo',
    'Construir módulo de integración con GitHub webhooks',
    'Desarrollar sistema de búsqueda full-text en entries',
    'Implementar paginación infinita en el feed de actividad',
    'Crear endpoint de analytics con agregaciones por período',
    'Desarrollar componente de gráficas de productividad',
  ],
  review: [
    'Revisar PR de Emilio - componente de mood selector',
    'Testing manual del flujo de closeout diario',
    'QA del módulo de shoutouts antes de merge',
  ],
  meeting: [
    'Daily standup',
    'Sync con Erik sobre arquitectura del feature',
    'Refinamiento del backlog con EXOMAP',
    'Demo del sprint para stakeholders',
  ],
  planning: [
    'Desglosar tickets del epic de integrations',
    'Estimar stories del sprint backlog',
  ],
  admin: [
    'Resolver conflictos de merge en branch principal',
    'Actualizar seeds y fixtures de testing',
    'Documentar API endpoints nuevos en Swagger',
  ],
  learning: [
    'Tutorial de Supabase Realtime v2',
    'Practicar patterns de Server Actions en Next.js',
  ],
  break: [
    'Almuerzo',
    'Descanso y café',
    'Pausa mental',
  ],
  blocked: [
    'Bloqueado por bug en librería de drag & drop',
    'Esperando diseño final de Emilio para componente',
  ],
};

const TASKS_EUGENIO = {
  deep_work: [
    'Optimizar índices de PostgreSQL para queries pesadas',
    'Implementar función de cálculo de trust score',
    'Desarrollar cron job para generar accountability flags',
    'Escribir migrations para schema v5',
    'Implementar lógica de streaks con edge cases',
    'Crear stored procedures para reportes semanales',
    'Desarrollar worker de sincronización con GitHub API',
    'Implementar sistema de rate limiting por usuario',
    'Optimizar query de dashboard - de 2s a 200ms',
    'Escribir tests unitarios para módulo de scoring',
    'Implementar validación de datos a nivel de RLS policies',
    'Desarrollar sistema de backups incrementales',
  ],
  review: [
    'Revisar migration de Andres - tablas de analytics',
    'Code review: lógica de permisos en API routes',
    'Validar integridad de datos después de migración',
  ],
  meeting: [
    'Daily standup',
    'Sync con Erik sobre performance de DB',
    'Sesión de debugging con Andres',
  ],
  planning: [
    'Diseñar esquema de particionamiento de tablas',
    'Planificar estrategia de índices para el trimestre',
  ],
  admin: [
    'Monitorear logs de errores en producción',
    'Limpiar ramas viejas del repositorio',
    'Actualizar variables de entorno en staging',
  ],
  learning: [
    'Estudiar pgvector para búsqueda semántica futura',
    'Investigar Supabase Edge Functions con Deno',
  ],
  break: [
    'Almuerzo',
    'Café y desconexión',
    'Pausa para caminar',
  ],
  blocked: [
    'Esperando acceso a logs de producción',
    'Bloqueado por límite de conexiones en staging',
  ],
};

const TASKS_EMILIO = {
  deep_work: [
    'Implementar componente de heatmap de actividad',
    'Crear sistema de design tokens en Tailwind',
    'Desarrollar animaciones de transición entre vistas',
    'Implementar dark mode con variables CSS',
    'Construir componente de avatar con estados de presencia',
    'Desarrollar skeleton loaders para todas las vistas',
    'Crear componente reutilizable de tarjeta de entry',
    'Implementar responsive design para vista móvil',
    'Construir modal de detalle de time entry con tabs',
    'Implementar gráfica de radar para distribución de categorías',
    'Desarrollar landing page con animaciones scroll',
    'Crear componente de emoji picker para mood',
  ],
  review: [
    'Revisar diseño de nueva página con Erik',
    'QA visual del flujo completo en mobile',
    'Revisar consistencia de colores y tipografía',
    'Feedback sobre UX del onboarding flow',
  ],
  meeting: [
    'Daily standup',
    'Sync de diseño con EXOMAP sobre branding',
    'Revisión de prototipos con el equipo',
  ],
  planning: [
    'Organizar componentes en Storybook',
    'Definir guía de estilos del proyecto',
  ],
  admin: [
    'Actualizar librería de iconos del proyecto',
    'Optimizar bundle size - tree shaking de imports',
    'Documentar componentes en Storybook',
  ],
  learning: [
    'Estudiar Framer Motion para animaciones complejas',
    'Tutorial de accesibilidad web con ARIA patterns',
  ],
  break: [
    'Almuerzo',
    'Café y sketch rápido',
    'Pausa creativa',
  ],
  blocked: [
    'Esperando assets de diseño del nuevo logo',
    'Bloqueado por decisión de UI framework',
  ],
};

const USER_TASKS = {
  exoma: TASKS_EXOMAP,
  erik: TASKS_ERIK,
  andres: TASKS_ANDRES,
  eugenio: TASKS_EUGENIO,
  emilio: TASKS_EMILIO,
};

// Category weights per user role
const CATEGORY_WEIGHTS = {
  exoma:  { meeting: 30, planning: 25, admin: 15, deep_work: 10, review: 10, learning: 3, break: 5, blocked: 2 },
  erik:    { deep_work: 35, review: 25, meeting: 12, planning: 10, admin: 5, learning: 5, break: 6, blocked: 2 },
  andres:  { deep_work: 45, review: 8, meeting: 10, planning: 7, admin: 8, learning: 5, break: 12, blocked: 5 },
  eugenio: { deep_work: 48, review: 10, meeting: 8, planning: 7, admin: 8, learning: 5, break: 10, blocked: 4 },
  emilio:  { deep_work: 40, review: 15, meeting: 10, planning: 7, admin: 8, learning: 5, break: 10, blocked: 5 },
};

function weightedCategory(userKey) {
  const weights = CATEGORY_WEIGHTS[userKey];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [cat, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return cat;
  }
  return 'deep_work';
}

function getProofUrl(category) {
  const urls = {
    deep_work: [
      'https://github.com/exoma-dev/exomagram/pull/' + rand(100, 450),
      'https://github.com/exoma-dev/exomagram/commit/' + Math.random().toString(16).slice(2, 10),
      'https://linear.app/exoma/issue/EXO-' + rand(200, 600),
      null, null,
    ],
    review: [
      'https://github.com/exoma-dev/exomagram/pull/' + rand(100, 450) + '#pullrequestreview-' + rand(10000, 99999),
      'https://github.com/exoma-dev/exomagram/pull/' + rand(100, 450),
      'https://linear.app/exoma/issue/EXO-' + rand(200, 600),
    ],
    meeting: [
      'https://notion.so/exoma/meeting-notes-' + Math.random().toString(36).slice(2, 10),
      null, null, null,
    ],
    planning: [
      'https://linear.app/exoma/project/sprint-' + rand(20, 40),
      'https://notion.so/exoma/planning-' + Math.random().toString(36).slice(2, 10),
      'https://figma.com/file/' + Math.random().toString(36).slice(2, 14) + '/roadmap',
      null, null,
    ],
    admin: [null, null, 'https://notion.so/exoma/docs-' + Math.random().toString(36).slice(2, 10)],
    learning: [null, null],
    break: [null],
    blocked: [null, 'https://linear.app/exoma/issue/EXO-' + rand(200, 600)],
  };
  return pick(urls[category] || [null]);
}

// ============================================================
// Generate time entries
// ============================================================

function generateTimeEntries() {
  const entries = [];
  const usedSlots = new Set();

  for (const [userKey, user] of Object.entries(USERS)) {
    const tasks = USER_TASKS[userKey];

    for (const date of DATES) {
      // Weekend (May 23 is Saturday, May 24 is Sunday in 2026)
      const dayOfWeek = new Date(date + 'T12:00:00').getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // Fewer entries on weekends
      const numEntries = isWeekend ? rand(0, 3) : rand(6, 9);

      if (numEntries === 0) continue;

      // Pick work hours (9-18 range, with some variation)
      const possibleHours = isWeekend
        ? [10, 11, 12, 13, 14, 15]
        : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

      const selectedHours = pickN(possibleHours, Math.min(numEntries, possibleHours.length)).sort((a, b) => a - b);

      for (const hour of selectedHours) {
        const slotKey = `${user.id}-${date}-${hour}`;
        if (usedSlots.has(slotKey)) continue;
        usedSlots.add(slotKey);

        const category = weightedCategory(userKey);
        const taskList = tasks[category];
        if (!taskList || taskList.length === 0) continue;

        const title = pick(taskList);
        const proofUrl = getProofUrl(category);

        // Mood and energy: lower in afternoon, higher in morning
        const baseMood = hour <= 12 ? rand(3, 5) : rand(2, 4);
        const baseEnergy = hour <= 11 ? rand(3, 5) : hour <= 14 ? rand(2, 4) : rand(1, 4);

        // Some entries are late
        const isLate = Math.random() < 0.15;
        const minutesLate = isLate ? rand(30, 180) : 0;

        // Create a realistic logged_at timestamp
        const loggedAtDate = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}:00-06:00`);
        if (isLate) {
          loggedAtDate.setMinutes(loggedAtDate.getMinutes() + minutesLate);
        }

        const entry = {
          user_id: user.id,
          org_id: ORG_ID,
          date,
          hour,
          category,
          title,
          description: null,
          mood: baseMood,
          energy: baseEnergy,
          links: [],
          auto_captured: false,
          verification_status: proofUrl ? (Math.random() < 0.4 ? 'verified' : 'unverified') : 'unverified',
          proof_urls: proofUrl ? [proofUrl] : [],
          is_late: isLate,
          minutes_late: minutesLate,
          logged_at: loggedAtDate.toISOString(),
          project: pick(['exomagram-app', 'exomagram-api', 'exomagram-infra', 'exomagram-docs', null, null]),
        };

        entries.push(entry);
      }
    }
  }

  return entries;
}

// ============================================================
// Generate standups (today, for 3 users)
// ============================================================

function generateStandups() {
  const today = '2026-05-27';
  const selectedUsers = pickN(Object.entries(USERS), 3);

  return selectedUsers.map(([key, user]) => {
    const yesterdayTexts = {
      exoma: 'Cerré negociación con partner de integraciones. Revisé métricas de retención y preparé deck para board meeting de junio.',
      erik: 'Terminé refactor del módulo de autenticación. Hice code review de 3 PRs y resolví el memory leak del worker de jobs.',
      andres: 'Implementé paginación infinita en el feed. Corregí bugs del formulario de time entry y actualicé tests e2e.',
      eugenio: 'Optimicé la query principal del dashboard de 2s a 180ms. Escribí migration para índices compuestos.',
      emilio: 'Completé el diseño del heatmap de actividad. Implementé skeleton loaders para las 4 vistas principales.',
    };

    const todayTexts = {
      exoma: 'Reunión con inversionistas a las 10am. Finalizar plan de go-to-market. 1:1 con Erik sobre prioridades técnicas.',
      erik: 'Implementar rate limiting por tenant. Revisar RFC de webhooks y hacer pair programming con Andres.',
      andres: 'Terminar módulo de integración con GitHub. Comenzar componente de calendario con drag & drop.',
      eugenio: 'Implementar cron job de accountability flags. Escribir tests para el módulo de trust score.',
      emilio: 'Implementar dark mode completo. Revisar responsive design en todas las vistas existentes.',
    };

    const blockerTexts = {
      exoma: null,
      erik: 'Necesito access keys del servicio de email transaccional para terminar notificaciones.',
      andres: 'Esperando diseño final del componente de calendario de Emilio.',
      eugenio: null,
      emilio: 'El bundle size creció 15% - necesito investigar qué dependencia lo causó.',
    };

    return {
      user_id: user.id,
      org_id: ORG_ID,
      date: today,
      yesterday: yesterdayTexts[key],
      today_plan: todayTexts[key],
      blockers: blockerTexts[key],
      mood: rand(3, 5),
      submitted_at: new Date(`${today}T09:${String(rand(0, 30)).padStart(2, '0')}:00-06:00`).toISOString(),
    };
  });
}

// ============================================================
// Generate daily closeouts (yesterday, for 4 users)
// ============================================================

function generateCloseouts() {
  const yesterday = '2026-05-26';
  const selectedUsers = pickN(Object.entries(USERS), 4);

  return selectedUsers.map(([key, user]) => {
    const summaries = {
      exoma: 'Día productivo con muchas reuniones. Cerré la negociación con el partner de integración y revisamos OKRs del Q2. El equipo está alineado con las prioridades.',
      erik: 'Buen progreso técnico. Terminé el refactor de auth, resolví 3 code reviews y debuggeé el memory leak que nos afectaba en producción. Queda pendiente el rate limiting.',
      andres: 'Completé 2 features: paginación infinita y fix del formulario de entries. Los tests e2e pasan. Tuve un blocker con la librería de drag & drop pero encontré workaround.',
      eugenio: 'Logré una mejora brutal en performance: la query del dashboard bajó de 2s a 180ms con índices compuestos. También avancé en las migrations de schema v5.',
      emilio: 'Terminé skeleton loaders y el heatmap. El dark mode tiene buen avance pero faltan ajustes en los gráficos. La landing page quedó al 80%.',
    };

    const blockers = {
      exoma: null,
      erik: 'Access keys del servicio de email aún pendientes.',
      andres: null,
      eugenio: 'El staging tiene límite de 20 conexiones simultáneas - necesitamos upgrade.',
      emilio: 'Bundle size preocupante, voy a investigar mañana.',
    };

    const tomorrowPlans = {
      exoma: 'Board meeting prep, llamada con cliente enterprise, 1:1s con líderes del equipo.',
      erik: 'Rate limiting, webhook architecture RFC, pair programming con Andres.',
      andres: 'Módulo de GitHub integration y comenzar calendario drag & drop.',
      eugenio: 'Cron job de flags, tests de trust score, revisar particionamiento.',
      emilio: 'Dark mode completo, responsive audit, investigar bundle size.',
    };

    return {
      user_id: user.id,
      org_id: ORG_ID,
      date: yesterday,
      summary: summaries[key],
      blockers: blockers[key],
      tomorrow_plan: tomorrowPlans[key],
      mood: rand(3, 5),
      hours_logged: rand(6, 9),
      hours_with_proof: rand(3, 6),
      submitted_at: new Date(`${yesterday}T18:${String(rand(0, 59)).padStart(2, '0')}:00-06:00`).toISOString(),
    };
  });
}

// ============================================================
// Generate shoutouts
// ============================================================

function generateShoutouts() {
  const shoutouts = [
    {
      from_user_id: USERS.exoma.id,
      to_user_id: USERS.eugenio.id,
      org_id: ORG_ID,
      message: 'La optimización del dashboard fue increíble. De 2 segundos a 180ms es un cambio que los usuarios van a notar inmediatamente. Gran trabajo, Eugenio.',
      category: 'great_work',
      date: '2026-05-26',
    },
    {
      from_user_id: USERS.erik.id,
      to_user_id: USERS.andres.id,
      org_id: ORG_ID,
      message: 'Gracias por el pair programming de ayer. Tu enfoque para resolver el bug de paginación fue muy elegante y me ayudó a pensar diferente sobre el problema.',
      category: 'problem_solver',
      date: '2026-05-26',
    },
    {
      from_user_id: USERS.andres.id,
      to_user_id: USERS.emilio.id,
      org_id: ORG_ID,
      message: 'Los skeleton loaders quedaron perfectos. La experiencia de carga mejoró muchísimo y fue súper fácil integrarlos en mis componentes.',
      category: 'helped_me',
      date: '2026-05-25',
    },
    {
      from_user_id: USERS.emilio.id,
      to_user_id: USERS.erik.id,
      org_id: ORG_ID,
      message: 'El code review que me hiciste del componente de heatmap fue muy detallado y aprendí mucho sobre optimización de renders. Gracias por tomarte el tiempo.',
      category: 'team_player',
      date: '2026-05-27',
    },
    {
      from_user_id: USERS.eugenio.id,
      to_user_id: USERS.exoma.id,
      org_id: ORG_ID,
      message: 'La claridad con la que definiste las prioridades del sprint hizo que todo el equipo pudiera enfocarse sin dudas. Se nota el liderazgo.',
      category: 'above_and_beyond',
      date: '2026-05-27',
    },
    {
      from_user_id: USERS.exoma.id,
      to_user_id: USERS.erik.id,
      org_id: ORG_ID,
      message: 'Resolviste el memory leak que llevaba semanas afectándonos. Eso es dedicación y habilidad técnica de primer nivel.',
      category: 'great_work',
      date: '2026-05-25',
    },
  ];

  return shoutouts;
}

// ============================================================
// Generate live status (3 users currently active)
// ============================================================

function generateLiveStatuses() {
  const now = new Date().toISOString();
  return [
    {
      user_id: USERS.erik.id,
      org_id: ORG_ID,
      status: 'deep_work',
      current_task: 'Implementando rate limiting por tenant',
      started_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
    {
      user_id: USERS.andres.id,
      org_id: ORG_ID,
      status: 'online',
      current_task: 'Trabajando en módulo de GitHub integration',
      started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
    {
      user_id: USERS.emilio.id,
      org_id: ORG_ID,
      status: 'deep_work',
      current_task: 'Implementando dark mode en componentes principales',
      started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      last_heartbeat: now,
    },
  ];
}

// ============================================================
// Generate activity streaks
// ============================================================

function generateStreaks() {
  return Object.entries(USERS).map(([key, user]) => {
    const streaks = {
      exoma:  { current: 12, longest: 25, total: 89 },
      erik:    { current: 18, longest: 30, total: 105 },
      andres:  { current: 7,  longest: 22, total: 78 },
      eugenio: { current: 15, longest: 20, total: 92 },
      emilio:  { current: 10, longest: 16, total: 64 },
    };

    const s = streaks[key];
    return {
      user_id: user.id,
      org_id: ORG_ID,
      current_streak: s.current,
      longest_streak: s.longest,
      last_active_date: '2026-05-27',
      total_days_logged: s.total,
      updated_at: new Date().toISOString(),
    };
  });
}

// ============================================================
// Main execution
// ============================================================

async function main() {
  console.log('=== Exomagram Seed Data ===\n');

  // 1. Time entries
  console.log('1. Generating time entries...');
  const timeEntries = generateTimeEntries();
  console.log(`   Generated ${timeEntries.length} time entries`);
  await supabaseInsert('time_entries', timeEntries);

  // 2. Standups
  console.log('\n2. Generating standups...');
  const standups = generateStandups();
  await supabaseInsert('standups', standups);

  // 3. Daily closeouts
  console.log('\n3. Generating daily closeouts...');
  const closeouts = generateCloseouts();
  await supabaseInsert('daily_closeouts', closeouts);

  // 4. Shoutouts
  console.log('\n4. Generating shoutouts...');
  const shoutouts = generateShoutouts();
  await supabaseInsert('shoutouts', shoutouts);

  // 5. Live status (upsert - these are primary keyed on user_id)
  console.log('\n5. Generating live statuses...');
  const liveStatuses = generateLiveStatuses();
  // Use upsert for live_status since it's keyed on user_id
  for (const status of liveStatuses) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/live_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(status),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`  ERROR inserting live_status for ${status.user_id}:`, res.status, text);
    }
  }
  console.log(`  ✓ Upserted ${liveStatuses.length} live statuses`);

  // 6. Activity streaks (upsert)
  console.log('\n6. Generating activity streaks...');
  const streaks = generateStreaks();
  for (const streak of streaks) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/activity_streaks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(streak),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`  ERROR inserting streak for ${streak.user_id}:`, res.status, text);
    }
  }
  console.log(`  ✓ Upserted ${streaks.length} activity streaks`);

  console.log('\n=== Seed complete! ===');
}

main().catch(console.error);
