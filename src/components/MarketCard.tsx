import { Link } from "react-router-dom";
import { Clock, Users } from "lucide-react";
import type { MarketView } from "@/lib/genlayer";
import { toCredits, timeLeft } from "@/lib/format";
import { OutcomeBars, StatusChip } from "./ui";

export default function MarketCard({ m }: { m: MarketView }) {
  return (
    <Link
      to={`/market/${m.id}`}
      className="card group flex flex-col gap-3 p-4 transition hover:border-flash/30 hover:shadow-glow"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug text-slate-100 group-hover:text-white">{m.title}</h3>
        <StatusChip status={m.status} />
      </div>

      <OutcomeBars
        outcomes={m.outcomes}
        totals={m.totals}
        pool={m.pool}
        winning={m.status === "resolved" ? m.winning_outcome : undefined}
      />

      <div className="mt-auto flex items-center gap-4 pt-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {toCredits(m.pool, 0)} cr pool
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {m.status === "open" ? timeLeft(m.close_time) : m.status}
        </span>
      </div>
    </Link>
  );
}
