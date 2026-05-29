"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, Mail, ArrowLeft, Check } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
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
      setSent(true);
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
            <CardTitle className="text-xl font-medium tracking-tight">
              Recuperar contraseña
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Ingresa tu correo para recibir un enlace de recuperación
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {sent ? (
            <div className="space-y-4">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-4 text-center space-y-2">
                <div className="mx-auto w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                  Revisa tu correo. Te enviamos un enlace para restablecer tu
                  contraseña.
                </p>
              </div>
              <Link href="/login">
                <Button
                  variant="outline"
                  className="w-full h-10 rounded-xl font-medium mt-2"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Volver al inicio de sesión
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-10 rounded-xl pl-9"
                    />
                  </div>
                </div>
                {error && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
                    <p className="text-sm text-destructive font-medium">
                      {error}
                    </p>
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-10 rounded-xl font-medium"
                  disabled={loading}
                >
                  {loading
                    ? "Enviando..."
                    : "Enviar enlace de recuperación"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                <Link
                  href="/login"
                  className="text-foreground hover:underline font-medium transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Volver al inicio de sesión
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
