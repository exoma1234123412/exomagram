"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md border-border/50 shadow-sm">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-1">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl font-medium tracking-tight">Recuperar contraseña</CardTitle>
            <CardDescription className="text-muted-foreground">
              Ingresa tu email y te enviaremos un link para restablecer tu contraseña
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {success ? (
            <div className="space-y-4">
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl px-3 py-3">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                  Revisa tu correo. Te enviamos un link para restablecer tu contraseña.
                </p>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-foreground hover:underline font-medium transition-colors">
                  Volver a iniciar sesión
                </Link>
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                {error && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-10 rounded-xl font-medium"
                  disabled={loading}
                >
                  {loading ? "Enviando..." : "Enviar link de recuperación"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-6">
                <Link href="/login" className="text-foreground hover:underline font-medium transition-colors">
                  Volver a iniciar sesión
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
