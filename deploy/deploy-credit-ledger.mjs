// Deploy the GenLayer CreditLedger IC.
//
// The ledger holds atto-credit balances. `bridge` is the trusted relayer
// authority that credits deposits and settles redeems (the same wallet the
// credit-bridge runner uses). Approved market contracts are wired separately by
// wire-contracts.mjs.
//
//   GENLAYER_DEPLOYER_PRIVATE_KEY   required
//   GENLAYER_CHAIN                  default "studionet"
//   CREDIT_LEDGER_BRIDGE            bridge authority (default: the deployer address)
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { glClient, normalizeAddress, waitForReceipt } from "./lib/gl.mjs";

const { client, account, chainKey } = glClient();
const bridge = process.env.CREDIT_LEDGER_BRIDGE || account.address;
const contractPath = resolve(process.cwd(), "contracts", "credit_ledger.py");
const deploymentPath = resolve(process.cwd(), "deploy", "deployments", `credit-ledger-${chainKey}.json`);

async function deploy() {
  const code = await readFile(contractPath, "utf-8");
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const hash = await client.deployContract({ code, args: [bridge], leaderOnly: false });
      const receipt = await waitForReceipt(client, hash);
      const address = normalizeAddress(receipt?.data?.contract_address ?? receipt?.txDataDecoded?.contractAddress);
      if (!address) throw new Error("Deployment returned no contract address.");
      return address;
    } catch (error) {
      lastError = error;
      console.warn(`[deploy-credit-ledger] attempt ${attempt} failed: ${error?.message ?? error}`);
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
  contract: "CreditLedger",
  address,
  config: { bridge },
};
await mkdir(dirname(deploymentPath), { recursive: true });
await writeFile(deploymentPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
console.log(JSON.stringify(record, null, 2));
console.log(`\nSet CREDIT_LEDGER_CONTRACT_ADDRESS=${address}`);
