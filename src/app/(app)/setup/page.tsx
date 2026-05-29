// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, ArrowRight } from "lucide-react";

function formatHour(h: number) {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h > 12) return `${h - 12}:00 PM`;
  return `${h}:00 AM`;
}

export default function SetupPage() {
  const [startHour, setStartHour] = useState<string>("");
  const [endHour, setEndHour] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startHour || !endHour) return;

    const start = parseInt(startHour);
    const end = parseInt(endHour);

    if (end <= start) {
      setError("La hora de salida debe ser después de la hora de entrada.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("No se pudo obtener el usuario.");
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          work_start_hour: start,
          work_end_hour: end,
          setup_completed: true,
        })
        .eq("id", user.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      router.push("/home");
    } catch (err) {
      setError("Error inesperado al guardar.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 shadow-sm">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center mx-auto mb-4">
              <Clock className="w-6 h-6 text-background" />
            </div>
            <h1 className="text-xl font-medium">Configura tu horario</h1>
            <p className="text-sm text-muted-foreground mt-2">
              ¿A qué hora empiezas y terminas tu jornada laboral?
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entrada</Label>
                <Select value={startHour} onValueChange={(v) => v && setStartHour(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Hora" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => i + 5).map((h) => (
                      <SelectItem key={h} value={h.toString()}>
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Salida</Label>
                <Select value={endHour} onValueChange={(v) => v && setEndHour(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Hora" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 12).map((h) => (
                      <SelectItem key={h} value={h.toString()}>
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Esto define cuándo el sistema espera que registres horas. Puedes cambiarlo después en ajustes.
            </p>

            <Button
              type="submit"
              className="w-full gap-2"
              disabled={saving || !startHour || !endHour}
            >
              {saving ? "Guardando..." : "Continuar"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
