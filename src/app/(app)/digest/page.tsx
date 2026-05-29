"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Clock,
} from "lucide-react";

interface DigestMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  hours_logged: number;
  hours_with_proof: number;
  proof_percent: number;
  late_entries: number;
  has_closeout: boolean;
  trust_score: number;
  suspicious_reactions: number;
  flags: string[];
}

interface DigestData {
  date: string;
  team_avg_trust: number;
  total_members: number;
  members_with_flags: number;
  digest: DigestMember[];
}

export default function DigestPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    async function loadDigest() {
      setLoading(true);
      const res = await fetch(`/api/digest?org_id=${orgId}&date=${date}`);
      const json = await res.json();
      setData(json);
      setLoading(false);
    }
    loadDigest();
  }, [orgId, date]);

  const isToday = date === new Date().toISOString().split("T")[0];
  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" />
            Digest diario
          </h1>
          <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2 mb-8">
        <Button variant="outline" size="icon"
          onClick={() => setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon"
          onClick={() => {
            const next = new Date(date + "T12:00:00");
            next.setDate(next.getDate() + 1);
            setDate(next.toISOString().split("T")[0]);
          }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
            Hoy
          </Button>
        )}
      </div>

      {orgLoading || loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className={cn("text-3xl font-bold tabular-nums tracking-tight",
                  data.team_avg_trust >= 70 ? "text-green-600" :
                  data.team_avg_trust >= 50 ? "text-yellow-600" : "text-red-600"
                )}>
                  {data.team_avg_trust}
                </p>
                <p className="text-xs text-muted-foreground">Trust promedio</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold tabular-nums tracking-tight">{data.total_members}</p>
                <p className="text-xs text-muted-foreground">Miembros</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className={cn("text-3xl font-bold tabular-nums tracking-tight",
                  data.members_with_flags > 0 ? "text-red-600" : "text-green-600"
                )}>
                  {data.members_with_flags}
                </p>
                <p className="text-xs text-muted-foreground">Con alertas</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-member */}
          <div className="space-y-3">
            {data.digest.map((m) => (
              <Card key={m.user_id} className={cn(
                "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                m.flags.length > 2 && "border-red-200 dark:border-red-900",
                m.trust_score >= 80 && m.flags.length === 0 && "border-green-200 dark:border-green-900"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <p className={cn("text-2xl font-bold tabular-nums tracking-tight",
                        m.trust_score >= 80 ? "text-green-600" :
                        m.trust_score >= 50 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {m.trust_score}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Trust</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{m.full_name ?? m.email}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {m.hours_logged}h
                        </span>
                        <span className={cn("flex items-center gap-1",
                          m.proof_percent >= 80 ? "text-green-600" : "text-yellow-600"
                        )}>
                          <Shield className="w-3 h-3" /> {m.proof_percent}%
                        </span>
                        <span>{m.has_closeout ? <CheckCircle2 className="w-3 h-3 text-green-600 inline" /> : <AlertTriangle className="w-3 h-3 text-yellow-600 inline" />} Cierre</span>
                      </div>
                      {m.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {m.flags.map((f) => (
                            <Badge key={f} variant="destructive" className="text-[10px]">{f.replace(/_/g, " ")}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
