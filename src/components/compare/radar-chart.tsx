"use client";

import { cn } from "@/lib/utils";

interface RadarAxis {
  label: string;
  valueA: number; // 0-100
  valueB: number; // 0-100
}

interface RadarChartProps {
  axes: RadarAxis[];
  nameA: string;
  nameB: string;
  colorA?: string;
  colorB?: string;
}

export function RadarChart({
  axes,
  nameA,
  nameB,
  colorA = "rgba(124, 58, 237, 0.5)",
  colorB = "rgba(59, 130, 246, 0.5)",
}: RadarChartProps) {
  const cx = 150;
  const cy = 150;
  const maxR = 120;
  const levels = 4;
  const n = axes.length;

  function polarToXY(angle: number, radius: number) {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  const angleStep = 360 / n;

  // Grid circles
  const gridCircles = Array.from({ length: levels }, (_, i) => {
    const r = (maxR / levels) * (i + 1);
    const points = Array.from({ length: n }, (_, j) => {
      const { x, y } = polarToXY(j * angleStep, r);
      return `${x},${y}`;
    }).join(" ");
    return points;
  });

  // Data polygons
  function getPolygon(values: number[]) {
    return values
      .map((v, i) => {
        const r = (v / 100) * maxR;
        const { x, y } = polarToXY(i * angleStep, r);
        return `${x},${y}`;
      })
      .join(" ");
  }

  const polyA = getPolygon(axes.map((a) => a.valueA));
  const polyB = getPolygon(axes.map((a) => a.valueB));

  return (
    <div>
      <svg viewBox="0 0 300 300" className="w-full max-w-[320px] mx-auto">
        {/* Grid */}
        {gridCircles.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {axes.map((_, i) => {
          const { x, y } = polarToXY(i * angleStep, maxR);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
          );
        })}

        {/* Data polygon A */}
        <polygon
          points={polyA}
          fill={colorA}
          stroke="rgb(124, 58, 237)"
          strokeWidth={2}
        />

        {/* Data polygon B */}
        <polygon
          points={polyB}
          fill={colorB}
          stroke="rgb(59, 130, 246)"
          strokeWidth={2}
        />

        {/* Data points */}
        {axes.map((a, i) => {
          const rA = (a.valueA / 100) * maxR;
          const rB = (a.valueB / 100) * maxR;
          const ptA = polarToXY(i * angleStep, rA);
          const ptB = polarToXY(i * angleStep, rB);
          return (
            <g key={i}>
              <circle cx={ptA.x} cy={ptA.y} r={3} fill="rgb(124, 58, 237)" />
              <circle cx={ptB.x} cy={ptB.y} r={3} fill="rgb(59, 130, 246)" />
            </g>
          );
        })}

        {/* Labels */}
        {axes.map((a, i) => {
          const { x, y } = polarToXY(i * angleStep, maxR + 18);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {a.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>{nameA}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>{nameB}</span>
        </div>
      </div>
    </div>
  );
}
