"""Router-level tests for app/routers/surgical_block.py. The crud layer
(app/crud/surgical_block.py) is already covered elsewhere — this is RBAC +
wiring only."""

import uuid

from tests.factories import (
    make_signable_case,
    make_block,
    make_block_stain,
    make_anatomical_pathology_test,
)


class TestRbac:
    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/surgical-blocks").status_code == 403

    def test_pathologist_can_list(self, pathologist_client):
        r = pathologist_client.get("/surgical-blocks")
        assert r.status_code == 200
        assert "items" in r.json() or "total" in r.json() or isinstance(r.json(), dict)


class TestCrudWiring:
    def test_create_list_update_delete(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        created = pathologist_client.post("/surgical-blocks", json={"specimen_id": specimen.id, "block_no": 1}).json()
        assert created["block_no"] == 1

        updated = pathologist_client.put(f"/surgical-blocks/{created['id']}", json={"status": "embedded"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "embedded"

        deleted = pathologist_client.delete(f"/surgical-blocks/{created['id']}")
        assert deleted.status_code == 200

    def test_filters_by_specimen_id(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        pathologist_client.post("/surgical-blocks", json={"specimen_id": specimen.id, "block_no": 1})

        r = pathologist_client.get("/surgical-blocks", params={"specimen_id": specimen.id})

        assert r.status_code == 200
        assert all(b["specimen_id"] == specimen.id for b in r.json()["items"])


def test_requires_authentication(client):
    assert client.get("/surgical-blocks").status_code == 401


class TestPendingOutlabFilter:
    def test_finds_old_block_behind_many_newer_ones(self, db, pathologist_client, admin_user):
        """Regression: an outlab IHC ordered on a block created long ago must
        still surface in the Send-to-Outlab queue even after 200+ newer
        blocks were created since — the queue used to fetch only the most
        recent 200 blocks (by id) and filter client-side, which silently
        dropped it. has_pending_outlab now filters server-side before any
        ordering/limit is applied."""
        registrar, _ = admin_user
        external_test = make_anatomical_pathology_test(
            db, category="IHC", name="Outlab IHC", is_external=True
        )

        _, old_specimen = make_signable_case(db, registrar_id=registrar.id)
        old_block = make_block(db, specimen_id=old_specimen.id, block_no=1)
        make_block_stain(db, block_id=old_block.id, test_id=external_test.id, status="pending")

        # Simulate 200+ blocks created afterwards, on unrelated specimens,
        # none of which have any pending outlab stain.
        for _ in range(205):
            _, specimen = make_signable_case(db, registrar_id=registrar.id)
            make_block(db, specimen_id=specimen.id, block_no=1)

        r = pathologist_client.get("/surgical-blocks", params={"has_pending_outlab": True})
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()["items"]]
        assert old_block.id in ids

        # And the plain "most recent 200" query is the reproduction of the
        # original bug — old_block must NOT appear there, proving the fix
        # is genuinely filtering server-side rather than coincidentally.
        r2 = pathologist_client.get("/surgical-blocks", params={"limit": 200})
        assert old_block.id not in [b["id"] for b in r2.json()["items"]]


class TestInternalStainFilter:
    """has_internal_stain backs the Internal Stain Orders page, which used to
    fetch the newest 200 blocks and filter client-side — capping the list at
    ~3 pages and hiding every older case."""

    def test_finds_old_block_behind_many_newer_ones(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        special = make_anatomical_pathology_test(
            db, category="Histochem", name="AFB internal-filter", is_external=False
        )

        _, old_specimen = make_signable_case(db, registrar_id=registrar.id)
        old_block = make_block(db, specimen_id=old_specimen.id, block_no=1)
        make_block_stain(db, block_id=old_block.id, test_id=special.id, status="pending")

        for _ in range(205):
            _, specimen = make_signable_case(db, registrar_id=registrar.id)
            make_block(db, specimen_id=specimen.id, block_no=1)

        r = pathologist_client.get("/surgical-blocks", params={"has_internal_stain": True})
        assert r.status_code == 200
        assert old_block.id in [b["id"] for b in r.json()["items"]]

        # Reproduction of the original bug: the unfiltered "most recent 200"
        # query is where the block used to disappear.
        r2 = pathologist_client.get("/surgical-blocks", params={"limit": 200})
        assert old_block.id not in [b["id"] for b in r2.json()["items"]]

    def test_excludes_block_whose_only_stain_is_routine_he(self, db, pathologist_client, admin_user):
        """Every block gets a routine H&E at grossing, so matching on it would
        return the whole table."""
        registrar, _ = admin_user
        he = make_anatomical_pathology_test(
            db, category="Histochem", name="H&E", system_code="HE_ROUTINE", is_external=False
        )
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=block.id, test_id=he.id)

        r = pathologist_client.get("/surgical-blocks", params={"has_internal_stain": True})
        assert block.id not in [b["id"] for b in r.json()["items"]]

    def test_includes_special_stain_without_a_system_code(self, db, pathologist_client, admin_user):
        """Tests created from Admin → master data have system_code NULL, and a
        naive NOT(...) predicate evaluates to NULL for them and drops the row."""
        registrar, _ = admin_user
        special = make_anatomical_pathology_test(
            db, category="Special Stain", name="PAS no-system-code", is_external=False
        )
        assert special.system_code is None
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=block.id, test_id=special.id)

        r = pathologist_client.get("/surgical-blocks", params={"has_internal_stain": True})
        assert block.id in [b["id"] for b in r.json()["items"]]

    def test_excludes_block_whose_only_stain_goes_to_an_outlab(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        external = make_anatomical_pathology_test(
            db, category="IHC", name="CK7 internal-filter", is_external=True
        )
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=block.id, test_id=external.id)

        r = pathologist_client.get("/surgical-blocks", params={"has_internal_stain": True})
        assert block.id not in [b["id"] for b in r.json()["items"]]

    def test_includes_recut_even_though_its_test_is_an_he_recut(self, db, pathologist_client, admin_user):
        """A pathologist's recut request is routed to this page by
        BlockGridView, and create_stain stamps it with the HE_RECUT test."""
        registrar, _ = admin_user
        recut_test = make_anatomical_pathology_test(
            db, category="Histochem", name="Recut", system_code="HE_RECUT", is_external=False
        )
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=block.id, test_id=recut_test.id, is_recut=True)

        r = pathologist_client.get("/surgical-blocks", params={"has_internal_stain": True})
        assert block.id in [b["id"] for b in r.json()["items"]]

    def test_serves_the_test_system_code_so_the_client_can_spot_routine_he(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        special = make_anatomical_pathology_test(
            db, category="Histochem", name="GMS internal-filter", is_external=False
        )
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=block.id, test_id=special.id)

        r = pathologist_client.get("/surgical-blocks", params={"has_internal_stain": True})
        served = next(b for b in r.json()["items"] if b["id"] == block.id)
        assert "system_code" in served["stains"][0]["test"]


class TestInternalStainCasePage:
    """GET /surgical-blocks/internal-stain-cases — the Internal Stain Orders
    worklist groups blocks by accession, so it has to be counted and sliced
    per *case*: paginating blocks would cut a case in half."""

    @staticmethod
    def _case(db, registrar_id, accession_no):
        case, specimen = make_signable_case(db, registrar_id=registrar_id)
        case.accession_no = accession_no
        db.commit()
        return case, specimen

    @staticmethod
    def _special(db, name):
        return make_anatomical_pathology_test(
            db, category="Histochem", name=name, is_external=False
        )

    def test_paginates_by_case_not_by_block(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:8]
        special = self._special(db, f"PAS {tag}")
        for n in range(3):
            _, specimen = self._case(db, registrar.id, f"S26-{tag}-{n:02d}")
            for block_no in (1, 2):
                block = make_block(db, specimen_id=specimen.id, block_no=block_no)
                make_block_stain(db, block_id=block.id, test_id=special.id)

        r = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases", params={"search": tag, "limit": 2}
        )
        assert r.status_code == 200
        body = r.json()

        assert body["total"] == 3
        assert len(body["items"]) == 2
        # Whole cases, not a 2-block slice of one.
        assert all(len(c["blocks"]) == 2 for c in body["items"])
        # Newest accession first, and the third case waits for page 2.
        assert [c["accession_no"] for c in body["items"]] == [
            f"S26-{tag}-02",
            f"S26-{tag}-01",
        ]

        page2 = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases",
            params={"search": tag, "limit": 2, "skip": 2},
        ).json()
        assert [c["accession_no"] for c in page2["items"]] == [f"S26-{tag}-00"]

    def test_returns_only_the_blocks_carrying_one_of_this_pages_stains(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:8]
        special = self._special(db, f"GMS {tag}")
        he = make_anatomical_pathology_test(
            db, category="Histochem", name="H&E", system_code="HE_ROUTINE", is_external=False
        )
        _, specimen = self._case(db, registrar.id, f"S26-{tag}-00")
        with_special = make_block(db, specimen_id=specimen.id, block_no=1)
        he_only = make_block(db, specimen_id=specimen.id, block_no=2)
        make_block_stain(db, block_id=with_special.id, test_id=special.id)
        make_block_stain(db, block_id=he_only.id, test_id=he.id)

        body = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases", params={"search": tag}
        ).json()

        assert [b["id"] for b in body["items"][0]["blocks"]] == [with_special.id]

    def test_excludes_a_case_with_nothing_but_routine_he(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:8]
        he = make_anatomical_pathology_test(
            db, category="Histochem", name="H&E", system_code="HE_ROUTINE", is_external=False
        )
        _, specimen = self._case(db, registrar.id, f"S26-{tag}-00")
        block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=block.id, test_id=he.id)

        body = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases", params={"search": tag}
        ).json()

        assert body["total"] == 0
        assert body["items"] == []

    def test_buckets_split_cases_by_pending_and_recut(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:8]
        special = self._special(db, f"AFB {tag}")
        recut_test = make_anatomical_pathology_test(
            db, category="Histochem", name="Recut", system_code="HE_RECUT", is_external=False
        )

        _, pending_spec = self._case(db, registrar.id, f"S26-{tag}-01")
        make_block_stain(
            db,
            block_id=make_block(db, specimen_id=pending_spec.id, block_no=1).id,
            test_id=special.id,
            status="pending",
        )
        _, done_spec = self._case(db, registrar.id, f"S26-{tag}-02")
        make_block_stain(
            db,
            block_id=make_block(db, specimen_id=done_spec.id, block_no=1).id,
            test_id=special.id,
            status="stained",
        )
        _, recut_spec = self._case(db, registrar.id, f"S26-{tag}-03")
        make_block_stain(
            db,
            block_id=make_block(db, specimen_id=recut_spec.id, block_no=1).id,
            test_id=recut_test.id,
            status="pending",
            is_recut=True,
        )

        def accessions(bucket):
            body = pathologist_client.get(
                "/surgical-blocks/internal-stain-cases",
                params={"search": tag, "bucket": bucket},
            ).json()
            return sorted(c["accession_no"] for c in body["items"])

        assert accessions("all") == [f"S26-{tag}-01", f"S26-{tag}-02", f"S26-{tag}-03"]
        assert accessions("pending") == [f"S26-{tag}-01", f"S26-{tag}-03"]
        assert accessions("completed") == [f"S26-{tag}-02"]
        assert accessions("recut") == [f"S26-{tag}-03"]

    def test_bucket_counts_and_slide_totals_ignore_the_active_bucket(self, db, pathologist_client, admin_user):
        """The segmented labels and header counters must not change as you
        move between buckets or pages."""
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:8]
        special = self._special(db, f"Congo red {tag}")

        _, pending_spec = self._case(db, registrar.id, f"S26-{tag}-01")
        pending_block = make_block(db, specimen_id=pending_spec.id, block_no=1)
        make_block_stain(db, block_id=pending_block.id, test_id=special.id, status="pending")
        make_block_stain(db, block_id=pending_block.id, test_id=special.id, slide_no=2, status="stained")
        _, done_spec = self._case(db, registrar.id, f"S26-{tag}-02")
        make_block_stain(
            db,
            block_id=make_block(db, specimen_id=done_spec.id, block_no=1).id,
            test_id=special.id,
            status="stained",
        )

        body = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases",
            params={"search": tag, "bucket": "completed", "limit": 1},
        ).json()

        assert body["total"] == 1  # only the completed case is listed
        assert body["bucket_counts"] == {"all": 2, "pending": 1, "completed": 1, "recut": 0}
        assert body["slide_totals"] == {"pending": 1, "stained": 2}

    def test_case_stays_reachable_behind_hundreds_of_newer_blocks(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:8]
        special = self._special(db, f"Masson {tag}")
        _, specimen = self._case(db, registrar.id, f"S26-{tag}-00")
        old_block = make_block(db, specimen_id=specimen.id, block_no=1)
        make_block_stain(db, block_id=old_block.id, test_id=special.id)

        for _ in range(205):
            _, other = make_signable_case(db, registrar_id=registrar.id)
            make_block(db, specimen_id=other.id, block_no=1)

        body = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases", params={"search": tag}
        ).json()
        assert [c["accession_no"] for c in body["items"]] == [f"S26-{tag}-00"]

    def test_rejects_an_unknown_bucket(self, pathologist_client):
        r = pathologist_client.get(
            "/surgical-blocks/internal-stain-cases", params={"bucket": "nope"}
        )
        assert r.status_code == 422

    def test_clinician_cannot_read_the_worklist(self, clinician_client):
        assert clinician_client.get("/surgical-blocks/internal-stain-cases").status_code == 403
