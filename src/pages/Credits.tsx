import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Copy, Wallet } from "lucide-react";
import { depositEth, hasWallet } from "@/lib/creditRail";
import { requestRedeem, requireIdentity } from "@/lib/genlayer";
import { toAtto, toCredits, shortAddr } from "@/lib/format";
import { useProfile } from "@/lib/useProfile";
import { ConfigBanner, Notice, Spinner } from "@/components/ui";

export default function Credits() {
  const { address, balance, refresh } = useProfile();
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [payout, setPayout] = useState("");
  const [busy, setBusy] = useState<"buy" | "sell" | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function onBuy() {
    setMsg(null);
    if (!requireIdentity()) return;
    if (!buy || Number(buy) <= 0) return setMsg({ tone: "error", text: "Enter an ETH amount." });
    setBusy("buy");
    try {
      const hash = await depositEth(buy, address);
      setBuy("");
      setMsg({ tone: "info", text: `Deposit sent (${shortAddr(hash)}). Credits arrive once the relayer mirrors it.` });
    } catch (e) {
      setMsg({ tone: "error", text: String((e as Error)?.message || e).slice(0, 160) });
    } finally {
      setBusy(null);
    }
  }

  async function onSell() {
    setMsg(null);
    if (!requireIdentity()) return;
    if (!sell || Number(sell) <= 0) return setMsg({ tone: "error", text: "Enter a credit amount." });
    if (!payout) return setMsg({ tone: "error", text: "Enter a payout wallet (Base Sepolia)." });
    setBusy("sell");
    try {
      await requestRedeem(toAtto(sell), payout);
      setSell("");
      setMsg({ tone: "info", text: "Redeem requested. The relayer will release ETH to your wallet." });
      await refresh();
    } catch (e) {
      setMsg({ tone: "error", text: String((e as Error)?.message || e).slice(0, 160) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Credits</h1>
        <p className="text-sm text-slate-400">
          Credits are your betting balance. Buy them with real ETH on Base Sepolia; cash them back out any time.
        </p>
      </div>

      <ConfigBanner />

      <div className="card flex items-center justify-between p-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Your balance</div>
          <div className="text-3xl font-extrabold text-white">{toCredits(balance)} <span className="text-base font-semibold text-flash">cr</span></div>
        </div>
        <button
          className="chip text-slate-300"
          onClick={() => navigator.clipboard?.writeText(address)}
          title="Copy profile address"
        >
          <Copy className="h-3.5 w-3.5" /> {shortAddr(address)}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-100">
            <ArrowDownToLine className="h-4 w-4 text-win" /> Buy credits
          </h2>
          <input className="input" inputMode="decimal" placeholder="ETH amount" value={buy} onChange={(e) => setBuy(e.target.value)} />
          {!hasWallet() && <Notice tone="warn">No EVM wallet detected. Install MetaMask to deposit.</Notice>}
          <button className="btn-primary w-full" onClick={onBuy} disabled={busy === "buy"}>
            {busy === "buy" ? <Spinner /> : <><Wallet className="h-4 w-4" /> Deposit ETH</>}
          </button>
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-100">
            <ArrowUpFromLine className="h-4 w-4 text-pop" /> Cash out
          </h2>
          <input className="input" inputMode="decimal" placeholder="credit amount" value={sell} onChange={(e) => setSell(e.target.value)} />
          <input className="input" placeholder="payout wallet (0x… on Base Sepolia)" value={payout} onChange={(e) => setPayout(e.target.value)} />
          <button className="btn-ghost w-full" onClick={onSell} disabled={busy === "sell"}>
            {busy === "sell" ? <Spinner /> : "Request redeem"}
          </button>
        </div>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
