import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { createMarket } from "@/lib/genlayer";
import { ConfigBanner, Notice, Spinner } from "@/components/ui";

export default function Create() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [outcomes, setOutcomes] = useState<string[]>(["Yes", "No"]);
  const [close, setClose] = useState(defaultClose());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function setOutcome(i: number, v: string) {
    setOutcomes((o) => o.map((x, j) => (j === i ? v : x)));
  }

  async function submit() {
    setErr("");
    const labels = outcomes.map((o) => o.trim()).filter(Boolean);
    if (!title.trim()) return setErr("Add a title.");
    if (!question.trim()) return setErr("Add a resolution question.");
    if (labels.length < 2) return setErr("Add at least two outcomes.");
    const closeTime = Math.floor(new Date(close).getTime() / 1000);
    if (!closeTime || closeTime < Math.floor(Date.now() / 1000) + 300)
      return setErr("Close time must be at least 5 minutes out.");

    setBusy(true);
    try {
      await createMarket({ title, outcomes: labels, question, sourceUrl: sourceUrl.trim(), closeTime, description });
      nav("/");
    } catch (e) {
      setErr(cleanErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Create a market</h1>
        <p className="text-sm text-slate-400">
          Anyone can open a market. It resolves itself from the web when betting closes, so write a question with a
          clear, checkable answer.
        </p>
      </div>

      <ConfigBanner />

      <div className="card space-y-4 p-6">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Will it rain in London tomorrow?" />
        </Field>

        <Field label="Description (optional)">
          <textarea className="input min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Extra context for bettors." />
        </Field>

        <Field label="Outcomes">
          <div className="space-y-2">
            {outcomes.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={o} onChange={(e) => setOutcome(i, e.target.value)} placeholder={`Outcome ${i + 1}`} />
                {outcomes.length > 2 && (
                  <button className="btn-ghost px-2" onClick={() => setOutcomes((x) => x.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {outcomes.length < 8 && (
              <button className="btn-ghost" onClick={() => setOutcomes((x) => [...x, ""])}>
                <Plus className="h-4 w-4" /> Add outcome
              </button>
            )}
          </div>
        </Field>

        <Field label="Resolution question" hint="What the contract asks the LLM to decide, one outcome verbatim.">
          <textarea className="input min-h-[72px]" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Did more than 5mm of rain fall in central London on this date?" />
        </Field>

        <Field label="Resolution source URL (optional)" hint="An https page the contract reads. Leave blank to use public fact.">
          <input className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
        </Field>

        <Field label="Closes at">
          <input className="input" type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)} />
        </Field>

        {err && <Notice tone="error">{err}</Notice>}

        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? <Spinner /> : "Create market"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      {children}
    </label>
  );
}

function defaultClose(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setSeconds(0, 0);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function cleanErr(e: unknown): string {
  const raw = String((e as Error)?.message || e);
  const m = raw.match(/\[EXPECTED\]\s*(.+?)(?:"|$)/);
  return m ? m[1] : raw.slice(0, 160);
}
