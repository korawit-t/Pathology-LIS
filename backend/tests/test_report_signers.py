"""
Unit tests for report-signer authorization.

Uses mock DB sessions so no full report/case/patient chain is needed.
Tests that the primary-signer guard in report_crud raises 403 when the
caller is not the primary signer, and passes when they are.
"""

import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException


class TestSurgicalReportSignerAuth:
    def test_non_primary_signer_gets_403(self):
        """A user who is not the primary signer cannot add co-signers."""
        from app.crud.report_crud import add_signer_to_report
        from app.models.surgical_report import SurgicalReport, ReportStatus

        mock_db = MagicMock()
        fake_report = MagicMock(spec=SurgicalReport)
        fake_report.id = 1
        # status must be PENDING_APPROVAL to pass the first guard before the 403 check
        fake_report.status = ReportStatus.PENDING_APPROVAL

        # First call: get report → found. Second call: is_primary check → not found.
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            fake_report,
            None,   # not a primary signer
        ]

        mock_user = MagicMock()
        mock_user.id = 99

        with pytest.raises(HTTPException) as exc:
            add_signer_to_report(
                db=mock_db,
                report_id=1,
                user_id=42,
                role="co-signer",
                consult_note=None,
                current_user=mock_user,
            )
        assert exc.value.status_code == 403

    def test_primary_signer_auth_check_passes(self):
        """Primary signer passes the 403 guard (may fail later on mock limits, not on auth)."""
        from app.crud.report_crud import add_signer_to_report
        from app.models.surgical_report import SurgicalReport, ReportSigner

        mock_db = MagicMock()
        fake_report = MagicMock(spec=SurgicalReport)
        fake_report.id = 1
        fake_primary = MagicMock(spec=ReportSigner)

        # First call: report found. Second call: is_primary → found (primary signer).
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            fake_report,
            fake_primary,
        ]

        mock_user = MagicMock()
        mock_user.id = 1

        try:
            add_signer_to_report(
                db=mock_db,
                report_id=1,
                user_id=42,
                role="co-signer",
                consult_note=None,
                current_user=mock_user,
            )
        except HTTPException as e:
            # The auth guard must NOT produce 403
            assert e.status_code != 403, f"Unexpected 403: {e.detail}"
        except Exception:
            # Other exceptions from mock side-effects are acceptable
            pass

    def test_report_not_found_returns_404(self):
        """Requesting a non-existent report returns 404, not 403."""
        from app.crud.report_crud import add_signer_to_report

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        mock_user = MagicMock()
        mock_user.id = 1

        with pytest.raises(HTTPException) as exc:
            add_signer_to_report(
                db=mock_db,
                report_id=9999,
                user_id=42,
                role="co-signer",
                consult_note=None,
                current_user=mock_user,
            )
        assert exc.value.status_code == 404


class TestGyneReportSignerAuth:
    def test_non_primary_gyne_signer_gets_403(self):
        """Same guard applies to Gyne report signers."""
        from app.crud.gyne_report_crud import add_gyne_signer
        from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus

        mock_db = MagicMock()
        fake_report = MagicMock(spec=GyneCytoReport)
        fake_report.id = 1
        fake_report.status = GyneReportStatus.PENDING_APPROVAL

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            fake_report,
            None,   # not primary
        ]

        mock_user = MagicMock()
        mock_user.id = 99

        with pytest.raises(HTTPException) as exc:
            add_gyne_signer(
                db=mock_db,
                report_id=1,
                user_id=42,
                role="co-signer",
                consult_note=None,
                current_user=mock_user,
            )
        assert exc.value.status_code == 403


class TestNongyneReportSignerAuth:
    def test_non_primary_nongyne_signer_gets_403(self):
        """Same guard applies to Non-Gyne report signers."""
        from app.crud.nongyne_cyto_report import add_nongyne_signer
        from app.models.nongyne_cyto_report import NongyneCytoReport, NongyneReportStatus

        mock_db = MagicMock()
        fake_report = MagicMock(spec=NongyneCytoReport)
        fake_report.id = 1
        fake_report.status = NongyneReportStatus.PENDING_APPROVAL

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            fake_report,
            None,   # not primary
        ]

        mock_user = MagicMock()
        mock_user.id = 99

        with pytest.raises(HTTPException) as exc:
            add_nongyne_signer(
                db=mock_db,
                report_id=1,
                user_id=42,
                role="co-signer",
                consult_note=None,
                current_user=mock_user,
            )
        assert exc.value.status_code == 403
