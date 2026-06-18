// Shared GenLayer deploy helpers: client construction, receipt polling, and
// value normalization. Used by the deploy and wiring scripts.
import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const chains = { localnet, studionet, testnetAsimov, testnetBradbury };

export function glClient() {
  const chainKey = process.env.GENLAYER_CHAIN ?? "studionet";
  if (!(chainKey in chains)) throw new Error(`Unsupported GENLAYER_CHAIN "${chainKey}".`);
  const privateKey = process.env.GENLAYER_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("Set GENLAYER_DEPLOYER_PRIVATE_KEY.");
  const account = createAccount(privateKey);
  const client = createClient({
    chain: chains[chainKey],
    endpoint: process.env.GENLAYER_ENDPOINT ?? chains[chainKey].rpcUrls.default.http[0],
    account,
  });
  return { client, account, chainKey };
}

export function normalizeHash(h) {
  if (typeof h === "string" && h.trim()) return h.trim();
  if (h && typeof h === "object") return h.as_hex?.trim() || h.hex?.trim() || "";
  return "";
}

export function normalizeAddress(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.as_hex || v.hex || String(v);
  return String(v);
}

const FAILED = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

export async function waitForReceipt(client, hash, timeoutMs = 25 * 60_000) {
  const normalized = normalizeHash(hash);
  if (!normalized) throw new Error("Transaction did not return a valid hash.");
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const tx = await client.getTransaction({ hash: normalized });
      const name = String(tx?.statusName ?? tx?.status ?? "").toUpperCase();
      if (name === "ACCEPTED" || name === "FINALIZED" || tx?.status === 5 || tx?.status === 7) return tx;
      if (FAILED.has(name)) throw new Error(`Transaction ${normalized} ended in ${name}.`);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      if (!/fetch failed|timeout|network|unknown rpc error/.test(msg)) throw error;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw lastError ?? new Error(`Timed out waiting for ${normalized}.`);
}
