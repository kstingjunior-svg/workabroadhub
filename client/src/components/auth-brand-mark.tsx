/**
 * 2026-10 (Tony: "make our sign-in look like this, with our logo").
 * Our globe mark inside a ring of dots in the WorkAbroad Hub brand colours
 * (navy → blue → green → orange, taken from the logo). Pure SVG, no assets
 * besides /auth-mark.png, so it renders instantly in the modal.
 */
import { useMemo } from "react";

const BRAND_STOPS: [number, number, number][] = [
  [30, 58, 138],   // navy  #1e3a8a
  [37, 99, 235],   // blue  #2563eb
  [22, 163, 74],   // green #16a34a
  [132, 204, 22],  // lime  #84cc16
  [249, 115, 22],  // orange #f97316
  [251, 146, 60],  // light orange
  [30, 58, 138],   // back to navy (seamless loop)
];

function colourAt(t: number): string {
  const seg = (BRAND_STOPS.length - 1) * t;
  const i = Math.min(Math.floor(seg), BRAND_STOPS.length - 2);
  const f = seg - i;
  const a = BRAND_STOPS[i], b = BRAND_STOPS[i + 1];
  const mix = (k: number) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
}

// 2026-10 (Tony: "animate like Apple's"): each ring slowly rotates
// (alternating direction) and a shimmer wave travels around the dots.
// Keyframes live in index.css (.abm-*); prefers-reduced-motion = static.
const TWINKLE_S = 2.8;

export function AuthBrandMark({ size = 132 }: { size?: number }) {
  const rings = useMemo(() => {
    const defs = [
      { radius: 34, count: 26, dot: 1.5, opacity: 0.55 },
      { radius: 41, count: 30, dot: 2.0, opacity: 0.8 },
      { radius: 48, count: 34, dot: 2.9, opacity: 1 },
    ];
    return defs.map((ring, ri) => ({
      ri,
      dots: Array.from({ length: ring.count }, (_, i) => {
        const t = i / ring.count;
        const angle = t * Math.PI * 2 - Math.PI / 2 + ri * 0.09; // stagger rings
        return {
          x: 50 + Math.cos(angle) * ring.radius,
          y: 50 + Math.sin(angle) * ring.radius,
          r: ring.dot,
          fill: colourAt(t),
          o: ring.opacity,
          // negative delay = wave already in motion on first paint
          delay: -(t * TWINKLE_S + ri * 0.35),
        };
      }),
    }));
  }, []);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
        {rings.map((ring) => (
          <g key={ring.ri} className={`abm-ring abm-ring-${ring.ri}`}>
            {ring.dots.map((d, i) => (
              <circle
                key={i}
                className="abm-dot"
                cx={d.x} cy={d.y} r={d.r} fill={d.fill}
                style={{ ["--abm-o" as any]: d.o, opacity: d.o, animationDelay: `${d.delay}s` }}
              />
            ))}
          </g>
        ))}
      </svg>
      <img
        src="/auth-mark.png"
        alt=""
        width={size * 0.46}
        height={size * 0.46}
        className="abm-core absolute rounded-full shadow-sm"
        style={{ left: "50%", top: "50%", width: size * 0.46, height: size * 0.46, transform: "translate(-50%,-50%)" }}
        draggable={false}
      />
    </div>
  );
}
