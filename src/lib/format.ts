export const ATTO = 10n ** 18n;

export function toBig(v: bigint | string | number | undefined | null): bigint {
  if (typeof v === "bigint") return v;
  if (v === undefined || v === null || v === "") return 0n;
  try {
    return BigInt(typeof v === "number" ? Math.trunc(v) : v);
  } catch {
    return 0n;
  }
}

/** atto-credits -> human credits string with `dp` decimals. */
export function toCredits(atto: bigint | string | number | undefined, dp = 2): string {
  const v = toBig(atto);
  const whole = v / ATTO;
  const frac = ((v % ATTO) * 10n ** BigInt(dp)) / ATTO;
  return `${whole.toLocaleString()}.${frac.toString().padStart(dp, "0")}`;
}

/** human credits string -> atto-credits. */
export function toAtto(credits: string): bigint {
  const [w, f = ""] = (credits || "0").trim().split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  return toBig(w || "0") * ATTO + toBig(frac || "0");
}

export function shortAddr(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function pct(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 10000n) / whole) / 100;
}

export function timeLeft(closeSec: number): string {
  const delta = closeSec - Math.floor(Date.now() / 1000);
  if (delta <= 0) return "closed";
  const d = Math.floor(delta / 86400);
  const h = Math.floor((delta % 86400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
