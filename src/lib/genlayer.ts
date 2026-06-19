import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { Wallet } from "ethers";
import { CONFIG } from "./config";

const CHAINS: Record<string, any> = { localnet, studionet, testnetAsimov, testnetBradbury };
const PK_KEY = "flashcast.gl.pk";

/** Fired whenever the signing identity changes (created, imported, connected, or
 *  cleared) so every `useProfile` consumer can refresh. */
export const IDENTITY_CHANGED = "flashcast:identity";

/** Fired when an action needs an identity but none exists, so the layout can open
 *  the sign-in chooser. Lets people browse markets first and only sign in to act. */
export const NEED_AUTH = "flashcast:need-auth";

let _client: any;
let _account: any;
let _readAccount: any;

function resetClient() {
  _account = undefined;
  _client = undefined;
}

function broadcast() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(IDENTITY_CHANGED));
}

/** True once this browser holds a GenLayer signing identity. */
export function hasIdentity(): boolean {
  return Boolean(localStorage.getItem(PK_KEY));
}

export function getPrivateKey(): string {
  const pk = localStorage.getItem(PK_KEY);
  if (!pk) throw new Error("No identity yet. Sign in to create or connect one.");
  return pk;
}

/** Validate, persist, and broadcast a signing identity. Accepts any private key,
 *  whether randomly generated, derived from a wallet, or pasted by the user. The
 *  address it yields is the profile: deposits on Base Sepolia are tagged with it. */
export function storeIdentity(rawKey: string): string {
  const wallet = new Wallet(rawKey.trim()); // throws on a malformed key
  localStorage.setItem(PK_KEY, wallet.privateKey);
  resetClient();
  broadcast();
  return wallet.address;
}

/** Create a fresh random burner identity, persisted in this browser. */
export function generateIdentity(): string {
  return storeIdentity(Wallet.createRandom().privateKey);
}

export function clearIdentity(): void {
  localStorage.removeItem(PK_KEY);
  resetClient();
  broadcast();
}

/** Guard for actions that need a signing identity. Returns true if one exists;
 *  otherwise opens the sign-in chooser and returns false so the caller can stop. */
export function requireIdentity(): boolean {
  if (hasIdentity()) return true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NEED_AUTH));
  return false;
}

export function getAccount() {
  if (!_account) _account = createAccount(getPrivateKey() as `0x${string}`);
  return _account;
}

export function profileAddress(): string {
  return hasIdentity() ? getAccount().address : "";
}

/** Public market data needs *an* account to read, but not the user's. Before sign
 *  in, fall back to a throwaway account so the feed still loads. */
function accountForClient() {
  if (hasIdentity()) return getAccount();
  if (!_readAccount) _readAccount = createAccount(Wallet.createRandom().privateKey as `0x${string}`);
  return _readAccount;
}

export function client() {
  if (!_client) {
    const chain = CHAINS[CONFIG.glChain] ?? studionet;
    _client = createClient({
      chain,
      endpoint: CONFIG.glEndpoint || chain.rpcUrls.default.http[0],
      account: accountForClient(),
    });
  }
  return _client;
}

async function read<T>(functionName: string, args: any[], fallback: T): Promise<T> {
  const address = functionName === "get_balance" ? CONFIG.ledger : CONFIG.market;
  if (!address) return fallback; // contracts not wired yet
  try {
    const res = await client().readContract({ address, functionName, args, jsonSafeReturn: true });
    return (res ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const FAILED = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

async function waitForTx(hash: any, timeoutMs = 120_000): Promise<void> {
  const h = typeof hash === "string" ? hash : hash?.as_hex ?? hash?.hex ?? "";
  if (!h) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tx = await client().getTransaction({ hash: h });
      const name = String(tx?.statusName ?? tx?.status ?? "").toUpperCase();
      if (name === "ACCEPTED" || name === "FINALIZED" || tx?.status === 5 || tx?.status === 7) return;
      if (FAILED.has(name)) throw new Error(`Transaction ${name.toLowerCase()}`);
    } catch (e) {
      const msg = String((e as Error)?.message || "").toLowerCase();
      if (!/fetch failed|timeout|network|unknown rpc error/.test(msg)) throw e;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function write(functionName: string, args: any[], address = CONFIG.market): Promise<void> {
  const hash = await client().writeContract({ address, functionName, args, value: 0n });
  await waitForTx(hash);
}

// ---- types ----
export interface Market {
  id: string;
  creator: string;
  title: string;
  description: string;
  outcome_count: number;
  resolution_question: string;
  source_url: string;
  close_time: number;
  status: "open" | "resolved" | "void";
  winning_outcome: number;
  pool: string;
  reasoning: string;
}

export interface MarketView extends Market {
  outcomes: string[];
  totals: string[];
}

function coerceMarket(raw: any): Market {
  return {
    id: String(raw.id),
    creator: String(raw.creator),
    title: String(raw.title),
    description: String(raw.description ?? ""),
    outcome_count: Number(raw.outcome_count),
    resolution_question: String(raw.resolution_question ?? ""),
    source_url: String(raw.source_url ?? ""),
    close_time: Number(raw.close_time),
    status: String(raw.status) as Market["status"],
    winning_outcome: Number(raw.winning_outcome),
    pool: String(raw.pool ?? "0"),
    reasoning: String(raw.reasoning ?? ""),
  };
}

// ---- reads ----
export async function listMarketIds(): Promise<string[]> {
  const ids = await read<string[]>("get_market_ids", [], []);
  return (ids ?? []).map(String);
}

export async function getMarketView(id: string): Promise<MarketView | null> {
  const raw = await read<any>("get_market", [id], null);
  if (!raw) return null;
  const m = coerceMarket(raw);
  const outcomes = (await read<string[]>("get_outcomes", [id], [])).map(String);
  const totals: string[] = [];
  for (let i = 0; i < m.outcome_count; i++) {
    totals.push(String(await read<any>("get_outcome_total", [id, i], "0")));
  }
  return { ...m, outcomes, totals };
}

export async function listMarkets(): Promise<MarketView[]> {
  const ids = await listMarketIds();
  const out: MarketView[] = [];
  for (const id of ids) {
    const m = await getMarketView(id);
    if (m) out.push(m);
  }
  return out.reverse(); // newest first
}

export async function getBalance(profile = profileAddress()): Promise<string> {
  return String(await read<any>("get_balance", [profile], "0"));
}

export async function getStake(id: string, outcome: number, profile = profileAddress()): Promise<string> {
  return String(await read<any>("get_stake", [id, profile, outcome], "0"));
}

export async function hasClaimed(id: string, profile = profileAddress()): Promise<boolean> {
  return Boolean(await read<any>("has_claimed", [id, profile], false));
}

// ---- writes ----
export async function createMarket(input: {
  title: string;
  outcomes: string[];
  question: string;
  sourceUrl: string;
  closeTime: number;
  description?: string;
}): Promise<void> {
  await write("create_market", [
    input.title,
    input.outcomes,
    input.question,
    input.sourceUrl,
    input.closeTime,
    input.description ?? "",
  ]);
}

export async function placeBet(id: string, outcome: number, atto: bigint): Promise<void> {
  await write("place_bet", [id, outcome, atto.toString()]);
}

export async function claim(id: string): Promise<void> {
  await write("claim", [id]);
}

export async function requestRedeem(atto: bigint, payoutWallet: string, token = "ETH"): Promise<void> {
  await write("request_redeem", [atto.toString(), payoutWallet, token], CONFIG.ledger);
}
