# flashcast-gl

A social prediction market where GenLayer is the settlement brain. Users buy
credits with real ETH, bet those credits into parimutuel pools on markets that
anyone can create, and a GenLayer Intelligent Contract resolves each market on
its own by reading the web and using an LLM under the Equivalence Principle.
Winners split the pool. Credits cash back out to ETH.

There is no oracle and no admin deciding outcomes. The chain reads the world and
settles the truth. That is the whole reason this runs on GenLayer.

## How it works

1. You deposit ETH into `CreditVault` on Base Sepolia, tagged with your GenLayer
   profile.
2. A relayer sees the deposit and mints matching credits in the GenLayer
   `CreditLedger`.
3. You bet credits on an outcome in `PredictionMarket`. Stakes pool per outcome.
4. When betting closes, the market resolves itself: it reads the resolution
   source (or the open web) and an LLM picks the winning outcome, with validators
   agreeing through the Equivalence Principle.
5. Winners claim a pro-rata share of the pool, minus a small fee.
6. You can request a redeem at any time to pull credits back out to ETH.

## Architecture

Three layers. The credit rail is reused from the verdictdotfun project; the
prediction market is new.

| Layer | Where | What |
| --- | --- | --- |
| `CreditVault.sol` | Base Sepolia | Custodies real ETH, emits deposit events, pays redeems (bridge-gated). |
| `credit-bridge.mjs` | relayer | Mirrors deposits into credits, settles redeems, pokes market resolution after close. |
| `credit_ledger.py` | GenLayer | Credit bank: idempotent crediting, balances, `lock_from`/`award` for markets, redeem queue. |
| `prediction_market.py` | GenLayer | Markets, parimutuel pools, autonomous web+LLM resolution, claim-pattern payouts. |
| React app | browser | Feed, market detail, create, credits, leaderboard, profile. |

## Contracts

- `contracts/credit_ledger.py` — `credit` (bridge, idempotent), `lock_from` and
  `award` (approved market callers only), `request_redeem` (caller-initiated) and
  `mark_redeem_settled` (bridge), `get_balance`.
- `contracts/prediction_market.py` — `create_market`, `place_bet`, `resolve`
  (the web+LLM Equivalence-Principle block), `claim` (parimutuel payout and void
  refund), plus market and stake views. Payout uses a claim pattern so it never
  runs an unbounded loop, which the GenLayer Python subset dislikes.
- `contracts/evm/CreditVault.sol` — ETH/ERC-20 custody on Base Sepolia.

## Develop and test

GenLayer contracts (direct mode, in-memory, no node needed):

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
pnpm test:gl      # 22 direct-mode tests
pnpm lint:gl      # genvm-lint validate on both contracts
```

EVM vault:

```bash
pnpm install
pnpm test:evm     # 10 hardhat tests
```

Frontend:

```bash
pnpm dev          # http://localhost:5173
pnpm build        # typecheck + production build
```

## Deploy

Copy `.env.example` to `.env` and fill it in, then:

```bash
pnpm deploy:vault     # CreditVault on Base Sepolia
pnpm deploy:ledger    # CreditLedger on GenLayer
pnpm deploy:market    # PredictionMarket on GenLayer
pnpm wire             # approve the market as a ledger caller, set the bridge
CREDIT_BRIDGE_ENABLED=1 pnpm bridge   # run the relayer
```

Then set the `VITE_*` contract addresses in `.env` so the frontend loads live
markets.

## Live deployment

Deployed 2026-06-18 on GenLayer Studionet and Base Sepolia:

| Contract | Network | Address |
| --- | --- | --- |
| CreditLedger | Studionet | `0x1b9De0F8280Bea1c482a980c1EA83740C25F1070` |
| PredictionMarket | Studionet | `0x42E4CAb02F51c531b43b14752F87133271c28eA4` |
| CreditVault | Base Sepolia | `0x7460acF508d73703802A26EE21bCaAD889a08757` |

The market is wired as an approved ledger caller. `deploy/smoke-market.mjs`
creates a market and reads it back; the first live market (`M0`) is already up.

## Notes and limits

- Direct-mode tests freeze block time at deploy, so the market uses inclusive
  open/close boundaries and a `min_open_seconds` constructor param (default 300,
  tests use 0) to exercise the full bet to resolve to claim flow at one instant.
  The real market to ledger wiring is meant to be checked with integration tests
  against a live node.
- The protocol fee accrues in the market contract's own ledger balance. A
  withdrawal path for the fee sink is a planned follow-up.
- v1 is ETH-only deposits, parimutuel only, on Studionet plus Base Sepolia.
