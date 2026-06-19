import { useEffect, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, KeyRound, ShieldAlert, Wallet, X } from "lucide-react";
import { getPrivateKey, profileAddress, storeIdentity } from "@/lib/genlayer";
import { deriveIdentityFromWallet, hasWallet } from "@/lib/creditRail";
import { Notice, Spinner } from "@/components/ui";

/** Settings panel. Lets the user back up the burner GenLayer key that lives in
 *  this browser's localStorage — the only copy of their identity. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState<"wallet" | "import" | null>(null);
  const [error, setError] = useState("");
  const pk = getPrivateKey();
  const address = profileAddress();

  async function connectWallet() {
    setError("");
    setBusy("wallet");
    try {
      storeIdentity(await deriveIdentityFromWallet());
      onClose();
    } catch (e) {
      setError(String((e as Error)?.message || e).slice(0, 160));
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
      setBusy(null);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard?.writeText(pk);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([`flashcast identity\naddress: ${address}\nprivate key: ${pk}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flashcast-key-${address.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-full max-w-lg space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button className="text-slate-400 transition hover:text-white" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">Export private key</div>
          <p className="text-sm text-slate-400">
            Your identity lives only in this browser. Back up this key to restore your credits and positions on
            another device, or if you ever clear your browser data.
          </p>
        </div>

        <Notice tone="error">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Anyone with this key fully controls your balance and bets. Never share it, never paste it into a
              website or chat, and store it somewhere only you can reach.
            </span>
          </div>
        </Notice>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="input flex-1 truncate font-mono text-xs">
              {revealed ? pk : "•".repeat(40)}
            </code>
            <button className="btn-ghost shrink-0" onClick={() => setRevealed((v) => !v)}>
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {revealed ? "Hide" : "Reveal"}
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy key"}
            </button>
            <button className="btn-ghost flex-1" onClick={download}>
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
        </div>

        <div className="space-y-3 border-t border-white/5 pt-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Switch identity</div>
          <Notice tone="warn">
            Switching changes your address. Any credits and positions stay on the current identity — back it up
            above first if you might want it back.
          </Notice>
          <button className="btn-ghost w-full" onClick={connectWallet} disabled={busy !== null || !hasWallet()}>
            {busy === "wallet" ? <Spinner /> : <Wallet className="h-4 w-4" />} Connect wallet (make portable)
          </button>
          {showImport ? (
            <div className="space-y-2">
              <input
                className="input font-mono text-xs"
                placeholder="0x… paste a key to restore an identity"
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
              <KeyRound className="h-3.5 w-3.5" /> Import an existing key
            </button>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </div>
  );
}
