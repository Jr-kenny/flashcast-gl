import { useEffect, useState } from "react";
import { KeyRound, Sparkles, Wallet, X } from "lucide-react";
import { generateIdentity, storeIdentity } from "@/lib/genlayer";
import { deriveIdentityFromWallet, hasWallet } from "@/lib/creditRail";
import { Notice, Spinner } from "@/components/ui";

type Busy = "wallet" | "generate" | "import" | null;

/** First-run login chooser. The user picks how their GenLayer betting identity is
 *  created: derived from their extension wallet (portable), generated fresh in the
 *  browser, or imported from a key they already have. When `mandatory`, it can only
 *  be closed by choosing one — the app needs an identity to bet. */
export function AuthModal({ mandatory = false, onClose }: { mandatory?: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    if (mandatory) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mandatory, onClose]);

  const fail = (e: unknown) => setError(String((e as Error)?.message || e).slice(0, 160));

  async function connectWallet() {
    setError("");
    setBusy("wallet");
    try {
      storeIdentity(await deriveIdentityFromWallet());
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function createBrowserIdentity() {
    setError("");
    setBusy("generate");
    try {
      generateIdentity();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function importKey() {
    setError("");
    setBusy("import");
    try {
      storeIdentity(keyInput);
      onClose();
    } catch {
      setError("That doesn't look like a valid private key.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={() => !mandatory && onClose()}
    >
      <div className="card w-full max-w-lg space-y-5 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Sign in to flashcast</h2>
            <p className="mt-0.5 text-sm text-slate-400">Choose how to create your betting identity.</p>
          </div>
          {!mandatory && (
            <button className="text-slate-400 transition hover:text-white" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="space-y-3">
          <button
            className="card flex w-full items-center gap-4 border-flash/30 p-4 text-left transition hover:bg-white/5 disabled:opacity-50"
            onClick={connectWallet}
            disabled={busy !== null}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-flash/15 text-flash">
              {busy === "wallet" ? <Spinner /> : <Wallet className="h-5 w-5" />}
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-2 font-semibold text-slate-100">
                Connect my wallet <span className="chip border-flash/30 bg-flash/10 text-flash">recommended</span>
              </span>
              <span className="mt-0.5 block text-sm text-slate-400">
                Sign once with MetaMask. Portable across devices, nothing secret stored.
              </span>
            </span>
          </button>

          <button
            className="card flex w-full items-center gap-4 p-4 text-left transition hover:bg-white/5 disabled:opacity-50"
            onClick={createBrowserIdentity}
            disabled={busy !== null}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-200">
              {busy === "generate" ? <Spinner /> : <Sparkles className="h-5 w-5" />}
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-slate-100">Create a browser identity</span>
              <span className="mt-0.5 block text-sm text-slate-400">
                Instant, no wallet needed. Lives only in this browser — back up the key in Settings.
              </span>
            </span>
          </button>
        </div>

        {showImport ? (
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-slate-500">Import a private key</label>
            <input
              className="input font-mono text-xs"
              placeholder="0x… paste your key to restore an identity"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={importKey} disabled={busy !== null || !keyInput}>
                {busy === "import" ? <Spinner /> : <KeyRound className="h-4 w-4" />} Restore identity
              </button>
              <button className="btn-ghost" onClick={() => setShowImport(false)} disabled={busy !== null}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
            onClick={() => setShowImport(true)}
          >
            <KeyRound className="h-3.5 w-3.5" /> Already have a key? Import it
          </button>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {!hasWallet() && (
          <p className="text-center text-xs text-slate-500">
            No extension wallet detected — install MetaMask to use the wallet option.
          </p>
        )}
      </div>
    </div>
  );
}
