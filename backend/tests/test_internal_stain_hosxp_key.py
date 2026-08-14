"""
Tests for the HosXP-keyed flag on *internal* stains
(PATCH /surgical-block-stains/{stain_id}/hosxp-key).

The outlab flow records this on surgical_outlab_run_details, which only exists
once slides are dispatched to an external lab. Internal stains (AFB, GMS, …)
never get a run detail, so the flag lives on the stain row itself — see
tests/test_surgical_block_stain.py for the outlab-side equivalent.
"""

import pytest

from tests.factories import make_block, make_block_stain, make_signable_case


@pytest.fixture
def stain(db, admin_user):
    user, _ = admin_user
    _, specimen = make_signable_case(db, registrar_id=user.id)
    block = make_block(db, specimen_id=specimen.id)
    return make_block_stain(db, block_id=block.id)


class TestToggleInternalStainHosxpKey:
    def test_requires_auth(self, client, stain):
        r = client.patch(f"/surgical-block-stains/{stain.id}/hosxp-key", json={"keyed": True})
        assert r.status_code == 401

    def test_defaults_to_not_keyed(self, db, stain):
        assert stain.is_hosxp_keyed is False
        assert stain.hosxp_keyed_at is None

    def test_keying_sets_flag_and_timestamp(self, admin_client, db, stain):
        r = admin_client.patch(f"/surgical-block-stains/{stain.id}/hosxp-key", json={"keyed": True})
        assert r.status_code == 200
        assert r.json()["is_hosxp_keyed"] is True
        assert r.json()["hosxp_keyed_at"] is not None

        db.refresh(stain)
        assert stain.is_hosxp_keyed is True
        assert stain.hosxp_keyed_at is not None

    def test_unkeying_clears_flag_and_timestamp(self, admin_client, db, stain):
        admin_client.patch(f"/surgical-block-stains/{stain.id}/hosxp-key", json={"keyed": True})

        r = admin_client.patch(f"/surgical-block-stains/{stain.id}/hosxp-key", json={"keyed": False})
        assert r.status_code == 200
        assert r.json()["is_hosxp_keyed"] is False
        assert r.json()["hosxp_keyed_at"] is None

        db.refresh(stain)
        assert stain.is_hosxp_keyed is False
        assert stain.hosxp_keyed_at is None

    def test_keyed_defaults_to_true_when_omitted(self, admin_client, db, stain):
        r = admin_client.patch(f"/surgical-block-stains/{stain.id}/hosxp-key", json={})
        assert r.status_code == 200
        assert r.json()["is_hosxp_keyed"] is True

    def test_nonexistent_stain_returns_404(self, admin_client):
        r = admin_client.patch("/surgical-block-stains/999999/hosxp-key", json={"keyed": True})
        assert r.status_code == 404

    def test_does_not_collide_with_the_outlab_run_detail_route(self, admin_client):
        """`/{stain_id}/hosxp-key` and `/outlab-run-details/{id}/hosxp-key` differ
        in segment count, so the former must not swallow the latter."""
        r = admin_client.patch(
            "/surgical-block-stains/outlab-run-details/999999/hosxp-key", json={"keyed": True}
        )
        # 404 from the outlab handler ("Outlab run detail not found"), not a
        # 422 from trying to parse "outlab-run-details" as an int stain_id.
        assert r.status_code == 404
        assert "detail" in r.json()["detail"].lower() or "outlab" in r.json()["detail"].lower()


class TestStainResponseExposesFlag:
    def test_blocks_list_exposes_the_flag_on_nested_stains(self, admin_client, db, stain):
        """/surgical-blocks is what the Internal Stain page fetches, so the flag
        has to survive the nested SurgicalBlockResponse.stains serialization."""
        admin_client.patch(f"/surgical-block-stains/{stain.id}/hosxp-key", json={"keyed": True})

        r = admin_client.get("/surgical-blocks", params={"limit": 200})
        assert r.status_code == 200
        payload = r.json()
        blocks = payload.get("items", payload if isinstance(payload, list) else [])

        nested = [s for b in blocks for s in (b.get("stains") or []) if s["id"] == stain.id]
        assert nested, "seeded stain missing from the blocks listing"
        assert nested[0]["is_hosxp_keyed"] is True
        assert nested[0]["hosxp_keyed_at"] is not None
