# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import typing
from dataclasses import dataclass

try:
    from genlayer import *
except ModuleNotFoundError:
    from genlayer_py import *

ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")
ERR = "[EXPECTED] "
MIN_OUTCOMES = 2
MAX_OUTCOMES = 8
MIN_OPEN_SECONDS = 300            # a market must stay open at least 5 minutes
MAX_SOURCE_LEN = 400
FEE_BPS = 200                     # 2% protocol fee on the gross winnings


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
    outcome_count: u256
    resolution_question: str
    source_url: str
    close_time: u256
    status: str                   # "open" | "resolved" | "void"
    winning_outcome: u256         # index, meaningful only when status == "resolved"
    pool: u256
    reasoning: str


class PredictionMarket(gl.Contract):
    """Parimutuel prediction markets resolved autonomously by web + LLM.

    Anyone can create a market. Bettors lock credits onto an outcome through the
    CreditLedger. After close, the contract reads the world and an LLM picks the
    winning outcome under the Equivalence Principle. Winners pull a pro-rata
    share of the pool with a claim, so payout never runs an unbounded loop.
    """

    owner: Address
    ledger: Address
    fee_sink: Address
    market_nonce: u256
    markets: TreeMap[str, Market]
    market_ids: DynArray[str]
    outcome_labels: TreeMap[str, str]   # key f"{mid}:{idx}"
    outcome_totals: TreeMap[str, u256]  # key f"{mid}:{idx}"
    bettor_stakes: TreeMap[str, u256]   # key f"{mid}:{addr_hex}:{idx}"
    claimed: TreeMap[str, bool]         # key f"{mid}:{addr_hex}"

    def __init__(self, ledger: Address = ZERO_ADDRESS, fee_sink: Address = ZERO_ADDRESS):
        self.owner = gl.message.sender_address
        self.ledger = self._addr(ledger)
        fs = self._addr(fee_sink)
        self.fee_sink = fs if fs != ZERO_ADDRESS else gl.message.sender_address
        self.market_nonce = u256(0)

    # ---- market creation ----
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
        if int(close_time) < self._now_epoch() + MIN_OPEN_SECONDS:
            raise gl.vm.UserError(ERR + "Close time is too soon.")

        market_id = "M" + str(int(self.market_nonce))
        self.market_nonce = u256(int(self.market_nonce) + 1)

        n = len(labels)
        for i in range(n):
            self.outcome_labels[market_id + ":" + str(i)] = labels[i]

        self.markets[market_id] = Market(
            id=market_id,
            creator=gl.message.sender_address,
            title=t[:200],
            description=description.strip()[:1000],
            outcome_count=u256(n),
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
        for i in range(len(outcomes)):
            label = str(outcomes[i]).strip()
            if not label:
                continue
            lower = label.lower()
            duplicate = False
            for j in range(len(labels)):
                if labels[j].lower() == lower:
                    duplicate = True
                    break
            if duplicate:
                raise gl.vm.UserError(ERR + "Outcomes must be distinct.")
            labels.append(label[:80])
        if len(labels) < MIN_OUTCOMES:
            raise gl.vm.UserError(ERR + "Need at least two outcomes.")
        if len(labels) > MAX_OUTCOMES:
            raise gl.vm.UserError(ERR + "Too many outcomes.")
        return labels

    # ---- betting ----
    @gl.public.write
    def place_bet(self, market_id: str, outcome_index: u256, amount: u256) -> None:
        m = self._require_market(market_id)
        if m.status != "open":
            raise gl.vm.UserError(ERR + "Market is not open.")
        if self._now_epoch() >= int(m.close_time):
            raise gl.vm.UserError(ERR + "Market is closed.")
        idx = int(outcome_index)
        if idx < 0 or idx >= int(m.outcome_count):
            raise gl.vm.UserError(ERR + "Unknown outcome.")
        amt = int(amount)
        if amt <= 0:
            raise gl.vm.UserError(ERR + "Bet must be positive.")

        bettor = gl.message.sender_address
        CreditLedgerIface(self.ledger).emit(on="accepted").lock_from(bettor, u256(amt))

        ot_key = market_id + ":" + str(idx)
        self.outcome_totals[ot_key] = u256(int(self.outcome_totals.get(ot_key, u256(0))) + amt)
        bs_key = market_id + ":" + self._akey(bettor) + ":" + str(idx)
        self.bettor_stakes[bs_key] = u256(int(self.bettor_stakes.get(bs_key, u256(0))) + amt)
        m.pool = u256(int(m.pool) + amt)
        self.markets[market_id] = m

    # ---- resolution (web + LLM, Equivalence Principle) ----
    @gl.public.write
    def resolve(self, market_id: str) -> None:
        m = self._require_market(market_id)
        if m.status != "open":
            raise gl.vm.UserError(ERR + "Market already settled.")
        if self._now_epoch() < int(m.close_time):
            raise gl.vm.UserError(ERR + "Market is not closed yet.")

        labels = self._labels_of(market_id, int(m.outcome_count))
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

    def _resolve_outcome(
        self, question: str, source: str, labels: list[str]
    ) -> TreeMap[str, typing.Any]:
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
        options = ""
        for i in range(len(labels)):
            options += "- " + labels[i] + "\n"
        return (
            "You are an impartial oracle settling a prediction market. Decide the single "
            "correct outcome using the SOURCE CONTENT below plus widely known public fact. "
            'If it cannot be settled yet, answer "UNKNOWN".\n\n'
            "QUESTION:\n" + question + "\n\n"
            "ALLOWED OUTCOMES (return one verbatim, or UNKNOWN):\n" + options + "\n"
            'Return JSON only: {"outcome": <one allowed label or "UNKNOWN">, '
            '"reasoning": <one or two sentences>}'
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
        for i in range(len(labels)):
            if labels[i].lower() == raw.lower():
                out = labels[i]
                break
        return {"outcome": out, "reasoning": str(data.get("reasoning", "")).strip()[:600]}

    # ---- claim (parimutuel payout + void refund) ----
    @gl.public.write
    def claim(self, market_id: str) -> u256:
        m = self._require_market(market_id)
        bettor = gl.message.sender_address
        ck = market_id + ":" + self._akey(bettor)
        if self.claimed.get(ck, False):
            raise gl.vm.UserError(ERR + "Already claimed.")

        n = int(m.outcome_count)
        if m.status == "void":
            payout = self._total_stake(market_id, bettor, n)
        elif m.status == "resolved":
            win = int(m.winning_outcome)
            total_win = int(self.outcome_totals.get(market_id + ":" + str(win), u256(0)))
            if total_win == 0:
                payout = self._total_stake(market_id, bettor, n)
            else:
                my = int(self.bettor_stakes.get(
                    market_id + ":" + self._akey(bettor) + ":" + str(win), u256(0)
                ))
                if my == 0:
                    self.claimed[ck] = True
                    return u256(0)
                gross = int(m.pool) * my // total_win
                fee = gross * FEE_BPS // 10000
                payout = gross - fee
        else:
            raise gl.vm.UserError(ERR + "Market is not settled.")

        self.claimed[ck] = True
        if payout > 0:
            CreditLedgerIface(self.ledger).emit(on="accepted").award(bettor, u256(payout))
        return u256(payout)

    def _total_stake(self, market_id: str, bettor: Address, n: int) -> int:
        total = 0
        key_prefix = market_id + ":" + self._akey(bettor) + ":"
        for i in range(n):
            total += int(self.bettor_stakes.get(key_prefix + str(i), u256(0)))
        return total

    # ---- views ----
    @gl.public.view
    def get_market(self, market_id: str) -> Market:
        return self._require_market(market_id)

    @gl.public.view
    def get_market_ids(self) -> DynArray[str]:
        return self.market_ids

    @gl.public.view
    def get_outcomes(self, market_id: str) -> DynArray[str]:
        m = self._require_market(market_id)
        return self._labels_of(market_id, int(m.outcome_count))

    @gl.public.view
    def get_outcome_total(self, market_id: str, outcome_index: u256) -> u256:
        return self.outcome_totals.get(market_id + ":" + str(int(outcome_index)), u256(0))

    @gl.public.view
    def get_stake(self, market_id: str, bettor: Address, outcome_index: u256) -> u256:
        key = market_id + ":" + self._akey(bettor) + ":" + str(int(outcome_index))
        return self.bettor_stakes.get(key, u256(0))

    @gl.public.view
    def has_claimed(self, market_id: str, bettor: Address) -> bool:
        return self.claimed.get(market_id + ":" + self._akey(bettor), False)

    # ---- admin ----
    @gl.public.write
    def set_ledger(self, ledger: Address) -> None:
        self._require_owner()
        self.ledger = self._addr(ledger)

    # ---- helpers ----
    def _labels_of(self, market_id: str, n: int) -> list[str]:
        labels: list[str] = []
        for i in range(n):
            labels.append(self.outcome_labels.get(market_id + ":" + str(i), ""))
        return labels

    def _label_index(self, labels: list[str], choice: str) -> int:
        for i in range(len(labels)):
            if labels[i] == choice:
                return i
        return -1

    def _require_market(self, market_id: str) -> Market:
        if market_id not in self.markets:
            raise gl.vm.UserError(ERR + "No such market.")
        return self.markets[market_id]

    def _require_owner(self):
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR + "Only the owner can do this.")

    def _now_epoch(self) -> int:
        raw = gl.message_raw["datetime"]
        if hasattr(raw, "timestamp"):
            return int(raw.timestamp())
        import datetime as _dt
        return int(_dt.datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp())

    def _akey(self, addr: typing.Any) -> str:
        return self._addr(addr).as_hex

    def _addr(self, value: typing.Any) -> Address:
        if isinstance(value, Address):
            return value
        if isinstance(value, bytes):
            return Address(value)
        if hasattr(value, "as_bytes"):
            return Address(value.as_bytes)
        return Address(value)
