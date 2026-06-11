"use client";

/**
 * Tiny inline-SVG sparkline. Zero deps. Renders even with 0–1 point gracefully.
 *
 *   <Sparkline data={[12, 14, 11, 18, 22, 19]} width={120} height={32} />
 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = "currentColor",
  fill,
  min,
  max,
}: {
  data: Array<number | null>;
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  min?: number;
  max?: number;
}) {
  const points = data.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (points.length === 0) {
    return (
      <svg width={width} height={height} className="text-[var(--muted)] opacity-40">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const lo = min ?? Math.min(...points);
  const hi = max ?? Math.max(...points);
  const range = hi - lo || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;

  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - lo) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const fillPath = fill
    ? `${path} L${(points.length - 1) * stepX},${height} L0,${height} Z`
    : null;

  return (
    <svg width={width} height={height} preserveAspectRatio="none">
      {fillPath && <path d={fillPath} fill={fill} opacity={0.15} />}
      <path d={path} stroke={stroke} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
