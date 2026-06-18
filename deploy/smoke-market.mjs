// Live smoke test: create a market on the deployed PredictionMarket and read it
// back. Proves the GenLayer side is wired and responding. No credits needed.
//
//   GENLAYER_DEPLOYER_PRIVATE_KEY, PREDICTION_MARKET_CONTRACT_ADDRESS required
import "dotenv/config";
import { glClient, waitForReceipt } from "./lib/gl.mjs";

const { client } = glClient();
const market = process.env.PREDICTION_MARKET_CONTRACT_ADDRESS;
if (!market) throw new Error("Set PREDICTION_MARKET_CONTRACT_ADDRESS.");

const closeTime = Math.floor(Date.now() / 1000) + 1800; // 30 min out
console.log("Creating a market…");
const hash = await client.writeContract({
  address: market,
  functionName: "create_market",
  args: [
    "Will ETH close above 3000 USD today?",
    ["Yes", "No"],
    "Was the ETH/USD spot price above 3000 at end of day UTC?",
    "",
    closeTime,
    "Smoke-test market created by deploy/smoke-market.mjs.",
  ],
  value: 0n,
});
await waitForReceipt(client, hash);

const ids = await client.readContract({
  address: market, functionName: "get_market_ids", args: [], jsonSafeReturn: true,
});
console.log("market ids:", ids);
const last = ids[ids.length - 1];
const m = await client.readContract({
  address: market, functionName: "get_market", args: [last], jsonSafeReturn: true,
});
const outcomes = await client.readContract({
  address: market, functionName: "get_outcomes", args: [last], jsonSafeReturn: true,
});
console.log("read back:", { id: m.id, title: m.title, status: m.status, outcomes, close_time: Number(m.close_time) });
