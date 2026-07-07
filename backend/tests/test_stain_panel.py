"""Tests for app/crud/stain_panel.py. The behavior worth covering:
create_stain_panel fans test_ids out into StainPanelItem rows, and
update_stain_panel only replaces those items when test_ids is explicitly
provided — omitting it from an update must leave the existing items alone."""

from app.crud.stain_panel import get_stain_panel, create_stain_panel, update_stain_panel, delete_stain_panel
from app.schemas.stain_panel import StainPanelCreate, StainPanelUpdate
from app.models.stain_panel import StainPanel

from tests.factories import make_anatomical_pathology_test


class TestCreateStainPanel:
    def test_creates_a_panel_item_per_test_id_in_order(self, db, admin_user):
        registrar, _ = admin_user
        test_a = make_anatomical_pathology_test(db, system_code="PANEL_A", name="Test A")
        test_b = make_anatomical_pathology_test(db, system_code="PANEL_B", name="Test B")

        result = create_stain_panel(
            db, StainPanelCreate(name="Breast Panel", test_ids=[test_a.id, test_b.id]), user_id=registrar.id,
        )

        items = sorted(result.items, key=lambda i: i.sort_order)
        assert [i.test_id for i in items] == [test_a.id, test_b.id]
        assert [i.sort_order for i in items] == [0, 1]


class TestUpdateStainPanel:
    def test_replaces_items_when_test_ids_provided(self, db, admin_user):
        registrar, _ = admin_user
        test_a = make_anatomical_pathology_test(db, system_code="PANEL_C", name="Test A")
        test_b = make_anatomical_pathology_test(db, system_code="PANEL_D", name="Test B")
        panel = create_stain_panel(db, StainPanelCreate(name="Panel", test_ids=[test_a.id]), user_id=registrar.id)

        result = update_stain_panel(db, panel.id, StainPanelUpdate(test_ids=[test_b.id]))

        assert [i.test_id for i in result.items] == [test_b.id]

    def test_omitting_test_ids_leaves_existing_items_untouched(self, db, admin_user):
        registrar, _ = admin_user
        test_a = make_anatomical_pathology_test(db, system_code="PANEL_E", name="Test A")
        panel = create_stain_panel(db, StainPanelCreate(name="Panel", test_ids=[test_a.id]), user_id=registrar.id)

        result = update_stain_panel(db, panel.id, StainPanelUpdate(name="Renamed"))

        assert result.name == "Renamed"
        assert [i.test_id for i in result.items] == [test_a.id]

    def test_missing_id_returns_none(self, db):
        assert update_stain_panel(db, 999999, StainPanelUpdate(name="x")) is None


class TestDeleteStainPanel:
    def test_deletes_existing(self, db, admin_user):
        registrar, _ = admin_user
        panel = create_stain_panel(db, StainPanelCreate(name="Temp"), user_id=registrar.id)

        delete_stain_panel(db, panel.id)

        assert db.query(StainPanel).filter(StainPanel.id == panel.id).first() is None
