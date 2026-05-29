"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/feed");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background bg-grid-palantir relative overflow-hidden">
      {/* Ambient accent lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
      </div>

      <Card className="w-full max-w-md border-border/60 shadow-none relative corner-marks">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto relative">
            <Logo size={56} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px] shadow-primary/60" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-lg font-mono font-black tracking-[0.15em] uppercase">Exomagram</CardTitle>
            <CardDescription className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Sistema de Vigilancia
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase text-muted-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase text-muted-foreground">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 font-mono text-sm"
              />
            </div>
            {error && (
              <div className="bg-destructive/5 border border-destructive/30 px-3 py-2">
                <p className="text-xs font-mono text-destructive font-medium">{error}</p>
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-10 font-mono font-bold text-xs tracking-[0.1em] uppercase"
              disabled={loading}
            >
              {loading ? "Verificando..." : "Acceder al sistema"}
            </Button>
          </form>
          <p className="text-center text-[10px] font-mono text-muted-foreground mt-4">
            <Link href="/forgot-password" className="text-foreground/70 hover:text-primary transition-colors underline underline-offset-2">
              Recuperar acceso
            </Link>
          </p>
          <p className="text-center text-[10px] font-mono text-muted-foreground mt-2">
            Sin acceso?{" "}
            <Link href="/signup" className="text-foreground/70 hover:text-primary transition-colors underline underline-offset-2">
              Solicitar cuenta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
