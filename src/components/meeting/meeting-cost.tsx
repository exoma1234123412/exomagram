"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DollarSign, Play, Pause, RotateCcw, Users, Clock } from "lucide-react";

// Meeting cost calculator — shows real-time cost of a meeting
export function MeetingCostCalculator() {
 const [attendees, setAttendees] = useState(3);
 const [avgHourlyCost, setAvgHourlyCost] = useState(50); // USD
 const [isRunning, setIsRunning] = useState(false);
 const [elapsedSeconds, setElapsedSeconds] = useState(0);
 const intervalRef = useRef<NodeJS.Timeout | null>(null);

 useEffect(() => {
 if (isRunning) {
 intervalRef.current = setInterval(() => {
 setElapsedSeconds((prev) => prev + 1);
 }, 1000);
 }
 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 };
 }, [isRunning]);

 const costPerSecond = (attendees * avgHourlyCost) / 3600;
 const totalCost = costPerSecond * elapsedSeconds;
 const minutes = Math.floor(elapsedSeconds / 60);
 const seconds = elapsedSeconds % 60;

 // Thresholds
 const isExpensive = totalCost > avgHourlyCost; // More than 1 person-hour
 const isVeryExpensive = totalCost > avgHourlyCost * 2;

 function reset() {
 setIsRunning(false);
 setElapsedSeconds(0);
 if (intervalRef.current) clearInterval(intervalRef.current);
 }

 return (
 <Card className={cn(
"transition-all",
 isRunning &&"border-green-300 dark:border-green-700",
 isExpensive && isRunning &&"border-yellow-300 dark:border-yellow-700",
 isVeryExpensive && isRunning &&"border-red-300 dark:border-red-700")}>
 <CardContent className="p-6">
 <div className="text-center mb-6">
 <h3 className="font-semibold text-lg flex items-center justify-center gap-2">
 <DollarSign className="w-5 h-5 text-green-600"/>
 Costo de reunión en vivo
 </h3>
 <p className="text-xs text-muted-foreground">
 ¿Esta reunión vale lo que cuesta?
 </p>
 </div>

 {/* Cost display */}
 <div className="text-center mb-6">
 <p className={cn(
"text-5xl font-mono font-bold transition-colors",
 !isRunning ?"text-muted-foreground":
 isVeryExpensive ?"text-red-600":
 isExpensive ?"text-yellow-600":"text-green-600")}>
 ${totalCost.toFixed(2)}
 </p>
 <p className="text-sm text-muted-foreground mt-1">
 {String(minutes).padStart(2,"0")}:{String(seconds).padStart(2,"0")} transcurridos
 </p>
 {isRunning && (
 <p className="text-xs text-muted-foreground mt-1">
 ${(costPerSecond * 60).toFixed(2)}/min · ${(costPerSecond * 3600).toFixed(0)}/hora
 </p>
 )}
 </div>

 {/* Fun comparisons */}
 {isRunning && totalCost > 10 && (
 <div className="text-center mb-4">
 <Badge variant="outline"className={cn(
"text-xs",
 isVeryExpensive ?"border-red-300 text-red-600":"border-yellow-300 text-yellow-600")}>
 {totalCost < 50
 ?`-- ${Math.floor(totalCost / 5)} cafés`: totalCost < 200
 ?`🍕 ${Math.floor(totalCost / 15)} pizzas para el equipo`: totalCost < 500
 ?`-- ${(totalCost / 300).toFixed(1)} meses de hosting`:`-- ¿Seguro que esto no podía ser un email?`}
 </Badge>
 </div>
 )}

 {/* Config */}
 {!isRunning && (
 <div className="grid grid-cols-2 gap-3 mb-4">
 <div className="space-y-1">
 <Label className="text-xs flex items-center gap-1">
 <Users className="w-3 h-3"/> Asistentes
 </Label>
 <Input
 type="number"min={1}
 max={50}
 value={attendees}
 onChange={(e) => setAttendees(parseInt(e.target.value) || 1)}
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs flex items-center gap-1">
 <DollarSign className="w-3 h-3"/> Costo/hora prom
 </Label>
 <Input
 type="number"min={1}
 value={avgHourlyCost}
 onChange={(e) => setAvgHourlyCost(parseInt(e.target.value) || 1)}
 />
 </div>
 </div>
 )}

 {/* Controls */}
 <div className="flex items-center justify-center gap-2">
 {!isRunning ? (
 <Button onClick={() => setIsRunning(true)} className="gap-2">
 <Play className="w-4 h-4"/>
 {elapsedSeconds > 0 ?"Continuar":"Iniciar reunión"}
 </Button>
 ) : (
 <Button variant="outline"onClick={() => setIsRunning(false)} className="gap-2">
 <Pause className="w-4 h-4"/> Pausar
 </Button>
 )}
 {elapsedSeconds > 0 && (
 <Button variant="ghost"onClick={reset} className="gap-2">
 <RotateCcw className="w-4 h-4"/> Reset
 </Button>
 )}
 </div>
 </CardContent>
 </Card>
 );
}
