import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default async function PublicDashboard({
 params,
}: {
 params: Promise<{ token: string }>;
}) {
 const { token } = await params;
 const supabase = await createClient();

 // Find the public dashboard by token
 const { data: dashboard } = await supabase
 .from("public_dashboards")
 .select("*, organizations(name)")
 .eq("token", token)
 .eq("active", true)
 .single();

 if (!dashboard) return notFound();

 const today = new Date().toISOString().split("T")[0];
 const orgName = (dashboard.organizations as Record<string, unknown>)?.name as string ??"Equipo";

 // Get today's entries
 const { data: entries } = await supabase
 .from("time_entries")
 .select("*, profiles(full_name, role)")
 .eq("org_id", dashboard.org_id)
 .eq("date", today)
 .order("hour", { ascending: false });

 // Get members count
 const { count: memberCount } = await supabase
 .from("org_members")
 .select("id", { count:"exact", head: true })
 .eq("org_id", dashboard.org_id);

 // Stats
 const totalHours = entries?.length ?? 0;
 const withProof = entries?.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length ?? 0;
 const proofPercent = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;

 // By category
 const catCounts = new Map<string, number>();
 for (const e of entries ?? []) {
 catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
 }

 // Active members today
 const activeMembers = new Set((entries ?? []).map((e) => e.user_id)).size;

 return (
 <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950">
 <div className="max-w-4xl mx-auto px-4 py-12">
 {/* Header */}
 <div className="text-center mb-12">
 <div className="w-12 h-12 bg-primary flex items-center justify-center mx-auto mb-4">
 <span className="text-white font-bold text-xl">E</span>
 </div>
 <h1 className="text-3xl font-bold">{orgName}</h1>
 <p className="text-muted-foreground mt-2 capitalize">
 {format(new Date(),"EEEE, d MMMM yyyy", { locale: es })}
 </p>
 <p className="text-xs text-muted-foreground/60 mt-1">
 Dashboard público de transparencia — Powered by Exomagram
 </p>
 </div>

 {/* Summary cards */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
 <div className="bg-white dark:bg-gray-800 p-6 text-center">
 <p className="text-3xl font-bold text-primary">{totalHours}</p>
 <p className="text-sm text-muted-foreground">Horas registradas</p>
 </div>
 <div className="bg-white dark:bg-gray-800 p-6 text-center">
 <p className="text-3xl font-bold text-blue-600">{activeMembers}/{memberCount ?? 0}</p>
 <p className="text-sm text-muted-foreground">Miembros activos</p>
 </div>
 <div className="bg-white dark:bg-gray-800 p-6 text-center">
 <p className={`text-3xl font-bold ${proofPercent >= 70 ?"text-green-600":"text-yellow-600"}`}>
 {proofPercent}%
 </p>
 <p className="text-sm text-muted-foreground">Con evidencia</p>
 </div>
 <div className="bg-white dark:bg-gray-800 p-6 text-center">
 <p className="text-3xl font-bold text-emerald-600">{catCounts.size}</p>
 <p className="text-sm text-muted-foreground">Categorías activas</p>
 </div>
 </div>

 {/* Category breakdown */}
 <div className="bg-white dark:bg-gray-800 p-6 mb-8">
 <h2 className="font-semibold text-lg mb-4">Distribución del trabajo</h2>
 <div className="space-y-3">
 {Array.from(catCounts.entries())
 .sort((a, b) => b[1] - a[1])
 .map(([cat, count]) => {
 const catInfo = CATEGORIES[cat as WorkCategory];
 const percent = Math.round((count / totalHours) * 100);
 return (
 <div key={cat}>
 <div className="flex justify-between text-sm mb-1">
 <span>{catInfo?.emoji} {catInfo?.label ?? cat}</span>
 <span className="text-muted-foreground">{count}h ({percent}%)</span>
 </div>
 <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
 <div className="h-full bg-blue-500 rounded-full"style={{ width:`${percent}%`}} />
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Recent entries (if show_details is on) */}
 {dashboard.show_details && (
 <div className="bg-white dark:bg-gray-800 p-6">
 <h2 className="font-semibold text-lg mb-4">Actividad reciente</h2>
 <div className="space-y-3">
 {(entries ?? []).slice(0, 20).map((e) => {
 const catInfo = CATEGORIES[e.category as WorkCategory];
 const profile = e.profiles as Record<string, unknown> | null;
 const hasProof = e.proof_urls && (e.proof_urls as string[]).length > 0;
 return (
 <div key={e.id} className="flex items-center gap-3 py-2 border-b last:border-0">
 <span className="text-xs text-muted-foreground w-16">{e.hour}:00</span>
 <span>{catInfo?.emoji}</span>
 <div className="flex-1 min-w-0">
 <p className="text-sm truncate">{e.title}</p>
 {dashboard.show_names && profile?.full_name && (
 <p className="text-xs text-muted-foreground">{profile.full_name as string}</p>
 )}
 </div>
 {hasProof && <span className="text-green-500 text-xs">✓ evidencia</span>}
 {e.is_late && <span className="text-orange-500 text-xs">tardía</span>}
 </div>
 );
 })}
 </div>
 </div>
 )}

 <p className="text-center text-xs text-muted-foreground mt-12">
 Exomagram — Transparencia total del trabajo
 </p>
 </div>
 </div>
 );
}
