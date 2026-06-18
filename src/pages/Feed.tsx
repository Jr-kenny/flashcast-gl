import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, Sparkles } from "lucide-react";
import { listMarkets, type MarketView } from "@/lib/genlayer";
import MarketCard from "@/components/MarketCard";
import { ConfigBanner, Notice, Spinner } from "@/components/ui";

export default function Feed() {
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMarkets()
      .then(setMarkets)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-flash/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-pop/10 blur-3xl" />
        <div className="relative max-w-2xl space-y-4">
          <span className="chip border-flash/20 bg-flash/10 text-flash">
            <Sparkles className="h-3.5 w-3.5" /> settled by GenLayer
          </span>
          <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Bet on anything. The chain reads the world and settles the truth.
          </h1>
          <p className="text-slate-400">
            Buy credits with ETH, back an outcome in a parimutuel pool, and when the market closes a GenLayer
            Intelligent Contract reads the web and decides the winner under the Equivalence Principle. Winners split
            the pot.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link to="/create" className="btn-primary">
              <PlusCircle className="h-4 w-4" /> Create a market
            </Link>
            <Link to="/credits" className="btn-ghost">
              Get credits
            </Link>
          </div>
        </div>
      </section>

      <ConfigBanner />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Live markets</h2>
          <span className="text-sm text-slate-500">{markets.length} open</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-slate-400">
            <Spinner /> Loading markets…
          </div>
        ) : markets.length === 0 ? (
          <Notice>
            No markets yet. Be the first to{" "}
            <Link to="/create" className="font-semibold text-flash underline-offset-2 hover:underline">
              create one
            </Link>
            .
          </Notice>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
