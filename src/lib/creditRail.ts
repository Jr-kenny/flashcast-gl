import { BrowserProvider, Contract, keccak256, parseEther, zeroPadValue } from "ethers";
import { CONFIG } from "./config";

const VAULT_ABI = ["function depositEth(bytes32 profile) payable"];

const SIGN_IN_MESSAGE =
  "Sign in to flashcast.\n\nThis signature derives your private betting identity in this browser. " +
  "It is free, never moves funds, and simply proves you control this wallet. " +
  "Signing the same wallet always restores the same identity.";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

async function ensureBaseSepolia(): Promise<void> {
  const hexId = "0x" + CONFIG.baseChainId.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err: any) {
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function connectWallet(): Promise<string> {
  if (!hasWallet()) throw new Error("No EVM wallet found. Install MetaMask to buy credits.");
  const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureBaseSepolia();
  return accounts[0];
}

/** Derive a deterministic GenLayer signing key from a one-time wallet signature.
 *  The same wallet always produces the same key, so the identity (and its credits
 *  and positions) is portable across devices without storing anything secret. */
export async function deriveIdentityFromWallet(): Promise<string> {
  if (!hasWallet())
    throw new Error("No extension wallet found. Install MetaMask, or create a browser identity instead.");
  const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("Wallet connection was rejected.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(SIGN_IN_MESSAGE);
  return keccak256(signature); // 32-byte hex → a valid private key
}

/** Deposit real ETH on Base Sepolia, tagged with the GenLayer profile. The
 *  relayer mints matching credits in the CreditLedger. */
export async function depositEth(amountEth: string, profile: string): Promise<string> {
  if (!CONFIG.vault) throw new Error("Vault address not configured.");
  await connectWallet();
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const vault = new Contract(CONFIG.vault, VAULT_ABI, signer);
  const profileBytes32 = zeroPadValue(profile, 32);
  const tx = await vault.depositEth(profileBytes32, { value: parseEther(amountEth) });
  await tx.wait();
  return tx.hash;
}
