"""Direct-mode tests for the CreditLedger credit bank.

An EOA (direct_bob) stands in for an approved market contract so the
lock_from / award primitives can be exercised without deploying a market.
"""

LEDGER = "contracts/credit_ledger.py"
ONE = 10**18


def test_credit_is_idempotent(direct_vm, direct_deploy, direct_owner, direct_alice):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)  # bridge = owner

    direct_vm.sender = direct_owner  # acting as the bridge
    ledger.credit(direct_alice, 5 * ONE, "dep-1")
    assert int(ledger.get_balance(direct_alice)) == 5 * ONE

    ledger.credit(direct_alice, 5 * ONE, "dep-1")  # replay same ref
    assert int(ledger.get_balance(direct_alice)) == 5 * ONE  # unchanged


def test_credit_requires_bridge(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the bridge"):
        ledger.credit(direct_alice, ONE, "dep-x")


def test_lock_from_moves_credits(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)
    ledger.approve_caller(direct_bob, True)

    direct_vm.sender = direct_owner  # bridge
    ledger.credit(direct_alice, 10 * ONE, "dep-1")

    direct_vm.sender = direct_bob  # approved "market"
    ledger.lock_from(direct_alice, 4 * ONE)

    assert int(ledger.get_balance(direct_alice)) == 6 * ONE
    assert int(ledger.get_balance(direct_bob)) == 4 * ONE


def test_lock_from_requires_approved(direct_vm, direct_deploy, direct_owner, direct_alice, direct_charlie):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)

    direct_vm.sender = direct_owner
    ledger.credit(direct_alice, ONE, "dep-1")

    direct_vm.sender = direct_charlie  # not approved
    with direct_vm.expect_revert("not an approved"):
        ledger.lock_from(direct_alice, ONE)


def test_lock_from_insufficient(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)
    ledger.approve_caller(direct_bob, True)

    direct_vm.sender = direct_owner
    ledger.credit(direct_alice, ONE, "dep-1")

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Insufficient credits"):
        ledger.lock_from(direct_alice, 2 * ONE)


def test_award_pays_from_caller_pool(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)
    ledger.approve_caller(direct_bob, True)

    direct_vm.sender = direct_owner
    ledger.credit(direct_alice, 10 * ONE, "dep-1")

    direct_vm.sender = direct_bob
    ledger.lock_from(direct_alice, 6 * ONE)  # bob pool = 6
    ledger.award(direct_alice, 5 * ONE)      # pay 5 back

    assert int(ledger.get_balance(direct_bob)) == ONE
    assert int(ledger.get_balance(direct_alice)) == 9 * ONE


def test_award_insufficient_pool(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)
    ledger.approve_caller(direct_bob, True)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("insufficient pooled"):
        ledger.award(direct_alice, ONE)


def test_request_redeem_debits_and_queues(direct_vm, direct_deploy, direct_owner, direct_alice):
    direct_vm.sender = direct_owner
    ledger = direct_deploy(LEDGER, direct_owner)

    direct_vm.sender = direct_owner  # bridge credits the deposit
    ledger.credit(direct_alice, 10 * ONE, "dep-1")

    direct_vm.sender = direct_alice  # the holder redeems their own balance
    ledger.request_redeem(4 * ONE, direct_alice, "ETH")

    assert int(ledger.get_balance(direct_alice)) == 6 * ONE
    assert int(ledger.get_redeem_count()) == 1
