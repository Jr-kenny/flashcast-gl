// Live smoke: deposit ETH into the CreditVault on Base Sepolia, tagged with a
// GenLayer profile. Prints the block to scan from so the relayer can mirror it.
//
//   usage: node deploy/smoke-deposit.mjs <profile> <amountEth>
import "dotenv/config";
import { Contract, JsonRpcProvider, Wallet, parseEther, zeroPadValue } from "ethers";

const rpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const pk = process.env.BASE_SEPOLIA_PRIVATE_KEY;
const vault = process.env.CREDIT_VAULT_CONTRACT_ADDRESS;
if (!pk || !vault) throw new Error("Set BASE_SEPOLIA_PRIVATE_KEY and CREDIT_VAULT_CONTRACT_ADDRESS.");

const profile = process.argv[2];
const amountEth = process.argv[3] || "0.001";
if (!profile) throw new Error("Pass a GenLayer profile address as arg 1.");

const provider = new JsonRpcProvider(rpc);
const wallet = new Wallet(pk, provider);
const fromBlock = await provider.getBlockNumber();
const v = new Contract(vault, ["function depositEth(bytes32 profile) payable"], wallet);

console.log(`Depositing ${amountEth} ETH for profile ${profile}…`);
const tx = await v.depositEth(zeroPadValue(profile, 32), { value: parseEther(amountEth) });
const rec = await tx.wait();
console.log(JSON.stringify({ fromBlock, block: rec.blockNumber, txHash: tx.hash, profile, amountEth }, null, 2));
