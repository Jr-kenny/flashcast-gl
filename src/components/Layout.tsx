import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Coins, Compass, PlusCircle, Trophy, User, Wallet, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { toCredits, shortAddr } from "@/lib/format";
import { NEED_AUTH } from "@/lib/genlayer";
import { useProfile } from "@/lib/useProfile";
import { AuthModal } from "@/components/AuthModal";

const NAV = [
  { to: "/", label: "Markets", icon: Compass, end: true },
  { to: "/create", label: "Create", icon: PlusCircle },
  { to: "/credits", label: "Credits", icon: Coins },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/me", label: "Profile", icon: User },
];

export default function Layout() {
  const { address, balance } = useProfile();
  const [authOpen, setAuthOpen] = useState(false);

  // Browse freely; the chooser only opens when an action needs an identity, or
  // when the user clicks Connect.
  useEffect(() => {
    const open = () => setAuthOpen(true);
    window.addEventListener(NEED_AUTH, open);
    return () => window.removeEventListener(NEED_AUTH, open);
  }, []);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 pr-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-flash text-ink-950 shadow-glow">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              flash<span className="text-flash">cast</span>
            </span>
          </NavLink>

          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:text-slate-100",
                    isActive && "bg-white/5 text-slate-100",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {address ? (
              <>
                <div className="chip border-flash/20 bg-flash/10 text-flash">
                  <Coins className="h-3.5 w-3.5" />
                  {toCredits(balance)} cr
                </div>
                <button
                  className="chip text-slate-300 transition hover:bg-white/5"
                  title="Switch or connect a different identity"
                  onClick={() => setAuthOpen(true)}
                >
                  <span className="h-2 w-2 rounded-full bg-pop" />
                  {shortAddr(address)}
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={() => setAuthOpen(true)}>
                <Wallet className="h-4 w-4" /> Connect
              </button>
            )}
          </div>
        </div>
      </header>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-6 text-xs text-slate-500">
        Outcomes are settled autonomously by a GenLayer Intelligent Contract reading the web under the
        Equivalence Principle. No oracle, no admin.
      </footer>
    </div>
  );
}
