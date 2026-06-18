import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { Wallet } from "ethers";
import { CONFIG } from "./config";

const CHAINS: Record<string, any> = { localnet, studionet, testnetAsimov, testnetBradbury };
const PK_KEY = "flashcast.gl.pk";

/** A burner GenLayer identity, persisted in localStorage. This address is the
 *  user's profile: deposits on Base Sepolia are tagged with it. */
export function getPrivateKey(): string {
  let pk = localStorage.getItem(PK_KEY);
  if (!pk) {
    pk = Wallet.createRandom().privateKey;
    localStorage.setItem(PK_KEY, pk);
  }
  return pk;
}

let _client: any;
let _account: any;

export function getAccount() {
  if (!_account) _account = createAccount(getPrivateKey() as `0x${string}`);
  return _account;
}

export function profileAddress(): string {
  return getAccount().address;
}

export function client() {
  if (!_client) {
    const chain = CHAINS[CONFIG.glChain] ?? studionet;
    _client = createClient({
      chain,
      endpoint: CONFIG.glEndpoint || chain.rpcUrls.default.http[0],
      account: getAccount(),
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
