"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Check,
  X,
  Sparkles,
  Building2,
  Users,
  Zap,
  Crown,
  ChevronDown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & data                                                       */
/* ------------------------------------------------------------------ */

interface Tier {
  id: string;
  name: string;
  tagline: string;
  icon: React.ReactNode;
  monthlyPrice: number | null; // null = "Contactar"
  perUser: boolean;
  popular: boolean;
  cta: string;
  ctaHref: string;
  features: string[];
}

const tiers: Tier[] = [
  {
    id: "free",
    name: "Starter",
    tagline: "Para equipos pequenos que empiezan con transparencia",
    icon: <Zap className="w-5 h-5" />,
    monthlyPrice: 0,
    perUser: false,
    popular: false,
    cta: "Empezar gratis",
    ctaHref: "/signup",
    features: [
      "Hasta 5 miembros",
      "Time tracking basico",
      "Closeouts diarios",
      "Retencion de datos: 7 dias",
      "Soporte comunidad",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para equipos que necesitan accountability real",
    icon: <Crown className="w-5 h-5" />,
    monthlyPrice: 8,
    perUser: true,
    popular: true,
    cta: "Comenzar prueba",
    ctaHref: "/signup?plan=pro",
    features: [
      "Hasta 25 miembros",
      "Todo lo de Starter",
      "Flags de accountability & trust scores",
      "Reportes semanales & insights",
      "Seguimiento de proyectos",
      "Integraciones (GitHub, Slack)",
      "Exportar CSV",
      "Soporte prioritario",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Para organizaciones que exigen control total",
    icon: <Building2 className="w-5 h-5" />,
    monthlyPrice: 15,
    perUser: true,
    popular: false,
    cta: "Contactar ventas",
    ctaHref: "/signup?plan=enterprise",
    features: [
      "Miembros ilimitados",
      "Todo lo de Pro",
      "Revisiones & narrativas con IA",
      "Reglas de flags personalizadas",
      "SSO / SAML (proximamente)",
      "Dashboards publicos",
      "Acceso API",
      "Branding personalizado",
      "Soporte dedicado",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Feature comparison rows                                            */
/* ------------------------------------------------------------------ */

interface ComparisonRow {
  feature: string;
  free: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

const comparisonRows: ComparisonRow[] = [
  { feature: "Miembros del equipo", free: "Hasta 5", pro: "Hasta 25", enterprise: "Ilimitados" },
  { feature: "Time tracking", free: true, pro: true, enterprise: true },
  { feature: "Closeouts diarios", free: true, pro: true, enterprise: true },
  { feature: "Retencion de datos", free: "7 dias", pro: "Ilimitada", enterprise: "Ilimitada" },
  { feature: "Flags de accountability", free: false, pro: true, enterprise: true },
  { feature: "Trust scores", free: false, pro: true, enterprise: true },
  { feature: "Reportes semanales", free: false, pro: true, enterprise: true },
  { feature: "Seguimiento de proyectos", free: false, pro: true, enterprise: true },
  { feature: "Integraciones (GitHub, Slack)", free: false, pro: true, enterprise: true },
  { feature: "Exportar CSV", free: false, pro: true, enterprise: true },
  { feature: "Revisiones con IA", free: false, pro: false, enterprise: true },
  { feature: "Reglas de flags personalizadas", free: false, pro: false, enterprise: true },
  { feature: "SSO / SAML", free: false, pro: false, enterprise: "Proximamente" },
  { feature: "Dashboards publicos", free: false, pro: false, enterprise: true },
  { feature: "Acceso API", free: false, pro: false, enterprise: true },
  { feature: "Branding personalizado", free: false, pro: false, enterprise: true },
  { feature: "Soporte", free: "Comunidad", pro: "Prioritario", enterprise: "Dedicado" },
];

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

interface FaqItem {
  q: string;
  a: string;
}

const faqs: FaqItem[] = [
  {
    q: "¿Puedo probar el plan Pro gratis?",
    a: "Si. Ofrecemos 14 dias de prueba gratuita en el plan Pro sin necesidad de tarjeta de credito. Al terminar, tu cuenta vuelve automaticamente al plan Starter.",
  },
  {
    q: "¿Como funciona la facturacion anual?",
    a: "Al elegir facturacion anual obtienes un 20% de descuento sobre el precio mensual. Se cobra un unico pago al inicio del periodo y se renueva automaticamente.",
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Si. Puedes subir o bajar de plan cuando quieras. Si subes, el cambio es inmediato y se prorratea. Si bajas, el cambio aplica al final del ciclo de facturacion actual.",
  },
  {
    q: "¿Que metodos de pago aceptan?",
    a: "Aceptamos todas las tarjetas de credito y debito principales (Visa, Mastercard, Amex). Para Enterprise tambien ofrecemos facturacion por transferencia bancaria.",
  },
  {
    q: "¿Que pasa con mis datos si cancelo?",
    a: "Tus datos se conservan por 30 dias despues de cancelar. Puedes exportarlos en cualquier momento. Pasados los 30 dias se eliminan permanentemente.",
  },
  {
    q: "¿Ofrecen descuentos para startups o educacion?",
    a: "Si. Ofrecemos un 50% de descuento para startups en etapa temprana y organizaciones educativas. Contactanos para obtener el descuento.",
  },
];

/* ------------------------------------------------------------------ */
/*  Helper: render comparison cell                                     */
/* ------------------------------------------------------------------ */

function ComparisonCell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30">
        <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted">
        <X className="w-3.5 h-3.5 text-muted-foreground/50" />
      </span>
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function displayPrice(tier: Tier): string {
    if (tier.monthlyPrice === null) return "Contactar";
    if (tier.monthlyPrice === 0) return "$0";
    const price = annual
      ? Math.round(tier.monthlyPrice * 0.8 * 100) / 100
      : tier.monthlyPrice;
    return `$${price % 1 === 0 ? price : price.toFixed(2)}`;
  }

  function displayPeriod(tier: Tier): string {
    if (tier.monthlyPrice === null || tier.monthlyPrice === 0) return "";
    return tier.perUser ? "/usuario/mes" : "/mes";
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-16 space-y-20">
      {/* ----------------------------------------------------------- */}
      {/*  Header                                                      */}
      {/* ----------------------------------------------------------- */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <Sparkles className="w-4 h-4" />
          Precios simples y transparentes
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Elige el plan ideal para tu equipo
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Comienza gratis y escala cuando necesites. Sin sorpresas, sin costos ocultos.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <span
            className={cn(
              "text-sm font-medium transition-colors",
              !annual ? "text-foreground" : "text-muted-foreground"
            )}
          >
            Mensual
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            onClick={() => setAnnual(!annual)}
            className={cn(
              "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              annual
                ? "bg-gradient-to-r from-blue-600 to-blue-700"
                : "bg-muted"
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform",
                annual ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
          <span
            className={cn(
              "text-sm font-medium transition-colors",
              annual ? "text-foreground" : "text-muted-foreground"
            )}
          >
            Anual
          </span>
          {annual && (
            <Badge variant="secondary" className="text-xs">
              20% off
            </Badge>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- */}
      {/*  Pricing cards                                               */}
      {/* ----------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {tiers.map((tier) => {
          const isPopular = tier.popular;
          return (
            <Card
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl transition-all duration-300",
                isPopular
                  ? "border-2 border-blue-500 shadow-xl shadow-blue-600/10 scale-[1.02] md:scale-105"
                  : "hover:shadow-lg hover:-translate-y-1"
              )}
            >
              {/* Most popular badge */}
              {isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0 px-3 py-1 text-xs font-semibold shadow-lg shadow-blue-600/25">
                    Mas Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="space-y-3 pt-6">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg",
                      tier.id === "free"
                        ? "bg-gradient-to-br from-gray-500 to-gray-700"
                        : tier.id === "pro"
                          ? "bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-600/25"
                          : "bg-gradient-to-br from-indigo-500 to-purple-700 shadow-purple-600/25"
                    )}
                  >
                    {tier.icon}
                  </div>
                  <CardTitle className="text-xl font-bold">
                    {tier.name}
                  </CardTitle>
                </div>
                <CardDescription className="text-sm min-h-[40px]">
                  {tier.tagline}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col gap-6">
                {/* Price */}
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">
                    {displayPrice(tier)}
                  </span>
                  {displayPeriod(tier) && (
                    <span className="text-sm text-muted-foreground">
                      {displayPeriod(tier)}
                    </span>
                  )}
                </div>

                {annual && tier.monthlyPrice !== null && tier.monthlyPrice > 0 && (
                  <p className="text-xs text-muted-foreground -mt-4">
                    ${Math.round(tier.monthlyPrice * 0.8 * 12)} facturado anualmente
                  </p>
                )}

                {/* CTA */}
                <Link href={tier.ctaHref} className="w-full">
                  {isPopular ? (
                    <span className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-[1.02] text-sm">
                      {tier.cta}
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full rounded-2xl h-12 text-sm font-semibold"
                    >
                      {tier.cta}
                    </Button>
                  )}
                </Link>

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {tier.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className={cn(
                          "w-4 h-4 mt-0.5 shrink-0",
                          isPopular
                            ? "text-blue-500"
                            : "text-green-500 dark:text-green-400"
                        )}
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ----------------------------------------------------------- */}
      {/*  Feature comparison table                                    */}
      {/* ----------------------------------------------------------- */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">
            Compara todos los planes
          </h2>
          <p className="text-muted-foreground">
            Vista detallada de lo que incluye cada plan
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40">
                <th className="text-left font-semibold px-4 md:px-6 py-4 min-w-[200px]">
                  Caracteristica
                </th>
                <th className="text-center font-semibold px-4 md:px-6 py-4 w-[140px]">
                  <div className="flex flex-col items-center gap-1">
                    <Zap className="w-4 h-4 text-gray-500" />
                    Starter
                  </div>
                </th>
                <th className="text-center font-semibold px-4 md:px-6 py-4 w-[140px] bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex flex-col items-center gap-1">
                    <Crown className="w-4 h-4 text-blue-500" />
                    Pro
                  </div>
                </th>
                <th className="text-center font-semibold px-4 md:px-6 py-4 w-[140px]">
                  <div className="flex flex-col items-center gap-1">
                    <Building2 className="w-4 h-4 text-purple-500" />
                    Enterprise
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-border/30 transition-colors hover:bg-muted/30",
                    i === comparisonRows.length - 1 && "border-b-0"
                  )}
                >
                  <td className="px-4 md:px-6 py-3.5 font-medium">
                    {row.feature}
                  </td>
                  <td className="px-4 md:px-6 py-3.5 text-center">
                    <div className="flex justify-center">
                      <ComparisonCell value={row.free} />
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-3.5 text-center bg-blue-50/30 dark:bg-blue-950/10">
                    <div className="flex justify-center">
                      <ComparisonCell value={row.pro} />
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-3.5 text-center">
                    <div className="flex justify-center">
                      <ComparisonCell value={row.enterprise} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/*  FAQ section                                                 */}
      {/* ----------------------------------------------------------- */}
      <section className="space-y-8 max-w-3xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">
            Preguntas frecuentes
          </h2>
          <p className="text-muted-foreground">
            Todo lo que necesitas saber sobre precios y facturacion
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <div
                key={i}
                className="rounded-2xl border border-border/50 bg-card overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold hover:bg-muted/30 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-200",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/*  Bottom CTA                                                  */}
      {/* ----------------------------------------------------------- */}
      <section className="text-center space-y-6 pb-10">
        <h2 className="text-3xl font-bold tracking-tight">
          ¿Listo para transparencia total?
        </h2>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Comienza gratis con tu equipo. Sin tarjeta de credito, sin compromisos.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-lg shadow-xl shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-105"
          >
            <Users className="w-5 h-5" />
            Empezar gratis
          </Link>
          <Link
            href="/signup?plan=enterprise"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border-2 border-border font-semibold text-lg hover:bg-accent transition-all"
          >
            Contactar ventas
          </Link>
        </div>
      </section>
    </div>
  );
}
