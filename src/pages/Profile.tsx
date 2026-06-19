import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Settings } from "lucide-react";
import { getStake, listMarkets, profileAddress, requireIdentity, type MarketView } from "@/lib/genlayer";
import { toBig, toCredits } from "@/lib/format";
import { useProfile } from "@/lib/useProfile";
import { ConfigBanner, Notice, Spinner, StatusChip } from "@/components/ui";
import { SettingsModal } from "@/components/SettingsModal";

interface Position {
  market: MarketView;
  staked: bigint;
}

export default function Profile() {
  const { address, balance } = useProfile();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const me = profileAddress();
      const markets = await listMarkets();
      const found: Position[] = [];
      for (const m of markets) {
        let staked = 0n;
        for (let i = 0; i < m.outcome_count; i++) staked += toBig(await getStake(m.id, i, me));
        if (staked > 0n) found.push({ market: m, staked });
      }
      setPositions(found);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-100">Profile</h1>
        <button className="btn-ghost" onClick={() => requireIdentity() && setSettingsOpen(true)}>
          <Settings className="h-4 w-4" /> Settings
        </button>
      </div>

      <div className="card flex items-center justify-between p-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Your identity</div>
          <button
            className="mt-1 inline-flex items-center gap-2 font-mono text-sm text-slate-200 hover:text-white"
            onClick={() => navigator.clipboard?.writeText(address)}
          >
            {address || "no identity"} <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Balance</div>
          <div className="text-2xl font-extrabold text-white">{toCredits(balance)} <span className="text-sm text-flash">cr</span></div>
        </div>
      </div>

      <ConfigBanner />

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-100">Your positions</h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-slate-400"><Spinner /> Loading…</div>
        ) : positions.length === 0 ? (
          <Notice>
            No open positions.{" "}
            <Link to="/" className="font-semibold text-flash hover:underline">Find a market</Link>.
          </Notice>
        ) : (
          <div className="card divide-y divide-white/5">
            {positions.map(({ market, staked }) => (
              <Link key={market.id} to={`/market/${market.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-white/5">
                <span className="flex-1 truncate font-medium text-slate-200">{market.title}</span>
                <StatusChip status={market.status} />
                <span className="w-28 text-right font-mono text-sm text-slate-300">{toCredits(staked.toString())} cr</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
