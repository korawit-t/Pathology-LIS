"""Server-side signatures for cytology signer lists.

The gyne/non-gyne signer lists (`signers` JSON on the diagnosis, report signer
rows) are written from whatever the client sends — including each row's
signed_at. While "Require All Signatures" is on, that would let one user mark
someone else as signed and then clear the require-all gate. So under that
setting every signed_at is decided here instead: a signature can only be added
by the person it belongs to, at the server's clock.

With the setting off nothing here is applied: the UI deliberately stamps every
listed signer when the primary signs out ("Only the Primary Signer's signature
is required"), and that behaviour is kept as it was.
"""

from typing import Any, Iterable


def reconcile_signatures(
    incoming: Iterable[dict] | None,
    on_record: Iterable[dict] | None,
    actor_id: int | None,
    now: Any,
    *,
    actor_signs: bool = False,
) -> list[dict]:
    """Return ``incoming`` with each signed_at taken from the server's record.

    - Anyone but ``actor_id``: a claimed signed_at becomes whatever is on record
      for that user (None if they never signed). The client may keep or clear
      another person's signature, never create one.
    - ``actor_id``'s own row: keeps the recorded time if already signed;
      otherwise gets ``now`` when they claim it — or always, with
      ``actor_signs=True`` (publishing is signing). Claiming nothing clears it.
    """
    recorded = {
        s.get("user_id"): s.get("signed_at")
        for s in (on_record or [])
        if s.get("signed_at")
    }
    reconciled = []
    for s in incoming or []:
        uid = s.get("user_id")
        claimed = bool(s.get("signed_at"))
        if actor_id is not None and uid == actor_id:
            signed_at = (recorded.get(uid) or now) if (claimed or actor_signs) else None
        else:
            signed_at = recorded.get(uid) if claimed else None
        reconciled.append({**s, "signed_at": signed_at})
    return reconciled
