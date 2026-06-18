// Wire the deployed contracts together on GenLayer:
//  1. approve the PredictionMarket as a CreditLedger caller (so lock_from/award work)
//  2. (re)set the ledger bridge authority to the relayer wallet
//
//   GENLAYER_DEPLOYER_PRIVATE_KEY      required (must be the ledger owner)
//   GENLAYER_CHAIN                     default "studionet"
//   CREDIT_LEDGER_CONTRACT_ADDRESS     required
//   PREDICTION_MARKET_CONTRACT_ADDRESS required
//   CREDIT_LEDGER_BRIDGE               bridge authority (default: deployer address)
import "dotenv/config";
import { glClient, waitForReceipt } from "./lib/gl.mjs";

const { client, account } = glClient();
const ledger = process.env.CREDIT_LEDGER_CONTRACT_ADDRESS;
const market = process.env.PREDICTION_MARKET_CONTRACT_ADDRESS;
if (!ledger || !market) {
  throw new Error("Set CREDIT_LEDGER_CONTRACT_ADDRESS and PREDICTION_MARKET_CONTRACT_ADDRESS.");
}
const bridge = process.env.CREDIT_LEDGER_BRIDGE || account.address;

async function write(functionName, args) {
  const hash = await client.writeContract({ address: ledger, functionName, args, value: 0n });
  await waitForReceipt(client, hash);
  console.log(`[wire] ${functionName}(${args.join(", ")})`);
}

await write("approve_caller", [market, true]);
await write("set_bridge", [bridge]);
console.log("\nLedger wired: market approved as caller, bridge authority set.");
