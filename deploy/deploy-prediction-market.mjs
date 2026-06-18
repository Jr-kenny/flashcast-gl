// Deploy the GenLayer PredictionMarket IC.
//
// Constructor args: (ledger, fee_sink). min_open_seconds keeps its default (300)
// in production. The market must be approved as a ledger caller afterwards with
// wire-contracts.mjs so lock_from / award succeed.
//
//   GENLAYER_DEPLOYER_PRIVATE_KEY      required
//   GENLAYER_CHAIN                     default "studionet"
//   CREDIT_LEDGER_CONTRACT_ADDRESS     required
//   PREDICTION_MARKET_FEE_SINK         default: the deployer address
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { glClient, normalizeAddress, waitForReceipt } from "./lib/gl.mjs";

const { client, account, chainKey } = glClient();
const ledger = process.env.CREDIT_LEDGER_CONTRACT_ADDRESS;
if (!ledger) throw new Error("Set CREDIT_LEDGER_CONTRACT_ADDRESS before deploying the market.");
const feeSink = process.env.PREDICTION_MARKET_FEE_SINK || account.address;
const contractPath = resolve(process.cwd(), "contracts", "prediction_market.py");
const deploymentPath = resolve(process.cwd(), "deploy", "deployments", `prediction-market-${chainKey}.json`);

async function deploy() {
  const code = await readFile(contractPath, "utf-8");
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const hash = await client.deployContract({ code, args: [ledger, feeSink], leaderOnly: false });
      const receipt = await waitForReceipt(client, hash);
      const address = normalizeAddress(receipt?.data?.contract_address ?? receipt?.txDataDecoded?.contractAddress);
      if (!address) throw new Error("Deployment returned no contract address.");
      return address;
    } catch (error) {
      lastError = error;
      console.warn(`[deploy-prediction-market] attempt ${attempt} failed: ${error?.message ?? error}`);
      if (attempt === 4) break;
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  throw lastError;
}

const address = await deploy();
const record = {
  network: chainKey,
  deployedAt: new Date().toISOString().slice(0, 10),
  deployer: account.address,
  contract: "PredictionMarket",
  address,
  config: { ledger, feeSink },
};
await mkdir(dirname(deploymentPath), { recursive: true });
await writeFile(deploymentPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
console.log(JSON.stringify(record, null, 2));
console.log(`\nSet PREDICTION_MARKET_CONTRACT_ADDRESS=${address}, then run pnpm wire`);
