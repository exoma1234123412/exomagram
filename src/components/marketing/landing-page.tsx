import Link from "next/link";
import {
 Clock,
 Shield,
 Eye,
 Brain,
 Sparkles,
 ArrowRight,
 Users,
 BarChart3,
 Zap,
} from "lucide-react";

export default function LandingPage() {
 return (
 <div className="min-h-screen bg-background">
 {/* Nav */}
 <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 glass">
 <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 bg-primary flex items-center justify-center">
 <Clock className="w-4 h-4 text-white"/>
 </div>
 <span className="font-bold text-lg tracking-tight">Exomagram</span>
 </div>
 <div className="flex items-center gap-3">
 <Link href="/login"className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
 Iniciar sesion
 </Link>
 <Link
 href="/signup"className="text-sm font-semibold px-4 py-2 bg-primary text-white hover:shadow-blue-600/40 transition-all">
 Empezar gratis
 </Link>
 </div>
 </div>
 </nav>

 {/* Hero */}
 <section className="pt-32 pb-20 px-6 relative overflow-hidden">
 <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-background to-background"/>
 <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-200/20 dark:bg-blue-900/10 rounded-full blur-3xl"/>
 <div className="absolute top-40 right-1/4 w-96 h-96 bg-blue-300/15 dark:bg-blue-900/8 rounded-full blur-3xl"/>

 <div className="max-w-4xl mx-auto text-center relative">
 <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
 <Zap className="w-4 h-4"/>
 Transparencia radical para equipos
 </div>

 <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
 Ve exactamente{" "}
 <span className="bg-primary bg-clip-text text-transparent">
 que hace
 </span>{" "}
 tu equipo,{" "}
 <span className="bg-primary bg-clip-text text-transparent">
 hora por hora
 </span>
 </h1>

 <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
 No mas reportes vagos. No mas &quot;estuve trabajando en cosas&quot;.
 Exomagram muestra el trabajo real con evidencia, en tiempo real,
 y detecta automaticamente cuando alguien no esta siendo transparente.
 </p>

 <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
 <Link
 href="/signup"className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white font-semibold text-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-105">
 Empezar gratis <ArrowRight className="w-5 h-5"/>
 </Link>
 <Link
 href="/login"className="inline-flex items-center gap-2 px-8 py-4 border-2 border-border font-semibold text-lg hover:bg-accent transition-all">
 Ya tengo cuenta
 </Link>
 </div>
 </div>
 </section>

 {/* Features grid */}
 <section className="py-20 px-6">
 <div className="max-w-6xl mx-auto">
 <div className="text-center mb-16">
 <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
 Todo lo que necesitas para accountability total
 </h2>
 <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
 No es un timesheet. Es un sistema completo de transparencia con AI, deteccion de fraude, y metricas que importan.
 </p>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {[
 {
 icon: <Eye className="w-6 h-6"/>,
 title:"Timeline en vivo",
 desc:"Ve que hace cada persona ahora mismo. Actualizaciones en tiempo real via WebSockets.",
 color:"from-blue-500 to-blue-600",
 },
 {
 icon: <Shield className="w-6 h-6"/>,
 title:"Prueba de trabajo",
 desc:"Cada entrada requiere evidencia: links a commits, PRs, documentos. Sin evidencia = marcado.",
 color:"from-green-500 to-emerald-600",
 },
 {
 icon: <Brain className="w-6 h-6"/>,
 title:"AI Anti-Fraude",
 desc:"Detecta copy-paste, backfill masivo, titulos genericos, y patrones sospechosos automaticamente.",
 color:"from-blue-500 to-cyan-600",
 },
 {
 icon: <BarChart3 className="w-6 h-6"/>,
 title:"Trust Score",
 desc:"Cada miembro tiene un score de 0-100 basado en horas, evidencia, puntualidad y peer reviews.",
 color:"from-amber-500 to-orange-600",
 },
 {
 icon: <Users className="w-6 h-6"/>,
 title:"Peer Verification",
 desc:"Tu equipo puede verificar o marcar como sospechosa cualquier entrada. Accountability entre pares.",
 color:"from-pink-500 to-rose-600",
 },
 {
 icon: <Sparkles className="w-6 h-6"/>,
 title:"War Room",
 desc:"Pantalla full-screen para la TV de la oficina. Muestra actividad en vivo como un centro de mision.",
 color:"from-indigo-500 to-purple-600",
 },
 ].map((feature, i) => (
 <div
 key={i}
 className="group p-6 border border-border/50 bg-card hover: hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
 <div className={`w-12 h-12 bg-gradient-to-br ${feature.color} flex items-center justify-center text-white mb-4`}>
 {feature.icon}
 </div>
 <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
 <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* How it works */}
 <section className="py-20 px-6 bg-accent/30">
 <div className="max-w-4xl mx-auto">
 <h2 className="text-3xl font-bold tracking-tight text-center mb-16">Como funciona</h2>

 <div className="space-y-12">
 {[
 {
 step:"01",
 title:"Registra tu hora en 10 segundos",
 desc:"Selecciona categoria, escribe que hiciste, adjunta evidencia. Listo. Quick Log lo hace aun mas rapido.",
 },
 {
 step:"02",
 title:"Tu equipo ve todo en tiempo real",
 desc:"Timeline en vivo, grid de equipo, live status. Nadie puede esconderse.",
 },
 {
 step:"03",
 title:"AI detecta lo sospechoso",
 desc:"Copy-paste, backfill masivo, titulos genericos, falta de evidencia. Todo se flagea automaticamente.",
 },
 {
 step:"04",
 title:"Trust Score habla por ti",
 desc:"Tu score de 0-100 resume tu transparencia. Leaderboard, tendencias, streaks. Los mejores brillan.",
 },
 ].map((item, i) => (
 <div key={i} className="flex gap-6 items-start">
 <div className="w-14 h-14 bg-primary flex items-center justify-center text-white font-bold text-lg shrink-0">
 {item.step}
 </div>
 <div>
 <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
 <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* CTA */}
 <section className="py-24 px-6">
 <div className="max-w-3xl mx-auto text-center">
 <h2 className="text-4xl font-bold tracking-tight mb-6">
 Deja de adivinar.<br />Empieza a ver.
 </h2>
 <p className="text-lg text-muted-foreground mb-10">
 Exomagram es gratis para equipos de hasta 5 personas. Sin tarjeta de credito.
 </p>
 <Link
 href="/signup"className="inline-flex items-center gap-2 px-10 py-5 bg-primary text-white font-semibold text-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-105">
 Crear cuenta gratis <ArrowRight className="w-5 h-5"/>
 </Link>
 </div>
 </section>

 {/* Footer */}
 <footer className="border-t py-8 px-6">
 <div className="max-w-6xl mx-auto flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
 <Clock className="w-3 h-3 text-white"/>
 </div>
 <span className="text-sm font-semibold">Exomagram</span>
 </div>
 <p className="text-xs text-muted-foreground">Transparencia total del trabajo</p>
 </div>
 </footer>
 </div>
 );
}
