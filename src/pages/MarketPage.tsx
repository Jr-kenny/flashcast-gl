import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Gavel, Link2 } from "lucide-react";
import {
  claim,
  getMarketView,
  getStake,
  hasClaimed,
  placeBet,
  type MarketView,
} from "@/lib/genlayer";
import { toAtto, toCredits, timeLeft, toBig } from "@/lib/format";
import { useProfile } from "@/lib/useProfile";
import { Notice, OutcomeBars, Spinner, StatusChip } from "@/components/ui";

export default function MarketPage() {
  const { id = "" } = useParams();
  const { balance, refresh: refreshProfile } = useProfile();
  const [m, setM] = useState<MarketView | null>(null);
  const [stakes, setStakes] = useState<string[]>([]);
  const [claimed, setClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState(0);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const view = await getMarketView(id);
    setM(view);
    if (view) {
      const s: string[] = [];
      for (let i = 0; i < view.outcome_count; i++) s.push(await getStake(id, i));
      setStakes(s);
      setClaimed(await hasClaimed(id));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onBet() {
    setMsg(null);
    if (!amount || Number(amount) <= 0) return setMsg({ tone: "error", text: "Enter an amount." });
    setBusy(true);
    try {
      await placeBet(id, pick, toAtto(amount));
      setAmount("");
      setMsg({ tone: "info", text: "Bet placed." });
      await Promise.all([load(), refreshProfile()]);
    } catch (e) {
      setMsg({ tone: "error", text: cleanErr(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onClaim() {
    setMsg(null);
    setBusy(true);
    try {
      await claim(id);
      setMsg({ tone: "info", text: "Claimed." });
      await Promise.all([load(), refreshProfile()]);
    } catch (e) {
      setMsg({ tone: "error", text: cleanErr(e) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-12 text-slate-400"><Spinner /> Loading…</div>;
  if (!m) return <Notice tone="error">Market not found.</Notice>;

  const myTotalStake = stakes.reduce((acc, s) => acc + toBig(s), 0n);
  const settled = m.status === "resolved" || m.status === "void";

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> All markets
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="card space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-white">{m.title}</h1>
              <StatusChip status={m.status} />
            </div>
            {m.description && <p className="text-sm text-slate-400">{m.description}</p>}

            <OutcomeBars
              outcomes={m.outcomes}
              totals={m.totals}
              pool={m.pool}
              winning={m.status === "resolved" ? m.winning_outcome : undefined}
            />

            <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-400">
              <span>{toCredits(m.pool, 0)} cr pool</span>
              <span>{m.status === "open" ? `closes in ${timeLeft(m.close_time)}` : m.status}</span>
            </div>
          </div>

          <div className="card space-y-3 p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Gavel className="h-4 w-4 text-flash" /> How this settles
            </h2>
            <p className="text-sm text-slate-400">{m.resolution_question}</p>
            {m.source_url && (
              <a
                href={m.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-flash hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" /> resolution source
              </a>
            )}
            {settled && m.reasoning && (
              <Notice>
                <span className="font-semibold text-slate-200">Verdict:</span> {m.reasoning}
              </Notice>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          {m.status === "open" ? (
            <div className="card space-y-3 p-5">
              <h3 className="text-sm font-semibold text-slate-200">Place a bet</h3>
              <div className="space-y-1.5">
                {m.outcomes.map((o, i) => (
                  <button
                    key={i}
                    onClick={() => setPick(i)}
                    className={
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition " +
                      (pick === i
                        ? "border-flash/50 bg-flash/10 text-flash"
                        : "border-white/10 text-slate-300 hover:bg-white/5")
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
              <input
                className="input"
                inputMode="decimal"
                placeholder="amount in credits"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="text-xs text-slate-500">Balance: {toCredits(balance)} cr</div>
              <button className="btn-primary w-full" onClick={onBet} disabled={busy}>
                {busy ? <Spinner /> : `Bet on ${m.outcomes[pick]}`}
              </button>
            </div>
          ) : (
            <div className="card space-y-3 p-5">
              <h3 className="text-sm font-semibold text-slate-200">
                {m.status === "resolved" ? "Market resolved" : "Market voided"}
              </h3>
              {myTotalStake > 0n ? (
                claimed ? (
                  <Notice>You have claimed this market.</Notice>
                ) : (
                  <button className="btn-primary w-full" onClick={onClaim} disabled={busy}>
                    {busy ? <Spinner /> : "Claim payout"}
                  </button>
                )
              ) : (
                <Notice>You had no stake in this market.</Notice>
              )}
            </div>
          )}

          {myTotalStake > 0n && (
            <div className="card space-y-2 p-5 text-sm">
              <h3 className="font-semibold text-slate-200">Your position</h3>
              {m.outcomes.map((o, i) =>
                toBig(stakes[i]) > 0n ? (
                  <div key={i} className="flex justify-between text-slate-400">
                    <span>{o}</span>
                    <span className="font-mono">{toCredits(stakes[i])} cr</span>
                  </div>
                ) : null,
              )}
            </div>
          )}

          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </aside>
      </div>
    </div>
  );
}

function cleanErr(e: unknown): string {
  const raw = String((e as Error)?.message || e);
  const m = raw.match(/\[EXPECTED\]\s*(.+?)(?:"|$)/);
  return m ? m[1] : raw.slice(0, 160);
}
