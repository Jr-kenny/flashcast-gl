import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { pct, toBig, toCredits } from "@/lib/format";
import { isConfigured } from "@/lib/config";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "border-flash/30 bg-flash/10 text-flash",
    resolved: "border-win/30 bg-win/10 text-win",
    void: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  };
  return <span className={cn("chip capitalize", map[status] ?? map.void)}>{status}</span>;
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "error" }) {
  const tones = {
    info: "border-flash/20 bg-flash/5 text-slate-300",
    warn: "border-amber-400/20 bg-amber-400/5 text-amber-200",
    error: "border-lose/30 bg-lose/10 text-lose",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function ConfigBanner() {
  if (isConfigured()) return null;
  return (
    <Notice tone="warn">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Contracts are not wired yet. Deploy the ledger and market, then set{" "}
          <code className="font-mono text-amber-100">VITE_PREDICTION_MARKET_ADDRESS</code> and{" "}
          <code className="font-mono text-amber-100">VITE_CREDIT_LEDGER_ADDRESS</code> in <code>.env</code> to load live
          markets.
        </span>
      </div>
    </Notice>
  );
}

export function OutcomeBars({
  outcomes,
  totals,
  pool,
  winning,
}: {
  outcomes: string[];
  totals: string[];
  pool: string;
  winning?: number;
}) {
  const poolBig = toBig(pool);
  return (
    <div className="space-y-2">
      {outcomes.map((label, i) => {
        const share = pct(toBig(totals[i]), poolBig);
        const isWin = winning === i;
        return (
          <div key={i} className="relative overflow-hidden rounded-lg border border-white/5 bg-ink-900">
            <div
              className={cn("absolute inset-y-0 left-0", isWin ? "bg-win/25" : "bg-flash/15")}
              style={{ width: `${Math.max(share, 1.5)}%` }}
            />
            <div className="relative flex items-center justify-between px-3 py-2 text-sm">
              <span className={cn("font-medium", isWin ? "text-win" : "text-slate-200")}>
                {label}
                {isWin && " ✓"}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {share.toFixed(0)}% · {toCredits(totals[i], 0)} cr
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
