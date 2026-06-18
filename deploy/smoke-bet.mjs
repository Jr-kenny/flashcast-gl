// Live smoke: place a bet and prove the cross-contract lock_from moved credits
// from the bettor into the market's custody. Bettor = the deployer account.
import "dotenv/config";
import { glClient, waitForReceipt } from "./lib/gl.mjs";

const { client, account } = glClient();
const market = process.env.PREDICTION_MARKET_CONTRACT_ADDRESS;
const ledger = process.env.CREDIT_LEDGER_CONTRACT_ADDRESS;
const me = account.address;
const id = process.argv[2] || "M0";
const amount = process.argv[3] || "1000000000000000000"; // 1 credit

const read = (address, fn, args) => client.readContract({ address, functionName: fn, args, jsonSafeReturn: true });

console.log("bettor:", me);
console.log("balance before:    ", String(await read(ledger, "get_balance", [me])));
console.log("market custody before:", String(await read(ledger, "get_balance", [market])));

console.log(`placing bet: ${amount} atto on ${id} outcome 0…`);
const hash = await client.writeContract({ address: market, functionName: "place_bet", args: [id, 0, amount], value: 0n });
await waitForReceipt(client, hash);

const m = await read(market, "get_market", [id]);
console.log("balance after:     ", String(await read(ledger, "get_balance", [me])));
console.log("market custody after: ", String(await read(ledger, "get_balance", [market])));
console.log("market pool:       ", String(m.pool));
console.log("my stake on Yes:   ", String(await read(market, "get_stake", [id, me, 0])));
console.log("outcome0 total:    ", String(await read(market, "get_outcome_total", [id, 0])));
