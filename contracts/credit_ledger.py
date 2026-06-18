# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import typing
from dataclasses import dataclass

try:
    from genlayer import *
except ModuleNotFoundError:
    from genlayer_py import *

ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")
ERR = "[EXPECTED] "


@allow_storage
@dataclass
class PendingRedeem:
    redeem_id: u256
    profile: Address
    payout_wallet: Address
    token: str
    atto_amount: u256
    settled: bool


class CreditLedger(gl.Contract):
    """Credit bank for flashcast-gl.

    The bridge mints credits from EVM deposits, holds a per-profile balance, and
    drains redeem requests back to the vault. Approved market contracts move
    credits with two primitives: lock_from (debit a bettor into the market's own
    custody) and award (pay a winner from that custody).
    """

    owner: Address
    bridge: Address
    balances: TreeMap[Address, u256]
    processed_deposits: TreeMap[str, bool]
    approved_callers: TreeMap[Address, bool]
    redeems: TreeMap[u256, PendingRedeem]
    redeem_nonce: u256

    def __init__(self, bridge: Address = ZERO_ADDRESS):
        self.owner = gl.message.sender_address
        self.bridge = self._addr(bridge)
        self.redeem_nonce = u256(0)

    # ---- admin ----
    @gl.public.write
    def set_bridge(self, bridge: Address) -> None:
        self._require_owner()
        self.bridge = self._addr(bridge)

    @gl.public.write
    def approve_caller(self, caller: Address, allowed: bool) -> None:
        self._require_owner()
        self.approved_callers[self._addr(caller)] = allowed

    # ---- credit (bridge-only, idempotent) ----
    @gl.public.write
    def credit(self, profile: Address, atto_amount: u256, deposit_ref: str) -> None:
        self._require_bridge()
        ref = deposit_ref.strip()
        if not ref:
            raise gl.vm.UserError(ERR + "deposit_ref is required.")
        if int(atto_amount) <= 0:
            raise gl.vm.UserError(ERR + "Credit amount must be positive.")
        if self.processed_deposits.get(ref, False):
            return  # idempotent replay
        p = self._addr(profile)
        self.balances[p] = u256(int(self.balances.get(p, u256(0))) + int(atto_amount))
        self.processed_deposits[ref] = True

    # ---- market primitives (approved-caller only) ----
    @gl.public.write
    def lock_from(self, bettor: Address, amount: u256) -> None:
        """Debit a bettor and move the credits into the calling market's custody."""
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
        """Pay a profile from the calling market's pooled custody."""
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

    # ---- redeem requests (caller-initiated; settlement is bridge-driven) ----
    @gl.public.write
    def request_redeem(
        self,
        atto_amount: u256,
        payout_wallet: Address,
        token: str,
    ) -> u256:
        # The caller redeems their own balance; the relayer settles it on the vault.
        p = gl.message.sender_address
        amount = int(atto_amount)
        if amount <= 0:
            raise gl.vm.UserError(ERR + "Redeem amount must be positive.")
        if int(self.balances.get(p, u256(0))) < amount:
            raise gl.vm.UserError(ERR + "Insufficient redeemable balance.")
        self.balances[p] = u256(int(self.balances[p]) - amount)

        redeem_id = u256(int(self.redeem_nonce))
        self.redeems[redeem_id] = PendingRedeem(
            redeem_id=redeem_id,
            profile=p,
            payout_wallet=self._addr(payout_wallet),
            token=token.strip(),
            atto_amount=u256(amount),
            settled=False,
        )
        self.redeem_nonce = u256(int(self.redeem_nonce) + 1)
        return redeem_id

    @gl.public.write
    def mark_redeem_settled(self, redeem_id: u256) -> None:
        self._require_bridge()
        rid = u256(int(redeem_id))
        if rid not in self.redeems:
            raise gl.vm.UserError(ERR + "Unknown redeem id.")
        r = self.redeems[rid]
        r.settled = True
        self.redeems[rid] = r

    @gl.public.view
    def get_redeem(self, redeem_id: u256) -> PendingRedeem:
        rid = u256(int(redeem_id))
        if rid not in self.redeems:
            raise gl.vm.UserError(ERR + "Unknown redeem id.")
        return self.redeems[rid]

    @gl.public.view
    def get_redeem_count(self) -> u256:
        return self.redeem_nonce

    # ---- views ----
    @gl.public.view
    def get_balance(self, profile: Address) -> u256:
        return self.balances.get(self._addr(profile), u256(0))

    @gl.public.view
    def is_approved_caller(self, caller: Address) -> bool:
        return self.approved_callers.get(self._addr(caller), False)

    # ---- helpers ----
    def _require_owner(self):
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR + "Only the owner can perform this action.")

    def _require_bridge(self):
        if gl.message.sender_address != self.bridge:
            raise gl.vm.UserError(ERR + "Only the bridge can perform this action.")

    def _require_approved_caller(self):
        if not self.approved_callers.get(gl.message.sender_address, False):
            raise gl.vm.UserError(ERR + "Caller is not an approved market contract.")

    def _addr(self, value: typing.Any) -> Address:
        if isinstance(value, Address):
            return value
        if isinstance(value, bytes):
            return Address(value)
        if hasattr(value, "as_bytes"):
            return Address(value.as_bytes)
        return Address(value)
