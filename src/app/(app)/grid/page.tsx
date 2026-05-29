"use client";

import { useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { TeamGrid } from "@/components/grid/team-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";

export default function GridPage() {
 const { orgId, loading } = useOrg();
 const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

 const isToday = date === new Date().toISOString().split("T")[0];
 const displayDate = format(new Date(date +"T12:00:00"),"EEEE, d MMMM yyyy", {
 locale: es,
 });

 if (loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground">
 Primero crea o únete a un equipo desde el Dashboard.
 </p>
 </div>
 );
 }

 return (
 <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Vista de Equipo</h1>
 <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
 </div>

 {/* Date navigation */}
 <div className="flex items-center gap-2 mb-8 bg-card/80 border border-border/50 p-2 w-fit">
 <Button
 variant="ghost"size="icon"className=""onClick={() =>
 setDate(subDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0])
 }
 >
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <Input
 type="date"value={date}
 onChange={(e) => setDate(e.target.value)}
 className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto"/>
 <Button
 variant="ghost"size="icon"className=""onClick={() =>
 setDate(addDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0])
 }
 >
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {!isToday && (
 <Button
 variant="secondary"size="sm"className="text-xs font-semibold"onClick={() => setDate(new Date().toISOString().split("T")[0])}
 >
 Hoy
 </Button>
 )}
 </div>

 {/* Grid */}
 <TeamGrid date={date} orgId={orgId} />
 </div>
 );
}
