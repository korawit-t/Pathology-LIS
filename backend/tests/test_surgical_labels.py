"""Surgical label schemes (app/utils/surgical_labels.py).

letter_number (default): specimens A, B, C, blocks A1, A2, B1 — must behave
exactly as before the setting existed. number_letter: specimens 1, 2, 3,
blocks lettered A, B, C across the whole case — re-sorted in specimen order
while the case is still in the gross room, fixed once it has left (a late block
on specimen 1 then takes the letter after the last one in the case).

The settings row is shared by every test in the run (real Postgres, commits
persist), so the `labels` fixture always puts the defaults back."""

import pytest

from app.crud.surgical_block import create_block, delete_block
from app.crud.surgical_specimen import create_specimen, delete_specimen
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.system_setting import SystemSetting
from app.schemas.surgical_block import SurgicalBlockCreate
from app.schemas.surgical_specimen import SurgicalSpecimenCreate
from app.utils.submitted_sections import build_submitted_sections_text, fetch_blocks_by_specimen
from app.utils.surgical_labels import (
    label_sort_key,
    letters_to_seq,
    next_specimen_label,
    seq_to_letters,
)

from tests.factories import make_bare_case, make_signable_case


def _apply(db, scheme="letter_number", delete_mode="renumber"):
    row = db.query(SystemSetting).filter(SystemSetting.hospital_slug == "master").first()
    if row is None:
        row = SystemSetting(hospital_slug="master")
        db.add(row)
    row.surgical_label_scheme = scheme
    row.surgical_block_delete_mode = delete_mode
    db.commit()


@pytest.fixture
def labels(db):
    """labels(scheme, delete_mode) for this test; defaults restored after."""
    yield lambda scheme="letter_number", delete_mode="renumber": _apply(db, scheme, delete_mode)
    db.rollback()
    _apply(db)


def _specimen(db, case, user_id, name="Specimen"):
    return create_specimen(
        db, SurgicalSpecimenCreate(surgical_case_id=case.id, specimen_name=name), user_id
    )


def _add_blocks(db, specimen, n):
    """Add n blocks the way the grossing screen does: next block_no = max + 1."""
    db.expire_all()
    nos = [b.block_no for b in db.query(SurgicalBlock).filter_by(specimen_id=specimen.id)]
    start = max(nos, default=0)
    return [
        create_block(db, SurgicalBlockCreate(specimen_id=specimen.id, block_no=start + i))
        for i in range(1, n + 1)
    ]


def _codes(db, case):
    """[(specimen_label, block_code)] in grossing order (specimen, then block_no)."""
    db.expire_all()
    rows = (
        db.query(SurgicalBlock)
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .filter(SurgicalSpecimen.case_id == case.id)
        .order_by(SurgicalSpecimen.id, SurgicalBlock.block_no)
        .all()
    )
    return [(b.specimen.specimen_label, b.block_code) for b in rows]


def _number_letter_case(db, user_id, blocks_per_specimen=(2, 2, 2)):
    case = make_bare_case(db, registrar_id=user_id)
    specimens = []
    for n in blocks_per_specimen:
        spec = _specimen(db, case, user_id)
        _add_blocks(db, spec, n)
        specimens.append(spec)
    return case, specimens


class TestHelpers:
    @pytest.mark.parametrize(
        "n, letters",
        [(1, "A"), (2, "B"), (26, "Z"), (27, "AA"), (28, "AB"), (52, "AZ"), (53, "BA"), (702, "ZZ"), (703, "AAA")],
    )
    def test_seq_to_letters(self, n, letters):
        assert seq_to_letters(n) == letters
        assert letters_to_seq(letters) == n

    def test_letters_round_trip(self):
        assert all(letters_to_seq(seq_to_letters(n)) == n for n in range(1, 2000))

    @pytest.mark.parametrize("value", ["", "A1", "1", "ก", None])
    def test_letters_to_seq_rejects_non_letters(self, value):
        assert letters_to_seq(value) is None

    def test_numbers_sort_numerically(self):
        assert sorted(["10", "2", "1", "9", "11"], key=label_sort_key) == ["1", "2", "9", "10", "11"]

    def test_letters_sort_as_before(self):
        letters = ["C", "A", "B", "E", "D"]
        assert sorted(letters, key=label_sort_key) == sorted(letters)
        assert sorted(["AA", "Z", "B"], key=label_sort_key) == ["B", "Z", "AA"]

    @pytest.mark.parametrize(
        "existing, scheme, expected",
        [
            ([], "letter_number", "A"),
            (["A", "B"], "letter_number", "C"),
            (["Z"], "letter_number", "AA"),
            ([], "number_letter", "1"),
            (["1", "2"], "number_letter", "3"),
            ([str(i) for i in range(1, 10)], "number_letter", "10"),
        ],
    )
    def test_next_specimen_label(self, existing, scheme, expected):
        assert next_specimen_label(existing, scheme) == expected


class TestDefaultSchemeUnchanged:
    def test_specimens_letters_blocks_numbered_per_specimen(self, db, admin_user, labels):
        labels()
        user, _ = admin_user
        case = make_bare_case(db, registrar_id=user.id)
        a = _specimen(db, case, user.id)
        b = _specimen(db, case, user.id)
        _add_blocks(db, a, 2)
        _add_blocks(db, b, 1)
        _add_blocks(db, a, 1)

        assert _codes(db, case) == [("A", "A1"), ("A", "A2"), ("A", "A3"), ("B", "B1")]
        assert all(
            blk.case_block_seq is None
            for blk in db.query(SurgicalBlock).filter(SurgicalBlock.specimen_id.in_([a.id, b.id]))
        )

    def test_delete_closes_the_gap_within_the_specimen(self, db, admin_user, labels):
        labels()
        user, _ = admin_user
        case, spec = make_signable_case(db, registrar_id=user.id)
        blocks = _add_blocks(db, spec, 3)

        delete_block(db, blocks[1].id)

        assert _codes(db, case) == [("A", "A1"), ("A", "A2")]

    def test_keep_gap_leaves_the_hole(self, db, admin_user, labels):
        labels(delete_mode="keep_gap")
        user, _ = admin_user
        case, spec = make_signable_case(db, registrar_id=user.id)
        blocks = _add_blocks(db, spec, 3)

        delete_block(db, blocks[1].id)
        _add_blocks(db, spec, 1)

        assert _codes(db, case) == [("A", "A1"), ("A", "A3"), ("A", "A4")]


class TestNumberLetterInGrossRoom:
    """Still in the gross room: letters follow specimen order and re-sort."""

    def test_adding_to_an_earlier_specimen_re_letters_the_later_ones(self, db, admin_user, labels):
        labels("number_letter")
        user, _ = admin_user
        case, (s1, _s2) = _number_letter_case(db, user.id, blocks_per_specimen=(3, 1))
        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("1", "C"), ("2", "D")]

        _add_blocks(db, s1, 1)

        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("1", "C"), ("1", "D"), ("2", "E")]

    def test_letters_go_past_z(self, db, admin_user, labels):
        labels("number_letter")
        user, _ = admin_user
        case, _ = _number_letter_case(db, user.id, blocks_per_specimen=(28,))

        assert [code for _, code in _codes(db, case)][-3:] == ["Z", "AA", "AB"]

    def test_tenth_specimen_is_10_and_sorts_after_9(self, db, admin_user, labels):
        labels("number_letter")
        user, _ = admin_user
        case = make_bare_case(db, registrar_id=user.id)
        made = [_specimen(db, case, user.id) for _ in range(11)]
        for spec in made:
            _add_blocks(db, spec, 1)

        assert [s.specimen_label for s in made] == [str(i) for i in range(1, 12)]
        codes = dict(_codes(db, case))
        assert (codes["9"], codes["10"], codes["11"]) == ("I", "J", "K")

    def test_submitted_line_uses_the_letters(self, db, admin_user, labels):
        labels("number_letter")
        user, _ = admin_user
        _case, (s1, _s2, _s3) = _number_letter_case(db, user.id)
        _add_blocks(db, s1, 1)

        blocks = fetch_blocks_by_specimen(db, [s1.id])[s1.id]

        assert build_submitted_sections_text("1", False, blocks) == (
            "Representative sections are submitted: A, B, C"
        )

    @pytest.mark.parametrize("delete_mode", ["renumber", "keep_gap"])
    def test_delete_always_closes_the_gap(self, db, admin_user, labels, delete_mode):
        labels("number_letter", delete_mode)
        user, _ = admin_user
        case, (s1, _s2, _s3) = _number_letter_case(db, user.id)
        block_a = db.query(SurgicalBlock).filter_by(specimen_id=s1.id, block_no=1).one()

        delete_block(db, block_a.id)

        assert _codes(db, case) == [("1", "A"), ("2", "B"), ("2", "C"), ("3", "D"), ("3", "E")]

    @pytest.mark.parametrize("delete_mode", ["renumber", "keep_gap"])
    def test_delete_specimen_relabels_and_re_letters(self, db, admin_user, labels, delete_mode):
        labels("number_letter", delete_mode)
        user, _ = admin_user
        case, (_s1, s2, s3) = _number_letter_case(db, user.id)

        assert delete_specimen(db, s2.id, user.id) is True

        db.refresh(s3)
        assert s3.specimen_label == "2"
        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("2", "C"), ("2", "D")]


def _leave_gross_room(db, case, how):
    """Put a case past the point where its letters may move."""
    blocks = (
        db.query(SurgicalBlock)
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .filter(SurgicalSpecimen.case_id == case.id)
        .order_by(SurgicalBlock.case_block_seq)
        .all()
    )
    if how == "case_status":
        case.status = "processed"
    elif how == "additional_sections":
        case.status = "grossed"
        blocks[0].specimen.needs_additional_sections = True
    elif how == "block_status":
        case.status = "grossed"
        blocks[-1].status = "processing"
    elif how == "sticker_printed":
        case.status = "grossed"
        db.add(SurgicalBlockStain(block_id=blocks[-1].id, slide_no=9, status="pending", is_printed=True))
    db.add(case)
    db.commit()


LEAVE_WAYS = ["case_status", "additional_sections", "block_status", "sticker_printed"]


class TestNumberLetterAfterGrossRoom:
    """Out of the gross room: letters are fixed, a late block goes last."""

    @pytest.mark.parametrize("how", LEAVE_WAYS)
    def test_late_block_takes_the_next_letter(self, db, admin_user, labels, how):
        labels("number_letter")
        user, _ = admin_user
        case, (s1, _s2) = _number_letter_case(db, user.id, blocks_per_specimen=(3, 1))
        _leave_gross_room(db, case, how)

        _add_blocks(db, s1, 1)

        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("1", "C"), ("1", "E"), ("2", "D")]

    def test_a_grossed_case_with_nothing_out_still_re_sorts(self, db, admin_user, labels):
        labels("number_letter")
        user, _ = admin_user
        case, (s1, _s2) = _number_letter_case(db, user.id, blocks_per_specimen=(3, 1))
        case.status = "grossed"
        db.commit()

        _add_blocks(db, s1, 1)

        assert _codes(db, case)[-1] == ("2", "E")

    def test_delete_renumber_moves_later_letters_down_across_the_case(self, db, admin_user, labels):
        labels("number_letter", "renumber")
        user, _ = admin_user
        case, (_s1, s2, _s3) = _number_letter_case(db, user.id)
        _leave_gross_room(db, case, "case_status")
        block_c = db.query(SurgicalBlock).filter_by(specimen_id=s2.id, block_no=1).one()

        delete_block(db, block_c.id)

        assert _codes(db, case) == [
            ("1", "A"), ("1", "B"),
            ("2", "C"),
            ("3", "D"), ("3", "E"),
        ]

    def test_delete_keep_gap_leaves_the_letter_unused(self, db, admin_user, labels):
        labels("number_letter", "keep_gap")
        user, _ = admin_user
        case, (s1, s2, _s3) = _number_letter_case(db, user.id)
        _leave_gross_room(db, case, "case_status")
        block_c = db.query(SurgicalBlock).filter_by(specimen_id=s2.id, block_no=1).one()

        delete_block(db, block_c.id)
        _add_blocks(db, s1, 1)

        assert _codes(db, case) == [
            ("1", "A"), ("1", "B"), ("1", "G"),
            ("2", "D"),
            ("3", "E"), ("3", "F"),
        ]

    def test_deleting_the_last_block_frees_its_letter(self, db, admin_user, labels):
        labels("number_letter", "keep_gap")
        user, _ = admin_user
        case, (s1, _s2, s3) = _number_letter_case(db, user.id)
        _leave_gross_room(db, case, "case_status")
        block_f = db.query(SurgicalBlock).filter_by(specimen_id=s3.id, block_no=2).one()

        delete_block(db, block_f.id)
        _add_blocks(db, s1, 1)

        assert ("1", "F") in _codes(db, case)

    def test_delete_specimen_keep_gap_keeps_letters(self, db, admin_user, labels):
        labels("number_letter", "keep_gap")
        user, _ = admin_user
        case, (_s1, s2, _s3) = _number_letter_case(db, user.id)
        _leave_gross_room(db, case, "case_status")

        delete_specimen(db, s2.id, user.id)

        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("2", "E"), ("2", "F")]

    def test_delete_specimen_renumber_closes_letters_in_order(self, db, admin_user, labels):
        labels("number_letter", "renumber")
        user, _ = admin_user
        case, (_s1, s2, _s3) = _number_letter_case(db, user.id)
        _leave_gross_room(db, case, "case_status")

        delete_specimen(db, s2.id, user.id)

        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("2", "C"), ("2", "D")]


class TestSwitchingTheSettingLeavesCasesAlone:
    def test_letter_case_stays_a1_after_switching_to_numbers(self, db, admin_user, labels):
        labels("letter_number")
        user, _ = admin_user
        case, spec_a = make_signable_case(db, registrar_id=user.id)
        _add_blocks(db, spec_a, 1)

        labels("number_letter")
        spec_b = _specimen(db, case, user.id)
        _add_blocks(db, spec_b, 1)
        _add_blocks(db, spec_a, 1)

        assert spec_b.specimen_label == "B"
        assert _codes(db, case) == [("A", "A1"), ("A", "A2"), ("B", "B1")]

    def test_number_case_keeps_numbers_after_switching_back(self, db, admin_user, labels):
        labels("number_letter")
        user, _ = admin_user
        case, (s1, _s2) = _number_letter_case(db, user.id, blocks_per_specimen=(1, 1))

        labels("letter_number")
        s3 = _specimen(db, case, user.id)
        _add_blocks(db, s3, 1)
        _add_blocks(db, s1, 1)

        assert s3.specimen_label == "3"
        assert _codes(db, case) == [("1", "A"), ("1", "B"), ("2", "C"), ("3", "D")]
