import type { OicSeverity } from "@/lib/operacional/types";

const strokeColor: Record<OicSeverity, string> = {
  ok:       "stroke-emerald-500",
  warning:  "stroke-amber-500",
  degraded: "stroke-orange-500",
  critical: "stroke-rose-500",
};

const textColor: Record<OicSeverity, string> = {
  ok:       "fill-emerald-700",
  warning:  "fill-amber-700",
  degraded: "fill-orange-700",
  critical: "fill-rose-700",
};

const R = 36;
const CIRC = 2 * Math.PI * R;

export function OicScoreRing({
  score,
  severity,
  size = 96,
}: {
  score: number;
  severity: OicSeverity;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * CIRC;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={`Score ${score}`}>
      {/* Track */}
      <circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke="rgba(44,40,37,0.08)"
        strokeWidth="10"
      />
      {/* Progress */}
      <circle
        cx="50" cy="50" r={R}
        fill="none"
        className={strokeColor[severity]}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRC}`}
        strokeDashoffset={CIRC / 4} // start at top
        transform="rotate(-90 50 50)"
      />
      {/* Score text */}
      <text
        x="50" y="46"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="18"
        fontWeight="700"
        className={textColor[severity]}
      >
        {score}
      </text>
      <text
        x="50" y="62"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9"
        fontWeight="600"
        className="fill-[var(--copilot-ink-muted)] uppercase tracking-wide"
      >
        /100
      </text>
    </svg>
  );
}
