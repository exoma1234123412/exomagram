// @ts-nocheck
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

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
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-sky-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950" />
      <div className="absolute inset-0 bg-grid-pattern opacity-40" />

      {/* Decorative blobs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-200/30 dark:bg-blue-900/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-300/20 dark:bg-blue-900/8 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative shadow-2xl shadow-blue-600/10 border-border/50">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mb-1 shadow-xl shadow-blue-600/25">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">Exomagram</CardTitle>
            <CardDescription className="text-muted-foreground/80">Transparencia total del trabajo de tu equipo</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 rounded-xl"
              />
            </div>
            {error && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 font-semibold"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Iniciar sesión"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-6">
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="text-primary hover:text-primary/80 hover:underline font-semibold transition-colors">
              Crear cuenta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
