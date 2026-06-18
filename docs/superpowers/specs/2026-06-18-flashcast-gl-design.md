# flashcast-gl design

Date: 2026-06-18
Status: approved, ready for implementation planning

## Overview

flashcast-gl is a social prediction market where GenLayer is the settlement
brain. Users buy credits with real ETH, bet those credits into parimutuel pools
on markets that anyone can create, and a GenLayer Intelligent Contract resolves
each market on its own by reading the web and using an LLM under the Equivalence
Principle. Winners split the pool. Credits can be cashed back out to ETH.

The point of the project is that there is no oracle and no admin deciding
outcomes. The chain reads the world and settles the truth. That is what makes it
worth building on GenLayer instead of a normal EVM chain.

## Goals

- Buy credits by depositing real ETH on Base Sepolia.
- Anyone can create a market with a title, a set of allowed outcomes, a
  resolution question, an optional source URL, and a close time.
- Bet credits on an outcome before the market closes.
- After close, the market resolves autonomously from web plus LLM judgment.
- Winners claim a pro-rata share of the pool.
- Cash credits back out to ETH.
- A simple leaderboard ranked by net profit.

## Non-goals for v1

- XP and points systems.
- Comments, follows, notifications, social graph.
- USDC and other token deposits. The rail already supports them, but v1 is
  ETH only.
- AMM or LMSR pricing. v1 is parimutuel only.
- Mainnet. v1 targets GenLayer Studionet and Base Sepolia.

## Architecture

Three layers. The first two are lifted from the verdictdotfun credit rail, which
is already deployed and working. The third is new and is where the real work is.

### Layer A: credit rail, reused from verdictdotfun

- `CreditVault.sol` on Base Sepolia. `depositEth(profile)` custodies real ETH and
  emits `CreditPurchased(user, token, profile, amount, nonce)`. Bridge-gated
  `redeem(user, token, amount, redeemId)` pays ETH back out. Pausable,
  ownable, reentrancy guarded. Lifted as is.
- `credit-bridge.mjs` relayer. The deposit sync and redeem sync stay identical.
  Its third job, which in verdictdotfun finalized game rooms, gets repointed to
  poke market resolution instead. See Layer C.

### Layer B: CreditLedger Intelligent Contract, reused and lightly adapted

Keep from the existing `credit_ledger.py`:

- `credit(profile, atto_amount, deposit_ref)`, bridge only and idempotent via the
  processed-deposits set.
- `balances` as a per-profile TreeMap of atto-credits.
- `request_redeem` and `mark_redeem_settled` for the cash-out path.
- `approved_callers`, owner and bridge admin controls.
- `get_balance` view.

Replace the two-player escrow methods (`open_escrow`, `set_provisional`,
`finalize_winner`, `finalize_tie`, `finalize_void`) with two generic
approved-caller primitives so the ledger stays a clean credit bank:

- `lock_from(bettor, amount)`: approved caller only. Checks the bettor has the
  balance, debits the bettor, and credits the calling market contract's own
  ledger balance. This is how a bet moves credits into a market's custody.
- `award(profile, amount)`: approved caller only. Moves credits from the calling
  market contract's balance to a winner. This is how a payout lands.

The market contract is registered as an approved caller. It is trusted to name
the correct bettor address, which it knows from `gl.message.sender_address` when
the user calls it directly. This is the same trust model verdictdotfun uses for
its mode contracts.

### Layer C: PredictionMarket Intelligent Contract, new

State per market, stored in a TreeMap keyed by market id:

- id, creator, title, description
- outcomes, the list of allowed outcome labels
- resolution_question
- source_url, optional
- close_time as a unix timestamp
- status, one of open, resolving, resolved, void
- winning_outcome, an index, unset until resolved
- pool, total atto-credits staked
- fee_bps, the protocol fee in basis points

Per-outcome stake totals and per-bettor stakes are stored in TreeMaps keyed by
composite string keys, the same pattern verdictdotfun uses for room ids. A
claimed flag per (market, bettor) prevents double claims.

Methods:

- `create_market(title, outcomes, resolution_question, source_url, close_time)`.
  Any user. Guardrails: a minimum close time in the future, at least two
  outcomes, and the creator cannot self-resolve. The resolver is the contract.
- `place_bet(market_id, outcome, amount)`. Reads `bettor =
  gl.message.sender_address`, requires the market is open and before close,
  calls `ledger.lock_from(bettor, amount)`, then records the bettor's stake on
  that outcome and adds to the outcome total and the pool.
- `resolve(market_id)`. Allowed only after close_time and while open. Runs a
  non-deterministic block that searches or reads the source, then asks an LLM to
  pick the winning outcome from the allowed set. Validators agree on the result
  through the Equivalence Principle. Sets winning_outcome and status to resolved.
  If the result cannot be mapped to an allowed outcome, the market goes to void.
- `claim(market_id)`. Claim pattern, not a payout loop. Each winner pulls their
  own share. payout = pool times your_winning_stake divided by
  total_winning_stake, minus the fee. Calls `ledger.award(bettor, payout)` and
  sets the claimed flag.

The claim pattern matters because the GenLayer Python subset dislikes unbounded
loops. Iterating every winner inside resolve would not scale. Letting each winner
claim keeps every call bounded.

## Data flow, happy path

1. User deposits ETH into `CreditVault` on Base Sepolia, tagged with their
   GenLayer profile.
2. The relayer sees `CreditPurchased` and calls `credit` on `CreditLedger`, which
   mints atto-credits to the profile.
3. User calls `place_bet` on `PredictionMarket`, which calls `lock_from` to move
   credits into the market's custody and records the stake.
4. close_time passes. The relayer pokes `resolve(market_id)`.
5. The Intelligent Contract reads the web and an LLM picks the winning outcome
   under the Equivalence Principle.
6. Each winner calls `claim`, which calls `award` to pay out their share.
7. Optionally the user calls `request_redeem`, the relayer drains it, and
   `CreditVault.redeem` returns ETH.

## Resolution design, the GenLayer backbrain

When a market closes, `resolve` runs a non-deterministic block. It fetches the
source URL if one was given, otherwise it searches the open web for the
resolution question. It then prompts an LLM to choose exactly one label from the
allowed outcomes, or to report that the outcome is not yet determinable. The
Equivalence Principle is used so validators converge on the same answer despite
each running the lookup independently. The exact GenLayer API for web access and
the comparative equivalence prompt is settled during implementation against the
genlayer write-contract guidance, since the API surface should be pinned to a
concrete runner version rather than guessed.

If the LLM reports the outcome is not determinable, resolve leaves the market
open for a later retry. If it returns something outside the allowed set, the
market goes void.

## Payout math

Parimutuel. For a resolved market with winning outcome w:

- total_winning_stake is the sum of all stakes placed on w.
- pool is the sum of all stakes across all outcomes.
- A winner who staked s on w receives floor(pool times s divided by
  total_winning_stake) reduced by fee_bps.

Edge cases:

- No bets at all: market goes void, nothing to pay.
- No bets on the winning outcome: market goes void, every bettor can claim back
  their own total stake.
- Market voided for any reason: claim refunds each bettor their own stake across
  all outcomes.

Integer math only. Use atto-credits throughout to keep precision, matching the
ledger.

## Frontend

Reuse the verdictdotfun stack: React, Vite, TypeScript, Tailwind, shadcn,
`genlayer-js` for Intelligent Contract reads and writes, and ethers or wagmi for
the Base Sepolia deposit.

Pages:

- Feed: live markets with crowd-derived odds from the pool split.
- Market detail: place a bet, see the pool, see resolution status.
- Create market: title, outcomes, resolution question, source URL, close time.
- Credits: buy credits with ETH, cash credits out to ETH.
- Leaderboard: ranked by net profit.
- Profile: a user's open bets, history, and balance.

Identity is the GenLayer profile address. Deposits on Base Sepolia are tagged
with the profile as bytes32, the same mapping verdictdotfun uses.

## Deployment targets

- GenLayer Studionet for the Intelligent Contracts, plus localnet for
  development. Studionet is where the verdictdotfun contracts already live, so
  tooling and keys carry over.
- Base Sepolia for `CreditVault`.

## Risks and open questions

- Resolution quality. Vague resolution questions or thin web coverage can make
  the LLM uncertain. The not-determinable path and the void path absorb this,
  but market creators need clear guidance in the create form.
- Relayer liveness. Resolution is poked by the relayer. If it is down, markets
  resolve late. A public resolve call already exists, so anyone can poke it,
  which is an acceptable fallback.
- GenLayer Python subset limits. No unbounded loops, restricted standard
  library. The claim pattern and composite-key TreeMaps are chosen to stay
  inside those limits.
- Fee handling. Where the fee accrues and who can withdraw it is a small open
  detail to settle during planning.
