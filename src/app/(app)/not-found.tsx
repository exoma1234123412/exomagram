import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="relative max-w-md w-full border border-border p-8 space-y-6">
        {/* Corner marks */}
        <span className="absolute -top-px -left-px w-3 h-3 border-t border-l border-primary" />
        <span className="absolute -top-px -right-px w-3 h-3 border-t border-r border-primary" />
        <span className="absolute -bottom-px -left-px w-3 h-3 border-b border-l border-primary" />
        <span className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-primary" />

        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={40} />
          <div className="space-y-1">
            <h2 className="font-mono text-xl font-bold uppercase tracking-tight">
              404 — SECTOR NO ENCONTRADO
            </h2>
            <p className="text-sm font-mono text-muted-foreground">
              Esta ruta no existe en el sistema de vigilancia.
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <Button className="font-mono text-xs bg-primary" render={<Link href="/dashboard" />}>
            Volver al Centro de Mando
          </Button>
        </div>
      </div>
    </div>
  );
}
