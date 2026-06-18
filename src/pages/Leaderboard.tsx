import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { listMarkets, type MarketView } from "@/lib/genlayer";
import { toBig, toCredits } from "@/lib/format";
import { ConfigBanner, Notice, Spinner, StatusChip } from "@/components/ui";

export default function Leaderboard() {
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMarkets()
      .then(setMarkets)
      .finally(() => setLoading(false));
  }, []);

  const ranked = [...markets].sort((a, b) => (toBig(b.pool) > toBig(a.pool) ? 1 : -1)).slice(0, 20);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Trophy className="h-6 w-6 text-flash" /> Leaderboard
        </h1>
        <p className="text-sm text-slate-400">Biggest markets by pool. Per-wallet profit ranking is computed by an indexer over settled markets.</p>
      </div>

      <ConfigBanner />

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-slate-400"><Spinner /> Loading…</div>
      ) : ranked.length === 0 ? (
        <Notice>No markets to rank yet.</Notice>
      ) : (
        <div className="card divide-y divide-white/5">
          {ranked.map((m, i) => (
            <Link key={m.id} to={`/market/${m.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-white/5">
              <span className="w-6 text-center font-mono text-sm text-slate-500">{i + 1}</span>
              <span className="flex-1 truncate font-medium text-slate-200">{m.title}</span>
              <StatusChip status={m.status} />
              <span className="w-28 text-right font-mono text-sm text-flash">{toCredits(m.pool, 0)} cr</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
