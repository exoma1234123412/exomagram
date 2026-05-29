// Seed script — run with: npx tsx scripts/seed.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ORG_ID = "04371022-2d43-4908-959e-cfc81c0172e7";

const USERS = [
  { id: "bdb0db8b-e08c-4cfb-a873-b8f50aa3e474", name: "EXOMAP", style: "leader" },
  { id: "9a8ba6e7-934f-4dc2-a69e-1a9efd65a485", name: "Erik", style: "consistent" },
  { id: "d4003fc5-3c26-457c-8e94-95729bba5cc3", name: "Andres", style: "slacker" },
  { id: "d417dd6f-d8ed-45a8-b5bb-b76675acae66", name: "Eugenio", style: "burst" },
  { id: "7b257057-da65-4192-b0cc-c5de9801955d", name: "Emilio", style: "steady" },
];

const CATEGORIES = ["deep_work", "meeting", "review", "admin", "planning", "learning", "break", "blocked"] as const;
const PROJECTS = ["landing-page", "api-v2", "onboarding", "mobile-app", "dashboard", "infra", null];

const TITLES: Record<string, string[]> = {
  deep_work: [
    "Implementé sistema de autenticación con JWT",
    "Refactorizé el módulo de pagos completo",
    "Diseñé la arquitectura del microservicio de notificaciones",
    "Optimizé queries de la base de datos principal",
    "Desarrollé el componente de dashboard en React",
    "Escribí tests unitarios para el API de usuarios",
    "Integré el servicio de envío de emails con SendGrid",
    "Migré la base de datos a la nueva versión del schema",
  ],
  meeting: [
    "Sprint planning con el equipo de producto",
    "Daily standup del equipo de desarrollo",
    "Revisión de arquitectura con el CTO",
    "Sesión de pair programming con Erik",
    "Reunión de alineación con stakeholders",
    "Demo del sprint al equipo de negocio",
  ],
  review: [
    "Code review del PR de autenticación",
    "Revisé el diseño del nuevo flujo de onboarding",
    "Feedback detallado sobre la propuesta técnica",
    "Revisé y aprobé 3 pull requests del equipo",
  ],
  admin: [
    "Organicé el backlog del sprint",
    "Actualicé la documentación del proyecto",
    "Configuré los permisos del repositorio",
    "Respondí emails y mensajes pendientes",
  ],
  planning: [
    "Diseñé el roadmap del Q3",
    "Estimación de tareas para el próximo sprint",
    "Creé los tickets de Jira para la nueva feature",
    "Definí los criterios de aceptación",
  ],
  learning: [
    "Investigué sobre nuevas herramientas de CI/CD",
    "Completé un módulo del curso de arquitectura",
    "Leí documentación de la nueva API de Supabase",
    "Practiqué patrones de diseño en TypeScript",
  ],
  break: ["Almuerzo", "Café y descanso", "Pausa para estirar"],
  blocked: [
    "Esperando respuesta del equipo de diseño",
    "Bloqueado por dependencia del servicio externo",
    "CI/CD roto — esperando fix de DevOps",
  ],
};

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate work pattern based on style
function generateDayEntries(userId: string, date: string, style: string) {
  const entries: any[] = [];
  let hoursToLog: number;
  let proofChance: number;
  let lateChance: number;

  switch (style) {
    case "leader":
      hoursToLog = randomInt(7, 10);
      proofChance = 0.9;
      lateChance = 0.05;
      break;
    case "consistent":
      hoursToLog = randomInt(7, 8);
      proofChance = 0.8;
      lateChance = 0.1;
      break;
    case "slacker":
      hoursToLog = randomInt(3, 6);
      proofChance = 0.3;
      lateChance = 0.5;
      break;
    case "burst":
      hoursToLog = Math.random() > 0.3 ? randomInt(8, 11) : randomInt(2, 4);
      proofChance = 0.7;
      lateChance = 0.2;
      break;
    case "steady":
      hoursToLog = randomInt(6, 8);
      proofChance = 0.6;
      lateChance = 0.15;
      break;
    default:
      hoursToLog = 8;
      proofChance = 0.5;
      lateChance = 0.1;
  }

  // Pick random hours from 7-18
  const availableHours = Array.from({ length: 12 }, (_, i) => i + 7);
  const selectedHours = availableHours
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(hoursToLog, 12));
  selectedHours.sort((a, b) => a - b);

  // Weighted category selection based on style
  const categoryWeights: Record<string, number[]> = {
    leader: [40, 15, 10, 10, 15, 5, 3, 2],
    consistent: [35, 20, 15, 10, 10, 5, 3, 2],
    slacker: [15, 10, 5, 25, 5, 5, 25, 10],
    burst: [50, 10, 10, 5, 10, 10, 3, 2],
    steady: [30, 15, 15, 15, 10, 10, 3, 2],
  };
  const weights = categoryWeights[style] || categoryWeights.steady;
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  function pickCategory(): typeof CATEGORIES[number] {
    let r = Math.random() * totalWeight;
    for (let i = 0; i < CATEGORIES.length; i++) {
      r -= weights[i];
      if (r <= 0) return CATEGORIES[i];
    }
    return CATEGORIES[0];
  }

  for (const hour of selectedHours) {
    const category = pickCategory();
    const titles = TITLES[category];
    const title = randomFrom(titles);
    const hasProof = Math.random() < proofChance;
    const isLate = Math.random() < lateChance;
    const minutesLate = isLate ? randomInt(15, 180) : 0;
    const mood = randomInt(2, 5) as 1 | 2 | 3 | 4 | 5;
    const energy = randomInt(2, 5) as 1 | 2 | 3 | 4 | 5;

    entries.push({
      user_id: userId,
      org_id: ORG_ID,
      date,
      hour,
      category,
      title,
      description: Math.random() > 0.5 ? `Detalles adicionales sobre: ${title.toLowerCase()}. Todo salió según lo planeado.` : null,
      mood,
      energy,
      links: null,
      project: randomFrom(PROJECTS),
      proof_urls: hasProof ? [`https://github.com/exoma/repo/pull/${randomInt(100, 999)}`] : null,
      is_late: isLate,
      minutes_late: minutesLate,
      logged_at: new Date(`${date}T${String(hour + 1).padStart(2, "0")}:${String(randomInt(0, 59)).padStart(2, "0")}:00`).toISOString(),
      verification_status: hasProof ? "unverified" : "unverified",
    });
  }

  return entries;
}

async function seed() {
  console.log("🌱 Seeding Exomagram...\n");

  // Generate dates: last 14 days (weekdays only)
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    dates.push(d.toISOString().split("T")[0]);
  }
  console.log(`📅 ${dates.length} workdays: ${dates[0]} to ${dates[dates.length - 1]}\n`);

  // 1. Ensure org_members exist
  console.log("👥 Setting up org members...");
  for (const user of USERS) {
    await supabase.from("org_members").upsert(
      { org_id: ORG_ID, user_id: user.id, role: user.name === "EXOMAP" ? "owner" : "member" },
      { onConflict: "org_id,user_id" }
    );
  }

  // 2. Generate time entries
  console.log("⏰ Generating time entries...");
  let totalEntries = 0;
  for (const date of dates) {
    for (const user of USERS) {
      const entries = generateDayEntries(user.id, date, user.style);
      const { error } = await supabase.from("time_entries").upsert(entries, { onConflict: "user_id,org_id,date,hour" });
      if (error) console.error(`  ❌ ${user.name} ${date}: ${error.message}`);
      else totalEntries += entries.length;
    }
  }
  console.log(`  ✅ ${totalEntries} entries created\n`);

  // 3. Generate daily closeouts
  console.log("📝 Generating daily closeouts...");
  let closeouts = 0;
  for (const date of dates) {
    for (const user of USERS) {
      // Leader and consistent always do closeouts, slacker rarely
      const doesCloseout = user.style === "leader" ? true
        : user.style === "consistent" ? Math.random() > 0.1
        : user.style === "slacker" ? Math.random() > 0.7
        : Math.random() > 0.3;

      if (!doesCloseout) continue;

      const { data: entries } = await supabase
        .from("time_entries")
        .select("id, proof_urls")
        .eq("user_id", user.id)
        .eq("org_id", ORG_ID)
        .eq("date", date);

      const hoursLogged = entries?.length ?? 0;
      const withProof = entries?.filter((e) => e.proof_urls && e.proof_urls.length > 0).length ?? 0;

      await supabase.from("daily_closeouts").upsert({
        user_id: user.id,
        org_id: ORG_ID,
        date,
        summary: `Día productivo. Completé ${hoursLogged} horas de trabajo. Avancé en las tareas principales del sprint.`,
        blockers: Math.random() > 0.7 ? "Esperando respuesta del equipo de diseño sobre los mockups" : null,
        tomorrow_plan: "Continuar con las tareas del sprint y revisar PRs pendientes",
        mood: randomInt(3, 5) as 1 | 2 | 3 | 4 | 5,
        hours_logged: hoursLogged,
        hours_with_proof: withProof,
      }, { onConflict: "user_id,org_id,date" });
      closeouts++;
    }
  }
  console.log(`  ✅ ${closeouts} closeouts created\n`);

  // 4. Generate reactions
  console.log("👍 Generating reactions...");
  let reactions = 0;
  const { data: allEntries } = await supabase
    .from("time_entries")
    .select("id, user_id")
    .eq("org_id", ORG_ID)
    .limit(500);

  if (allEntries) {
    for (const entry of allEntries) {
      if (Math.random() > 0.85) continue; // 15% of entries get reactions

      const reactors = USERS.filter((u) => u.id !== entry.user_id);
      const reactor = randomFrom(reactors);
      const reactionType = randomFrom(["verified", "verified", "impressive", "helped_me", "suspicious"] as const);

      const { error } = await supabase.from("entry_reactions").upsert({
        entry_id: entry.id,
        user_id: reactor.id,
        reaction: reactionType,
        comment: reactionType === "impressive" ? "Gran trabajo!" : reactionType === "suspicious" ? "Esto no me cuadra..." : null,
      }, { onConflict: "entry_id,user_id" });

      if (!error) reactions++;
    }
  }
  console.log(`  ✅ ${reactions} reactions created\n`);

  // 5. Generate activity streaks
  console.log("🔥 Setting up streaks...");
  const streakValues: Record<string, { current: number; longest: number; total: number }> = {
    leader: { current: 12, longest: 25, total: 45 },
    consistent: { current: 8, longest: 15, total: 38 },
    slacker: { current: 0, longest: 3, total: 12 },
    burst: { current: 4, longest: 10, total: 28 },
    steady: { current: 6, longest: 12, total: 32 },
  };
  for (const user of USERS) {
    const s = streakValues[user.style];
    await supabase.from("activity_streaks").upsert({
      user_id: user.id,
      org_id: ORG_ID,
      current_streak: s.current,
      longest_streak: s.longest,
      last_active_date: dates[dates.length - 1],
      total_days_logged: s.total,
    });
  }
  console.log(`  ✅ 5 streaks set\n`);

  // 6. Generate trust score history
  console.log("📊 Generating trust score history...");
  let scores = 0;
  for (const date of dates) {
    for (const user of USERS) {
      const { data: entries } = await supabase
        .from("time_entries")
        .select("proof_urls, is_late")
        .eq("user_id", user.id)
        .eq("org_id", ORG_ID)
        .eq("date", date);

      const total = entries?.length ?? 0;
      const withProof = entries?.filter((e) => e.proof_urls?.length > 0).length ?? 0;
      const late = entries?.filter((e) => e.is_late).length ?? 0;

      const hoursRatio = Math.min(total / 8, 1);
      const proofRatio = total > 0 ? withProof / total : 0;
      const latePenalty = total > 0 ? (late / total) * 0.2 : 0;
      const raw = hoursRatio * 0.4 + proofRatio * 0.4 + 0.05 - latePenalty;
      const score = Math.max(0, Math.min(100, Math.round(raw * 100)));

      await supabase.from("trust_score_history").upsert({
        user_id: user.id,
        org_id: ORG_ID,
        date,
        score,
        hours_logged: total,
        hours_with_proof: withProof,
        late_entries: late,
        has_closeout: true,
        suspicious_reactions: 0,
      }, { onConflict: "user_id,org_id,date" });
      scores++;
    }
  }
  console.log(`  ✅ ${scores} trust scores generated\n`);

  // 7. Generate achievements
  console.log("🏆 Granting achievements...");
  const achievementMap: Record<string, string[]> = {
    leader: ["streak_7", "proof_100", "zero_late", "closeout_streak", "high_trust", "helpful"],
    consistent: ["streak_7", "zero_late", "closeout_streak"],
    slacker: [],
    burst: ["streak_7", "impressive_10"],
    steady: ["streak_7", "closeout_streak"],
  };
  for (const user of USERS) {
    const achs = achievementMap[user.style] || [];
    for (const ach of achs) {
      await supabase.from("achievements").upsert({
        user_id: user.id,
        org_id: ORG_ID,
        achievement_type: ach,
      }, { onConflict: "user_id,org_id,achievement_type" });
    }
  }
  console.log(`  ✅ Achievements granted\n`);

  // 8. Set live status
  console.log("🟢 Setting live statuses...");
  const statuses = ["online", "online", "deep_work", "idle", "offline"];
  const tasks = [
    "Trabajando en el dashboard",
    "Revisando PRs",
    "Sesión de deep work",
    null,
    null,
  ];
  for (let i = 0; i < USERS.length; i++) {
    await supabase.from("live_status").upsert({
      user_id: USERS[i].id,
      org_id: ORG_ID,
      status: statuses[i],
      current_task: tasks[i],
      started_at: new Date().toISOString(),
      last_heartbeat: new Date(Date.now() - randomInt(0, 300) * 1000).toISOString(),
    });
  }
  console.log(`  ✅ Live statuses set\n`);

  // 9. Generate some accountability flags for the slacker
  console.log("🚩 Generating accountability flags...");
  const slacker = USERS.find((u) => u.style === "slacker")!;
  for (const date of dates.slice(-5)) {
    await supabase.from("accountability_flags").insert({
      user_id: slacker.id,
      org_id: ORG_ID,
      flag_type: randomFrom(["missing_hours", "no_proof", "late_entries", "no_closeout"]),
      date,
      details: "Registró menos de 8 horas y sin evidencia suficiente",
      resolved: false,
    });
  }
  console.log(`  ✅ Flags created for ${slacker.name}\n`);

  // 10. Generate notifications
  console.log("🔔 Creating notifications...");
  for (const user of USERS) {
    await supabase.from("notifications").insert([
      {
        user_id: user.id,
        org_id: ORG_ID,
        type: "streak_milestone",
        title: "Racha de 7 días 🔥",
        body: "Has mantenido tu racha por 7 días consecutivos",
        read: Math.random() > 0.5,
      },
      {
        user_id: user.id,
        org_id: ORG_ID,
        type: "reaction_received",
        title: "Nueva reacción ✅",
        body: "Alguien verificó tu entrada de hoy",
        read: Math.random() > 0.3,
      },
    ]);
  }
  console.log(`  ✅ Notifications created\n`);

  console.log("═══════════════════════════════════════");
  console.log("✅ SEED COMPLETE!");
  console.log(`   ${totalEntries} time entries`);
  console.log(`   ${closeouts} daily closeouts`);
  console.log(`   ${reactions} reactions`);
  console.log(`   ${scores} trust scores`);
  console.log(`   5 streaks`);
  console.log(`   5 live statuses`);
  console.log("═══════════════════════════════════════");
}

seed().catch(console.error);
