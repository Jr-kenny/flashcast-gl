"""Direct-mode tests for PredictionMarket in isolation.

gltest Direct Mode freezes block time at deploy and keeps a single in-memory
contract root, so:

* the market is deployed with a zero ledger (cross-contract calls gate off) and
  the parimutuel payout math is verified through claim's return value;
* the clock is set by warping *before* deploy; markets used for the
  resolve/claim flow are created with ``close == now`` and the contract's
  boundaries are inclusive, so one market is both bettable and resolvable at the
  frozen instant.

The real market -> ledger wiring is covered by integration tests against a node,
and the ledger primitives are covered in test_credit_ledger.py.
"""

import datetime as dt
import json

MARKET = "contracts/prediction_market.py"
ZERO = "0x" + "0" * 40
ONE = 10**18

T0 = dt.datetime(2026, 6, 18, 12, 0, 0, tzinfo=dt.timezone.utc)
NOW = int(T0.timestamp())


def _iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _deploy(direct_vm, direct_deploy, owner, min_open=0):
    direct_vm.warp(_iso(T0))          # set the frozen clock BEFORE deploy
    direct_vm.sender = owner
    return direct_deploy(MARKET, ZERO, owner, min_open)  # zero ledger, min_open seconds


def _mock_outcome(direct_vm, outcome, reasoning="because"):
    direct_vm.mock_llm(
        r"(?s).*impartial oracle settling a prediction market.*",
        json.dumps({"outcome": outcome, "reasoning": reasoning}),
    )


# ---------------- creation ----------------

def test_create_market_stores_fields(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    mid = market.create_market("Will it rain?", ["Yes", "No"], "Did it rain in London?", "", NOW)
    assert mid == "M0"
    m = market.get_market("M0")
    assert m.status == "open"
    assert int(m.outcome_count) == 2
    assert int(m.pool) == 0
    assert list(market.get_outcomes("M0")) == ["Yes", "No"]


def test_create_market_rejects_single_outcome(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("at least two"):
        market.create_market("Bad", ["OnlyOne"], "q", "", NOW)


def test_create_market_rejects_duplicate_outcomes(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("distinct"):
        market.create_market("Bad", ["Yes", "yes"], "q", "", NOW)


def test_create_market_rejects_close_too_soon(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner, min_open=300)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("too soon"):
        market.create_market("Bad", ["Yes", "No"], "q", "", NOW + 60)


def test_create_market_rejects_non_https_source(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("https"):
        market.create_market("Bad", ["Yes", "No"], "q", "http://insecure.example", NOW)


# ---------------- betting ----------------

def test_place_bet_updates_pool(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    market.create_market("Q", ["Yes", "No"], "q", "", NOW)
    market.place_bet("M0", 0, 6 * ONE)

    m = market.get_market("M0")
    assert int(m.pool) == 6 * ONE
    assert int(market.get_outcome_total("M0", 0)) == 6 * ONE
    assert int(market.get_stake("M0", direct_alice, 0)) == 6 * ONE


def test_place_bet_rejects_bad_index(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    market.create_market("Q", ["Yes", "No"], "q", "", NOW)
    with direct_vm.expect_revert("Unknown outcome"):
        market.place_bet("M0", 5, ONE)


def test_place_bet_rejects_when_not_open(direct_vm, direct_deploy, direct_owner, direct_alice):
    # once a market is resolved it is no longer open for betting
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    market.create_market("Q", ["Yes", "No"], "q", "", NOW)
    market.place_bet("M0", 0, ONE)
    _mock_outcome(direct_vm, "Yes")
    direct_vm.sender = direct_owner
    market.resolve("M0")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("not open"):
        market.place_bet("M0", 0, ONE)


# ---------------- resolution + claim ----------------

def _three_way_market(direct_vm, direct_deploy, direct_owner, alice, bob, charlie):
    """alice 6 + bob 4 on Yes(0); charlie 10 on No(1). pool=20, Yes total=10. close == now."""
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = alice
    market.create_market("Rain?", ["Yes", "No"], "Did it rain?", "", NOW)
    market.place_bet("M0", 0, 6 * ONE)
    direct_vm.sender = bob
    market.place_bet("M0", 0, 4 * ONE)
    direct_vm.sender = charlie
    market.place_bet("M0", 1, 10 * ONE)
    return market


def test_resolve_and_claim_parimutuel(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    market = _three_way_market(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie)
    _mock_outcome(direct_vm, "Yes")

    direct_vm.sender = direct_owner
    market.resolve("M0")
    m = market.get_market("M0")
    assert m.status == "resolved"
    assert int(m.winning_outcome) == 0

    # pool=20, Yes=10, fee=2%. alice 20*6/10=12 gross - 0.24 fee = 11.76
    direct_vm.sender = direct_alice
    assert int(market.claim("M0")) == 11_760_000_000_000_000_000
    assert market.has_claimed("M0", direct_alice) is True

    # bob 20*4/10=8 gross - 0.16 fee = 7.84
    direct_vm.sender = direct_bob
    assert int(market.claim("M0")) == 7_840_000_000_000_000_000

    # charlie bet only the losing outcome -> 0
    direct_vm.sender = direct_charlie
    assert int(market.claim("M0")) == 0


def test_double_claim_reverts(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    market = _three_way_market(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie)
    _mock_outcome(direct_vm, "Yes")
    direct_vm.sender = direct_owner
    market.resolve("M0")

    direct_vm.sender = direct_alice
    market.claim("M0")
    with direct_vm.expect_revert("Already claimed"):
        market.claim("M0")


def test_resolve_out_of_set_voids_and_refunds(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    market = _three_way_market(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie)
    _mock_outcome(direct_vm, "Maybe")  # not an allowed label

    direct_vm.sender = direct_owner
    market.resolve("M0")
    assert market.get_market("M0").status == "void"

    # everyone refunds their own stake
    direct_vm.sender = direct_alice
    assert int(market.claim("M0")) == 6 * ONE
    direct_vm.sender = direct_charlie
    assert int(market.claim("M0")) == 10 * ONE


def test_resolve_unknown_stays_open(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    market = _three_way_market(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie)
    _mock_outcome(direct_vm, "UNKNOWN")

    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("not determinable"):
        market.resolve("M0")
    assert market.get_market("M0").status == "open"


def test_resolve_before_close_reverts(direct_vm, direct_deploy, direct_owner, direct_alice):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    market.create_market("Future", ["Yes", "No"], "q", "", NOW + 600)  # closes later
    market.place_bet("M0", 0, ONE)
    _mock_outcome(direct_vm, "Yes")
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("not closed yet"):
        market.resolve("M0")


def test_resolve_reads_https_source(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    market = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_alice
    market.create_market("BTC up?", ["Up", "Down"], "Was BTC up?", "https://data.example.com/btc", NOW)
    market.place_bet("M0", 0, 5 * ONE)
    direct_vm.sender = direct_bob
    market.place_bet("M0", 1, 5 * ONE)

    direct_vm.mock_web(
        r"(?s).*data\.example\.com.*",
        {"status": 200, "body": b"BTC closed the day higher."},
    )
    _mock_outcome(direct_vm, "Up")

    direct_vm.sender = direct_owner
    market.resolve("M0")
    m = market.get_market("M0")
    assert m.status == "resolved"
    assert int(m.winning_outcome) == 0
