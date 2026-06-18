export const CONFIG = {
  glChain: (import.meta.env.VITE_GENLAYER_CHAIN as string) ?? "studionet",
  glEndpoint: (import.meta.env.VITE_GENLAYER_ENDPOINT as string) ?? "",
  ledger: (import.meta.env.VITE_CREDIT_LEDGER_ADDRESS as string) ?? "",
  market: (import.meta.env.VITE_PREDICTION_MARKET_ADDRESS as string) ?? "",
  vault: (import.meta.env.VITE_CREDIT_VAULT_ADDRESS as string) ?? "",
  baseChainId: Number(import.meta.env.VITE_BASE_SEPOLIA_CHAIN_ID ?? 84532),
};

/** True once the contract addresses are wired in .env, so live reads/writes work. */
export const isConfigured = () => Boolean(CONFIG.market && CONFIG.ledger);
