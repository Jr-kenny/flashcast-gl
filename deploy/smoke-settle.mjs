// Live end-to-end settlement smoke: create a market with a fact-based question,
// bet on it, wait for it to close, let the GenLayer IC resolve it (real web+LLM
// under the Equivalence Principle), then claim the payout. Long-running (~6 min).
import "dotenv/config";
import { glClient, waitForReceipt } from "./lib/gl.mjs";

const { client, account } = glClient();
const market = process.env.PREDICTION_MARKET_CONTRACT_ADDRESS;
const ledger = process.env.CREDIT_LEDGER_CONTRACT_ADDRESS;
const me = account.address;
const read = (a, f, args) => client.readContract({ address: a, functionName: f, args, jsonSafeReturn: true });
const write = async (f, args, a = market) => {
  const h = await client.writeContract({ address: a, functionName: f, args, value: 0n });
  await waitForReceipt(client, h);
};

const CLOSE = 340;
const closeTime = Math.floor(Date.now() / 1000) + CLOSE;

console.log("creating settle-test market…");
await write("create_market", [
  "Is the Eiffel Tower in Paris?",
  ["Yes", "No"],
  "Is the Eiffel Tower located in Paris, France? Answer Yes or No.",
  "",
  closeTime,
  "End-to-end resolution smoke.",
]);
const ids = await read(market, "get_market_ids", []);
const id = ids[ids.length - 1];
console.log(`market ${id} created, closes in ${CLOSE}s`);

await write("place_bet", [id, 0, "1000000000000000000"]); // 1 credit on Yes
console.log("bet 1 credit on Yes");

const waitMs = (closeTime - Math.floor(Date.now() / 1000) + 15) * 1000;
console.log(`waiting ${Math.round(waitMs / 1000)}s for the market to close…`);
await new Promise((r) => setTimeout(r, waitMs));

console.log("resolving via web+LLM under the Equivalence Principle…");
try {
  await write("resolve", [id]);
} catch (e) {
  console.log("resolve error:", String(e?.message || e).slice(0, 200));
}
const m = await read(market, "get_market", [id]);
console.log(`status=${m.status} winning_outcome=${String(m.winning_outcome)}`);
console.log(`reasoning: ${m.reasoning}`);

const before = String(await read(ledger, "get_balance", [me]));
if (m.status === "resolved" || m.status === "void") {
  try {
    await write("claim", [id]);
    console.log("claimed");
  } catch (e) {
    console.log("claim error:", String(e?.message || e).slice(0, 200));
  }
}
// small settle delay for read consistency
await new Promise((r) => setTimeout(r, 8000));
const after = String(await read(ledger, "get_balance", [me]));
console.log(`balance before claim=${before} after=${after}`);
console.log("DONE");
