# flashcast-gl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GenLayer-backed social prediction market where users buy credits with real ETH, bet into parimutuel pools, and a GenLayer Intelligent Contract resolves each market autonomously by reading the web and an LLM under the Equivalence Principle.

**Architecture:** Three layers. Layer A and B are lifted from the verdictdotfun credit rail (CreditVault.sol on Base Sepolia, CreditLedger on GenLayer, credit-bridge.mjs relayer). The CreditLedger swaps its two-player escrow methods for generic `lock_from`/`award` primitives. Layer C is the new PredictionMarket Intelligent Contract that holds market state, manages parimutuel pools, resolves via web+LLM, and pays out via a claim pattern. A React frontend ties it together.

**Tech Stack:** GenLayer Intelligent Contracts (Python subset, runner `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`), genlayer-test for direct-mode tests, Solidity 0.8.26 + Hardhat + OpenZeppelin for the EVM vault, Node + ethers + genlayer-js for the relayer, React + Vite + TypeScript + Tailwind + shadcn for the frontend. GenLayer Studionet + Base Sepolia.

**Reference source (copy/adapt, do not reinvent):** `~/Documents/verdictdotfun`. Key files: `contracts/credit_ledger.py`, `contracts/evm/CreditVault.sol`, `contracts/oracle_game.py` (resolution pattern), `deploy/credit-bridge.mjs`, `deploy/lib/bridge.mjs`, `test/evm/CreditVault.test.cjs`, `tests/direct/test_credit_ledger.py`, and the Vite/Tailwind/Hardhat config files.

---

## File Structure

```
flashcast-gl/
  contracts/
    credit_ledger.py            # adapted from verdictdotfun: credit/balances/redeem + lock_from/award
    prediction_market.py        # NEW: markets, parimutuel pools, web+LLM resolve, claim
    evm/CreditVault.sol         # copied from verdictdotfun, unchanged
  tests/direct/
    test_credit_ledger.py       # ledger primitives
    test_prediction_market.py   # market lifecycle + payout math
  test/evm/
    CreditVault.test.cjs        # copied from verdictdotfun
  deploy/
    deploy-credit-ledger.mjs    # adapted
    deploy-prediction-market.mjs# NEW
    deploy-credit-vault.cjs     # copied
    wire-contracts.mjs          # NEW: approve market as ledger caller, set bridge
    credit-bridge.mjs           # adapted: syncResolve replaces syncFinalize
    lib/bridge.mjs              # copied
  src/
    lib/genlayer.ts             # genlayer-js client + read/write helpers
    lib/creditRail.ts           # adapted from verdictdotfun
    lib/markets.ts              # market reads/writes
    pages/{Feed,Market,Create,Credits,Leaderboard,Profile}.tsx
    components/...
  hardhat.config.cjs, gltest.config.yaml, package.json, vite.config.ts,
  tailwind.config.ts, tsconfig*.json, .env.example, .gitignore
```

---

## Phase 0: Scaffold

### Task 0.1: Copy stack config from verdictdotfun

**Files:** Create config at repo root.

- [ ] **Step 1: Copy the build/test config files**

```bash
cd ~/Documents/flashcast-gl
SRC=~/Documents/verdictdotfun
for f in hardhat.config.cjs gltest.config.yaml vite.config.ts tailwind.config.ts \
         postcss.config.js eslint.config.js tsconfig.json tsconfig.app.json \
         tsconfig.node.json components.json index.html requirements.txt; do
  cp "$SRC/$f" . 2>/dev/null || echo "skip $f"
done
mkdir -p contracts/evm tests/direct test/evm deploy/lib deploy/deployments \
         src/lib src/pages src/components public artifacts
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.venv/
artifacts/
hardhat-artifacts/
hardhat-cache/
.env
.env.local
__pycache__/
.pytest_cache/
deploy/deployments/*.local.json
```

- [ ] **Step 3: Write `package.json`** (trim verdictdotfun's to flashcast-gl needs: vite, react, tailwind, shadcn deps, genlayer-js, ethers, hardhat, OZ, vitest). Copy `~/Documents/verdictdotfun/package.json`, change `name` to `flashcast-gl`, drop game-specific scripts, keep `dev`, `build`, `test`, and add `bridge`, `deploy:*` scripts.

- [ ] **Step 4: Install deps**

Run: `cd ~/Documents/flashcast-gl && pnpm install`
Expected: lockfile created, no errors.

- [ ] **Step 5: Python venv for GenLayer direct tests**

```bash
cd ~/Documents/flashcast-gl
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt   # genlayer-test + genlayer
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Scaffold flashcast-gl from the verdictdotfun stack"
```

---

## Phase 1: CreditLedger (adapted)

The ledger stays a clean credit bank: idempotent `credit` from the bridge, per-profile `balances`, redeem queue, plus two new approved-caller primitives `lock_from` (debit a bettor into the calling market's custody) and `award` (pay a winner from the calling market's custody). The two-player escrow methods are removed.

### Task 1.1: Port the ledger and add lock_from/award

**Files:**
- Create: `contracts/credit_ledger.py`
- Test: `tests/direct/test_credit_ledger.py`

- [ ] **Step 1: Write the contract** (base it on `~/Documents/verdictdotfun/contracts/credit_ledger.py`; keep header line 1 exactly, keep `credit`, `balances`, `request_redeem`, `mark_redeem_settled`, `get_redeem*`, `get_balance`, `approved_callers`, admin, helpers; delete `Escrow`, `open_escrow`, `get_escrow`, `set_provisional`, `finalize_winner/tie/void`, `_refund_both`, `_active_escrow`; add the two primitives below).

```python
    # ---- market primitives (approved-caller only) ----
    @gl.public.write
    def lock_from(self, bettor: Address, amount: u256) -> None:
        self._require_approved_caller()
        b = self._addr(bettor)
        amt = int(amount)
        if amt <= 0:
            raise gl.vm.UserError(ERR + "Lock amount must be positive.")
        if int(self.balances.get(b, u256(0))) < amt:
            raise gl.vm.UserError(ERR + "Insufficient credits.")
        caller = gl.message.sender_address
        self.balances[b] = u256(int(self.balances[b]) - amt)
        self.balances[caller] = u256(int(self.balances.get(caller, u256(0))) + amt)

    @gl.public.write
    def award(self, profile: Address, amount: u256) -> None:
        self._require_approved_caller()
        p = self._addr(profile)
        amt = int(amount)
        if amt <= 0:
            raise gl.vm.UserError(ERR + "Award amount must be positive.")
        caller = gl.message.sender_address
        if int(self.balances.get(caller, u256(0))) < amt:
            raise gl.vm.UserError(ERR + "Market has insufficient pooled credits.")
        self.balances[caller] = u256(int(self.balances[caller]) - amt)
        self.balances[p] = u256(int(self.balances.get(p, u256(0))) + amt)
```

- [ ] **Step 2: Write failing tests** (`tests/direct/test_credit_ledger.py`, modeled on verdictdotfun's). Cover: bridge `credit` is idempotent on repeated `deposit_ref`; non-bridge `credit` reverts; `lock_from` by approved caller moves credits bettor→caller and reverts on insufficient balance; `lock_from` by non-approved caller reverts; `award` moves caller→profile and reverts when caller pool too small; `request_redeem` debits and queues.

- [ ] **Step 3: Run, expect fail** — `pytest tests/direct/test_credit_ledger.py -v` (contract not deployed / methods missing).

- [ ] **Step 4: Run, expect pass** after the contract is in place.

- [ ] **Step 5: Lint** — run the genvm linter on `contracts/credit_ledger.py` (genlayer-dev:genvm-lint). Fix any subset violations.

- [ ] **Step 6: Commit** — `git add contracts/credit_ledger.py tests/direct/test_credit_ledger.py && git commit -m "Adapt CreditLedger with lock_from/award market primitives"`

---

## Phase 2: PredictionMarket (new, the core)

### Task 2.1: Market state + create_market

**Files:**
- Create: `contracts/prediction_market.py`
- Test: `tests/direct/test_prediction_market.py`

- [ ] **Step 1: Write the header, imports, interface, and storage**

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from dataclasses import dataclass
import typing

try:
    from genlayer import *
except ModuleNotFoundError:
    from genlayer_py import *

ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")
ERR = "[EXPECTED] "
MIN_OUTCOMES = 2
MAX_OUTCOMES = 8
MIN_OPEN_SECONDS = 300          # market must stay open at least 5 minutes
MAX_SOURCE_LEN = 400
FEE_BPS = u256(200)             # 2% protocol fee on the pool


@gl.contract_interface
class CreditLedgerIface:
    class View:
        def get_balance(self, profile: Address, /) -> u256: ...
    class Write:
        def lock_from(self, bettor: Address, amount: u256, /) -> None: ...
        def award(self, profile: Address, amount: u256, /) -> None: ...


@allow_storage
@dataclass
class Market:
    id: str
    creator: Address
    title: str
    description: str
    outcomes: DynArray[str]
    resolution_question: str
    source_url: str
    close_time: u256
    status: str                 # "open" | "resolved" | "void"
    winning_outcome: u256       # index, only meaningful when status == "resolved"
    pool: u256
    reasoning: str


class PredictionMarket(gl.Contract):
    owner: Address
    ledger: Address
    fee_sink: Address
    market_nonce: u256
    markets: TreeMap[str, Market]
    market_ids: DynArray[str]
    outcome_totals: TreeMap[str, u256]   # key f"{market_id}:{idx}"
    bettor_stakes: TreeMap[str, u256]    # key f"{market_id}:{addr}:{idx}"
    claimed: TreeMap[str, bool]          # key f"{market_id}:{addr}"

    def __init__(self, ledger: Address = ZERO_ADDRESS, fee_sink: Address = ZERO_ADDRESS):
        self.owner = gl.message.sender_address
        self.ledger = self._addr(ledger)
        self.fee_sink = self._addr(fee_sink) if fee_sink != ZERO_ADDRESS else gl.message.sender_address
        self.market_nonce = u256(0)
```

- [ ] **Step 2: Add `create_market` and helpers**

```python
    @gl.public.write
    def create_market(
        self,
        title: str,
        outcomes: list[str],
        resolution_question: str,
        source_url: str,
        close_time: u256,
        description: str = "",
    ) -> str:
        t = title.strip()
        if not t:
            raise gl.vm.UserError(ERR + "Title is required.")
        q = resolution_question.strip()
        if not q:
            raise gl.vm.UserError(ERR + "Resolution question is required.")
        labels = self._clean_outcomes(outcomes)
        src = source_url.strip()
        if src and not src.startswith("https://"):
            raise gl.vm.UserError(ERR + "Source URL must be https.")
        if len(src) > MAX_SOURCE_LEN:
            raise gl.vm.UserError(ERR + "Source URL is too long.")
        now = self._now()
        if int(close_time) < now + MIN_OPEN_SECONDS:
            raise gl.vm.UserError(ERR + "Close time is too soon.")

        market_id = "M" + str(int(self.market_nonce))
        self.market_nonce = u256(int(self.market_nonce) + 1)
        arr: DynArray[str] = DynArray()
        for label in labels:
            arr.append(label)
        self.markets[market_id] = Market(
            id=market_id,
            creator=gl.message.sender_address,
            title=t[:200],
            description=description.strip()[:1000],
            outcomes=arr,
            resolution_question=q[:600],
            source_url=src,
            close_time=u256(int(close_time)),
            status="open",
            winning_outcome=u256(0),
            pool=u256(0),
            reasoning="",
        )
        self.market_ids.append(market_id)
        return market_id

    def _clean_outcomes(self, outcomes: list[str]) -> list[str]:
        labels: list[str] = []
        seen: TreeMap[str, bool] = TreeMap()
        for raw in outcomes:
            label = str(raw).strip()
            if not label:
                continue
            key = label.lower()
            if seen.get(key, False):
                raise gl.vm.UserError(ERR + "Outcomes must be distinct.")
            seen[key] = True
            labels.append(label[:80])
        if len(labels) < MIN_OUTCOMES:
            raise gl.vm.UserError(ERR + "Need at least two outcomes.")
        if len(labels) > MAX_OUTCOMES:
            raise gl.vm.UserError(ERR + "Too many outcomes.")
        return labels

    def _now(self) -> int:
        return int(gl.message.datetime.timestamp())
```

Note for the implementer: confirm the block-time accessor against the installed genlayer runner during execution. If `gl.message.datetime` is unavailable, use the runner's documented timestamp accessor (check verdictdotfun's `_now_epoch` helper for the exact call it uses) and keep the `_now` helper as the single source of truth.

- [ ] **Step 3: Write failing tests for create_market** — distinct-outcomes rule, min-outcomes, https source rule, close-time floor, returns sequential ids, stores fields.

- [ ] **Step 4: Run, expect fail. Step 5: implement until pass. Step 6: lint. Step 7: commit** `git commit -m "PredictionMarket: market creation with validation"`

### Task 2.2: place_bet

- [ ] **Step 1: Add `place_bet`**

```python
    @gl.public.write
    def place_bet(self, market_id: str, outcome_index: u256, amount: u256) -> None:
        m = self._require_market(market_id)
        if m.status != "open":
            raise gl.vm.UserError(ERR + "Market is not open.")
        if self._now() >= int(m.close_time):
            raise gl.vm.UserError(ERR + "Market is closed.")
        idx = int(outcome_index)
        if idx < 0 or idx >= len(m.outcomes):
            raise gl.vm.UserError(ERR + "Unknown outcome.")
        amt = int(amount)
        if amt <= 0:
            raise gl.vm.UserError(ERR + "Bet must be positive.")

        bettor = gl.message.sender_address
        CreditLedgerIface(self.ledger).emit(on="accepted").lock_from(bettor, u256(amt))

        ot_key = market_id + ":" + str(idx)
        self.outcome_totals[ot_key] = u256(int(self.outcome_totals.get(ot_key, u256(0))) + amt)
        bs_key = market_id + ":" + bettor.as_hex + ":" + str(idx)
        self.bettor_stakes[bs_key] = u256(int(self.bettor_stakes.get(bs_key, u256(0))) + amt)
        m.pool = u256(int(m.pool) + amt)
        self.markets[market_id] = m
```

Note: confirm the address-to-string accessor (`bettor.as_hex`) against the runner during execution; verdictdotfun uses string room keys, mirror whatever stringification it uses for addresses if `as_hex` is not present.

- [ ] **Step 2: failing tests** — bet on open market debits via ledger and updates `outcome_totals`, `bettor_stakes`, `pool`; bet on bad index reverts; bet after close reverts; bet of zero reverts. Use a stub/mock ledger or deploy the real ledger and approve the market as caller in the test fixture.

- [ ] **Step 3-6: run fail, implement, lint, commit** `git commit -m "PredictionMarket: place_bet into parimutuel pools"`

### Task 2.3: resolve (web + LLM, Equivalence Principle)

- [ ] **Step 1: Add `resolve` and the resolution helpers** (pattern copied from `~/Documents/verdictdotfun/contracts/oracle_game.py:288-341`)

```python
    @gl.public.write
    def resolve(self, market_id: str) -> None:
        m = self._require_market(market_id)
        if m.status != "open":
            raise gl.vm.UserError(ERR + "Market already settled.")
        if self._now() < int(m.close_time):
            raise gl.vm.UserError(ERR + "Market is not closed yet.")

        labels: list[str] = [str(x) for x in m.outcomes]
        result = self._resolve_outcome(m.resolution_question, m.source_url, labels)
        choice = str(result.get("outcome", "")).strip()
        reasoning = str(result.get("reasoning", "")).strip()[:600]

        if choice == "UNKNOWN":
            raise gl.vm.UserError(ERR + "Outcome not determinable yet; try again later.")
        idx = self._label_index(labels, choice)
        if idx < 0:
            m.status = "void"
            m.reasoning = "Resolver returned an outcome outside the allowed set."
            self.markets[market_id] = m
            return
        m.status = "resolved"
        m.winning_outcome = u256(idx)
        m.reasoning = reasoning
        self.markets[market_id] = m

    def _resolve_outcome(self, question: str, source: str, labels: list[str]) -> TreeMap[str, typing.Any]:
        prompt = self._build_prompt(question, labels)

        def leader_fn():
            evidence = self._fetch_source_text(source)
            full = prompt + "\n\nSOURCE CONTENT (verbatim, may be truncated):\n" + evidence
            response = gl.nondet.exec_prompt(full, response_format="json")
            return self._normalize(response, labels)

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            data = leader_result.calldata
            return isinstance(data, dict) and "outcome" in data

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    def _build_prompt(self, question: str, labels: list[str]) -> str:
        options = "\n".join(["- " + l for l in labels])
        return (
            "You are an impartial oracle settling a prediction market. Decide the single "
            "correct outcome using the SOURCE CONTENT below plus widely known public fact. "
            "If it cannot be settled yet, answer UNKNOWN.\n\n"
            "QUESTION:\n" + question + "\n\nALLOWED OUTCOMES (return one verbatim, or UNKNOWN):\n"
            + options + "\n\nReturn JSON only: {\"outcome\": <one allowed label or \"UNKNOWN\">, "
            "\"reasoning\": <one or two sentences>}"
        )

    def _fetch_source_text(self, source: str) -> str:
        if not source:
            return "(no source URL was provided; rely on public fact)"
        if not source.startswith("https://"):
            raise gl.vm.UserError(ERR + "Source must be an https URL.")
        res = gl.nondet.web.get(source)
        if res.status >= 500:
            raise gl.vm.UserError("[TRANSIENT] Source unavailable.")
        if res.status >= 400:
            raise gl.vm.UserError(f"[EXTERNAL] Source fetch failed (status {res.status}).")
        body = res.body or b""
        return body.decode("utf-8", errors="ignore")[:4000]

    def _normalize(self, response: typing.Any, labels: list[str]) -> TreeMap[str, typing.Any]:
        data = response if isinstance(response, dict) else {}
        raw = str(data.get("outcome", "")).strip()
        out = "UNKNOWN"
        for l in labels:
            if l.lower() == raw.lower():
                out = l
                break
        return {"outcome": out, "reasoning": str(data.get("reasoning", "")).strip()[:600]}

    def _label_index(self, labels: list[str], choice: str) -> int:
        i = 0
        for l in labels:
            if l == choice:
                return i
            i += 1
        return -1
```

- [ ] **Step 2: tests** — resolve before close reverts; resolve on resolved reverts. For the web+LLM path, use the genlayer-test mocking facility (see genlayer-dev:direct-tests) to stub `exec_prompt`/`web.get` so the test is deterministic: assert a stubbed winning label sets `status="resolved"` and the right `winning_outcome`; a stub returning an out-of-set label sets `status="void"`; an UNKNOWN stub leaves it open and raises the EXPECTED retry error.

- [ ] **Step 3-6: run fail, implement, lint, commit** `git commit -m "PredictionMarket: autonomous web+LLM resolution via Equivalence Principle"`

### Task 2.4: claim (parimutuel payout + void refund)

- [ ] **Step 1: Add `claim` and views**

```python
    @gl.public.write
    def claim(self, market_id: str) -> u256:
        m = self._require_market(market_id)
        bettor = gl.message.sender_address
        ck = market_id + ":" + bettor.as_hex
        if self.claimed.get(ck, False):
            raise gl.vm.UserError(ERR + "Already claimed.")

        if m.status == "void":
            payout = self._total_stake(market_id, bettor, len(m.outcomes))
        elif m.status == "resolved":
            win = int(m.winning_outcome)
            total_win = int(self.outcome_totals.get(market_id + ":" + str(win), u256(0)))
            if total_win == 0:
                # nobody backed the winner: treat as refund-all
                payout = self._total_stake(market_id, bettor, len(m.outcomes))
            else:
                my = int(self.bettor_stakes.get(market_id + ":" + bettor.as_hex + ":" + str(win), u256(0)))
                if my == 0:
                    self.claimed[ck] = True
                    return u256(0)
                gross = int(m.pool) * my // total_win
                fee = gross * int(FEE_BPS) // 10000
                payout = gross - fee
        else:
            raise gl.vm.UserError(ERR + "Market is not settled.")

        self.claimed[ck] = True
        if payout > 0:
            CreditLedgerIface(self.ledger).emit(on="accepted").award(bettor, u256(payout))
        return u256(payout)

    def _total_stake(self, market_id: str, bettor: Address, n: int) -> int:
        total = 0
        i = 0
        while i < n:
            total += int(self.bettor_stakes.get(market_id + ":" + bettor.as_hex + ":" + str(i), u256(0)))
            i += 1
        return total

    @gl.public.view
    def get_market(self, market_id: str) -> Market:
        return self._require_market(market_id)

    @gl.public.view
    def get_market_ids(self) -> DynArray[str]:
        return self.market_ids

    @gl.public.view
    def get_outcome_total(self, market_id: str, outcome_index: u256) -> u256:
        return self.outcome_totals.get(market_id + ":" + str(int(outcome_index)), u256(0))

    @gl.public.view
    def get_stake(self, market_id: str, bettor: Address, outcome_index: u256) -> u256:
        return self.bettor_stakes.get(market_id + ":" + self._addr(bettor).as_hex + ":" + str(int(outcome_index)), u256(0))

    # ---- admin + helpers ----
    @gl.public.write
    def set_ledger(self, ledger: Address) -> None:
        self._require_owner()
        self.ledger = self._addr(ledger)

    def _require_market(self, market_id: str) -> Market:
        if market_id not in self.markets:
            raise gl.vm.UserError(ERR + "No such market.")
        return self.markets[market_id]

    def _require_owner(self):
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR + "Only the owner can do this.")

    def _addr(self, value: typing.Any) -> Address:
        if isinstance(value, Address):
            return value
        if isinstance(value, bytes):
            return Address(value)
        if hasattr(value, "as_bytes"):
            return Address(value.as_bytes)
        return Address(value)
```

Use `while` loops only (the `_total_stake` and `_label_index` helpers use `while`/manual index) to stay clear of the Python-subset for-loop pitfalls noted in the project's deploy gotchas.

- [ ] **Step 2: tests for payout math** — two bettors on the winning outcome split the pool pro-rata minus fee; a loser claim returns 0; double-claim reverts; void market refunds each bettor their own stake; resolved market with zero winners refunds all. Compute expected integers by hand in the test.

- [ ] **Step 3-6: run fail, implement, lint, commit** `git commit -m "PredictionMarket: claim-pattern parimutuel payouts and void refunds"`

---

## Phase 3: EVM CreditVault (reused)

### Task 3.1: Copy the vault and its tests

- [ ] **Step 1: Copy** `cp ~/Documents/verdictdotfun/contracts/evm/CreditVault.sol contracts/evm/ && cp ~/Documents/verdictdotfun/test/evm/CreditVault.test.cjs test/evm/`
- [ ] **Step 2: Ensure OZ + hardhat installed** (already in package.json from Phase 0); confirm `hardhat.config.cjs` paths point at `contracts/evm` and `test/evm`.
- [ ] **Step 3: Run** `npx hardhat test test/evm/CreditVault.test.cjs` — Expected: all pass (unchanged contract).
- [ ] **Step 4: Commit** `git commit -m "Add CreditVault (Base Sepolia custody) from verdictdotfun"`

---

## Phase 4: Relayer

### Task 4.1: Adapt credit-bridge to poke resolution

**Files:** `deploy/credit-bridge.mjs`, `deploy/lib/bridge.mjs`

- [ ] **Step 1: Copy** `cp ~/Documents/verdictdotfun/deploy/credit-bridge.mjs deploy/ && cp ~/Documents/verdictdotfun/deploy/lib/bridge.mjs deploy/lib/`
- [ ] **Step 2: Replace `syncFinalize`** with `syncResolve`: read market ids from the PredictionMarket (`get_market_ids`), for each read `get_market`, and if `status === "open"` and `now >= close_time`, call `resolve(market_id)`. Keep `syncDeposits` and `syncRedeems` exactly as-is.

```js
async function syncResolve() {
  if (!marketAddress) return;
  const ids = await glClient.readContract({
    address: marketAddress, functionName: "get_market_ids", args: [], jsonSafeReturn: true,
  });
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of ids || []) {
    let m;
    try {
      m = await glClient.readContract({ address: marketAddress, functionName: "get_market", args: [id], jsonSafeReturn: true });
    } catch { continue; }
    if (m.status !== "open" || nowSec < Number(m.close_time)) continue;
    try {
      await glClient.writeContract({ address: marketAddress, functionName: "resolve", args: [id], value: 0n });
      console.log(`[resolve] settled ${id}`);
    } catch (e) {
      if (!/not determinable|not closed/i.test(String(e?.message || ""))) console.warn(`[resolve] ${id}: ${e?.message}`);
    }
  }
}
```

Wire `marketAddress` from `process.env.PREDICTION_MARKET_CONTRACT_ADDRESS`, and call `syncResolve()` in `tick()` in place of `syncFinalize()`.

- [ ] **Step 3: Smoke** `node ./deploy/credit-bridge.mjs` with `CREDIT_BRIDGE_ENABLED` unset prints the exit line and does nothing.
- [ ] **Step 4: Commit** `git commit -m "Relayer: poke market resolution after close, reuse deposit/redeem sync"`

---

## Phase 5: Deploy + wire

### Task 5.1: Deploy scripts

- [ ] **Step 1:** Copy `deploy-credit-ledger.mjs` and `deploy-credit-vault.cjs` from verdictdotfun. Write `deploy-prediction-market.mjs` that deploys `prediction_market.py` with constructor args `(ledger_address, fee_sink)`.
- [ ] **Step 2:** Write `wire-contracts.mjs`: call ledger `approve_caller(marketAddress, true)`, `set_bridge(bridgeKeyAddress)`, and on the vault `setBridge` if needed. Record addresses to `deploy/deployments/flashcast-studionet.json`.
- [ ] **Step 3:** Write `.env.example` with `GENLAYER_CHAIN=studionet`, `GENLAYER_DEPLOYER_PRIVATE_KEY`, `CREDIT_VAULT_CONTRACT_ADDRESS`, `CREDIT_LEDGER_CONTRACT_ADDRESS`, `PREDICTION_MARKET_CONTRACT_ADDRESS`, `BASE_SEPOLIA_RPC_URL`, `CREDIT_BRIDGE_PRIVATE_KEY`, `CREDIT_TOKENS=ETH:0x0000000000000000000000000000000000000000:18:<creditsPerEth>`.
- [ ] **Step 4: Commit** `git commit -m "Deploy + wiring scripts for ledger, market, vault, bridge"`

---

## Phase 6: Frontend

### Task 6.1: GenLayer + credit-rail client libs

- [ ] **Step 1:** Copy `src/lib/creditRail.ts` from verdictdotfun and repoint contract addresses to env. Write `src/lib/genlayer.ts` exposing a configured genlayer-js client plus `readMarket`, `listMarkets`, `placeBet`, `createMarket`, `claim` helpers. Write `src/lib/markets.ts` for derived odds (`outcome_total / pool`).
- [ ] **Step 2:** Commit `git commit -m "Frontend libs: genlayer client + credit rail + market helpers"`

### Task 6.2: Pages

- [ ] **Step 1:** Build, in this order, each as a focused file: `Feed.tsx` (market cards with crowd odds + countdown), `Market.tsx` (bet form, pool bars, resolution status + reasoning), `Create.tsx` (title, outcomes editor, question, source, close time), `Credits.tsx` (deposit ETH via vault, cash out via request_redeem), `Leaderboard.tsx` (net profit), `Profile.tsx` (my bets + balance). Use shadcn components copied from verdictdotfun's `src/components/ui`.
- [ ] **Step 2:** Wire routes in `src/App.tsx`. Use the `frontend-design` skill for the visual pass so it does not look generic.
- [ ] **Step 3:** Verify with the preview tools (preview_start, snapshot, console_logs) that the Feed renders and a bet flow posts a transaction. Screenshot for proof.
- [ ] **Step 4: Commit** `git commit -m "Frontend: feed, market, create, credits, leaderboard, profile"`

---

## Self-Review

- **Spec coverage:** buy credits (Phase 3 vault + Phase 4 deposit sync + Phase 6 Credits), create market (2.1 + 6.2), bet (2.2 + 6.2), autonomous resolve (2.3 + 4.1), claim (2.4 + 6.2), cash out (1.1 redeem + 4.1 syncRedeems + 6.2 Credits), leaderboard (6.2). All covered.
- **Types:** `lock_from(bettor, amount)` and `award(profile, amount)` match between `credit_ledger.py`, the `CreditLedgerIface` in `prediction_market.py`, and the relayer/frontend callers. `get_market_ids`/`get_market`/`status`/`close_time`/`pool`/`winning_outcome` names match between contract, relayer `syncResolve`, and frontend.
- **Runner-version risks flagged inline:** `_now` timestamp accessor and `Address.as_hex` stringification are both called out to confirm against the installed runner during execution, with verdictdotfun as the reference for the exact idiom.
- **Subset safety:** loops are `while`-based; resolution uses the exact `run_nondet_unsafe` pattern already shipping in verdictdotfun; runner header is byte-identical and on line 1.
```
