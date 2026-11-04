"""Each report version keeps the images it went out with
(app/crud/report_images.py): a reprint draws from the report's own
images_snapshot instead of the case's current images, and the image routers
keep a file an issued report still points at instead of deleting it on
replace/delete (an addendum or revision unlocks those writes again)."""

import io
from pathlib import Path

import pytest
from PIL import Image

import app.core.config as config
import app.crud.gyne_cyto_report as gyne_report_crud
import app.crud.nongyne_cyto_report as nongyne_report_crud
import app.crud.surgical_report_builder as surgical_builder
from app.crud.gyne_cyto_report import prepare_gyne_report_pdf_data, publish_gyne_report
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.nongyne_cyto_report import get_nongyne_snapshot_pdf_data, publish_nongyne_report
from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.crud.surgical_report import attach_report_images, finalize_and_snapshot_orchestrator
from app.crud.surgical_report_builder import prepare_report_data
from app.models.gross_image import GrossImage
from app.models.gyne_case_image import GyneCaseImage
from app.models.gyne_cyto_report import GyneCytoReport
from app.models.microscopic_image import MicroscopicImage
from app.models.nongyne_case_image import NongyneCaseImage
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import SurgicalReport, SurgicalReportImage
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
from app.utils import storage_paths
from app.utils.time import local_now

from tests.factories import (
    build_bulk_save_payload,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_signable_case,
)


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="blue").save(buf, format="PNG")
    return buf.getvalue()


def _urls(images):
    return [img["image_url"] for img in images]


def _put_files(*keys):
    """Real PNGs under the (tmp) upload root: report building skips, and logs,
    an image whose file is missing."""
    for key in keys:
        storage_paths.save(key, _png_bytes())


class TestSurgicalReprint:
    @pytest.fixture(autouse=True)
    def _upload_root(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", tmp_path)

    def _publish_with_images(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        gross = GrossImage(
            specimen_id=specimen.id,
            image_url=f"/storage/gross_images/{specimen.id}/v1.png",
            show_in_report=True,
            order=1,
        )
        micro = MicroscopicImage(
            specimen_id=specimen.id,
            image_url="microscopic_images/m1.png",
            magnification="40x",
            stain="H&E",
            description="Tumour front",
            show_in_report=True,
            sort_order=1,
        )
        db.add_all([gross, micro])
        db.commit()
        _put_files(gross.image_url, micro.image_url)
        report = finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )
        return case, specimen, gross, micro, report

    def test_finalize_records_the_images_it_was_built_with(self, db, admin_user, two_pathologists, monkeypatch):
        monkeypatch.setattr(surgical_builder, "get_image_base64_from_path", lambda path, max_width=1024: "b64")
        _, specimen, gross, micro, report = self._publish_with_images(db, admin_user, two_pathologists)

        assert report.images_snapshot == {
            "gross": [{"image_url": gross.image_url, "label": specimen.specimen_label}],
            "micro": [{
                "image_url": micro.image_url,
                "label": specimen.specimen_label,
                "desc": "Tumour front",
                "mag": "40x",
                "stain": "H&E",
            }],
        }

    def test_reprint_ignores_later_edits_to_the_case_images(self, db, admin_user, two_pathologists, monkeypatch):
        monkeypatch.setattr(
            surgical_builder, "get_image_base64_from_path",
            lambda path, max_width=1024: f"b64:{Path(path).name}",
        )
        case, specimen, gross, micro, report = self._publish_with_images(db, admin_user, two_pathologists)

        # What an addendum can do: re-crop one image, add another, hide a third.
        gross.image_url = f"/storage/gross_images/{specimen.id}/v2.png"
        db.add(GrossImage(specimen_id=specimen.id, image_url=f"/storage/gross_images/{specimen.id}/new.png", order=2))
        micro.show_in_report = False
        db.commit()
        _put_files(gross.image_url, f"/storage/gross_images/{specimen.id}/new.png")

        data = {}
        attach_report_images(db, report, data)

        assert _urls(data["gross_images"]) == [f"/storage/gross_images/{specimen.id}/v1.png"]
        assert data["gross_images"][0]["base64"] == "b64:v1.png"
        assert _urls(data["micro_images"]) == ["microscopic_images/m1.png"]
        assert data["micro_images"][0]["stain"] == "H&E"
        # ...while a fresh build of the case does see the edits
        live = prepare_report_data(db, case.id)
        assert _urls(live["gross_images"]) == [
            f"/storage/gross_images/{specimen.id}/v2.png",
            f"/storage/gross_images/{specimen.id}/new.png",
        ]

    def test_report_without_a_snapshot_still_uses_the_case_images(self, db, admin_user, two_pathologists, monkeypatch):
        monkeypatch.setattr(surgical_builder, "get_image_base64_from_path", lambda path, max_width=1024: "b64")
        _, specimen, gross, _, report = self._publish_with_images(db, admin_user, two_pathologists)
        report.images_snapshot = None  # finalized before the column existed
        gross.image_url = f"/storage/gross_images/{specimen.id}/v2.png"
        db.commit()
        _put_files(gross.image_url)

        data = {}
        attach_report_images(db, report, data)

        assert _urls(data["gross_images"]) == [gross.image_url]

    def test_an_image_file_gone_from_disk_is_skipped(self, db, admin_user, two_pathologists, monkeypatch):
        _, _, gross, micro, report = self._publish_with_images(db, admin_user, two_pathologists)
        assert report.images_snapshot["gross"] and report.images_snapshot["micro"]
        storage_paths.delete(gross.image_url)
        storage_paths.delete(micro.image_url)

        data = {}
        attach_report_images(db, report, data)

        assert data["gross_images"] == []
        assert data["micro_images"] == []


class TestCytoReprint:
    def test_gyne_publish_records_images_and_reprint_uses_them(self, db, admin_user, two_pathologists, monkeypatch):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        shown = GyneCaseImage(case_id=case.id, image_url=f"/storage/gyne_images/{case.id}/a.png", description="first", order=1)
        hidden = GyneCaseImage(case_id=case.id, image_url=f"/storage/gyne_images/{case.id}/h.png", show_in_report=False, order=0)
        db.add_all([shown, hidden])
        db.commit()
        signers = [{"user_id": path1.id, "role": "primary", "signed_at": local_now()}]
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id, signers=signers), actor_id=path1.id)
        report = publish_gyne_report(db, case.id, signers=signers, current_user_id=None, is_abnormal=True)

        assert report.images_snapshot == [{"image_url": shown.image_url, "description": "first"}]

        shown.image_url = f"/storage/gyne_images/{case.id}/a2.png"
        db.add(GyneCaseImage(case_id=case.id, image_url=f"/storage/gyne_images/{case.id}/b.png", order=2))
        db.commit()
        monkeypatch.setattr(gyne_report_crud, "_embed_case_images", lambda images: images)

        data = prepare_gyne_report_pdf_data(db, case.id, report_id=report.id)

        assert _urls(data["cytology_images"]) == [f"/storage/gyne_images/{case.id}/a.png"]

    def test_nongyne_publish_records_images_and_reprint_uses_them(self, db, admin_user, two_pathologists, monkeypatch):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        img = NongyneCaseImage(case_id=case.id, image_url=f"/storage/nongyne_images/{case.id}/a.png", description="cells", order=1)
        db.add(img)
        db.commit()
        create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))
        report = publish_nongyne_report(
            db, case.id, signers=[{"user_id": path1.id, "role": "primary"}], current_user_id=path1.id
        )

        assert report.images_snapshot == [{"image_url": img.image_url, "description": "cells"}]

        img.image_url = f"/storage/nongyne_images/{case.id}/a2.png"
        db.commit()
        monkeypatch.setattr(nongyne_report_crud, "_get_image_base64", lambda url, max_width=800: f"b64:{url}")

        data = get_nongyne_snapshot_pdf_data(db, report)

        assert [i["base64"] for i in data["all_nongyne_images"]] == [f"b64:/storage/nongyne_images/{case.id}/a.png"]


class TestSurgicalFilesOutliveAddendumEdits:
    def _upload_gross(self, client, specimen_id):
        return client.post(
            f"/surgical-specimens/{specimen_id}/images/",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

    def _report_with(self, db, case, image_url, status):
        report = SurgicalReport(case_id=case.id, hospital_id=case.hospital_id, status=status)
        db.add(report)
        db.flush()
        db.add(SurgicalReportImage(report_id=report.id, image_url=image_url))
        db.commit()

    def _open_addendum(self, db, case):
        case.status = "signed out"
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level="CASE", status="draft"))
        db.commit()

    def test_replace_and_delete_keep_a_file_a_published_report_uses(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload_gross(pathologist_client, specimen.id)
        self._report_with(db, case, created["image_url"], "published")
        self._open_addendum(db, case)
        signed_out_file = tmp_path / created["image_url"].removeprefix("/storage/")

        replaced = pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )
        assert replaced.status_code == 200
        assert signed_out_file.exists()

        # the re-crop itself was never issued, so deleting it does remove it
        recrop_file = tmp_path / replaced.json()["image_url"].removeprefix("/storage/")
        assert pathologist_client.delete(f"/surgical-specimens/images/{created['id']}").status_code == 204
        assert not recrop_file.exists()
        assert signed_out_file.exists()

    def test_a_draft_report_does_not_hold_on_to_a_file(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = self._upload_gross(pathologist_client, specimen.id)
        self._report_with(db, case, created["image_url"], "draft")

        r = pathologist_client.put(
            f"/surgical-specimens/images/{created['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )

        assert r.status_code == 200
        assert not (tmp_path / created["image_url"].removeprefix("/storage/")).exists()

    def test_microscopic_delete_keeps_a_file_a_published_report_uses(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", tmp_path)
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            f"/microscopic-images/{specimen.id}",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()
        self._report_with(db, case, created["image_url"], "published")
        self._open_addendum(db, case)

        assert pathologist_client.delete(f"/microscopic-images/{created['id']}").status_code == 200
        assert (tmp_path / created["image_url"]).exists()


class TestCytoFilesOutliveRevisionEdits:
    def _upload(self, client, prefix, case_id):
        return client.post(
            f"/{prefix}/{case_id}/images",
            files={"file": ("test.png", _png_bytes(), "image/png")},
        ).json()

    def test_gyne_delete_keeps_only_files_a_report_uses(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        issued = self._upload(pathologist_client, "gyne-cytology", case.id)
        unissued = self._upload(pathologist_client, "gyne-cytology", case.id)
        db.add(GyneCytoReport(case_id=case.id, images_snapshot=[{"image_url": issued["image_url"], "description": ""}]))
        db.commit()

        for img in (issued, unissued):
            assert pathologist_client.delete(f"/gyne-cytology/images/{img['id']}").status_code == 204

        assert (tmp_path / issued["image_url"].removeprefix("/storage/")).exists()
        assert not (tmp_path / unissued["image_url"].removeprefix("/storage/")).exists()

    def test_nongyne_replace_keeps_a_file_a_report_uses(self, db, pathologist_client, admin_user, tmp_path, monkeypatch):
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", tmp_path)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        issued = self._upload(pathologist_client, "nongyne-cytology", case.id)
        db.add(NongyneCytoReport(case_id=case.id, images_snapshot=[{"image_url": issued["image_url"], "description": ""}]))
        db.commit()

        r = pathologist_client.put(
            f"/nongyne-cytology/images/{issued['id']}/content",
            files={"file": ("edited.png", _png_bytes(), "image/png")},
        )

        assert r.status_code == 200
        assert (tmp_path / issued["image_url"].removeprefix("/storage/")).exists()
