"""Shared SQL predicates for classifying a SurgicalBlockStain.

The frontend mirror of this file is frontend/src/pages/Stain/stainFilters.ts —
the Internal Stain pages paginate against these predicates on the server and
then render the same rule client-side, so the two must agree.

Every predicate assumes AnatomicalPathologyTest is joined to
SurgicalBlockStain.test_id. Use an OUTER join: a stain's test_id is nullable.
"""

from sqlalchemy import and_, func, or_

from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.surgical_block_stain import SurgicalBlockStain

# The two system tests that are never a stain *order* in their own right: the
# routine H&E every block gets automatically at grossing (crud.surgical_block
# create_block), and the H&E recut, which is tracked by is_recut and priced at
# 0. system_code is the stable handle — a hospital can rename the master test
# from Admin → master data — so the name check is only a fallback for tests
# created before system_code existed.
HE_SYSTEM_CODES = ("HE_ROUTINE", "HE_RECUT")

# Special stains carry two different category strings in the same database: the
# seeded tests use "Histochem", while anything created through Admin → master
# data is saved as "Special Stain" (TEST_CATEGORY_OPTIONS in the frontend's
# constants/lab.constants.ts). Compared lower-cased because "Special stain"
# also appears in this codebase (crud.slide_storage).
SPECIAL_STAIN_CATEGORIES = ("histochem", "special stain")


def is_not_he_base_test():
    """The stain's master test is neither routine H&E nor an H&E recut.

    Written as a positive NULL-safe test rather than NOT(is H&E) because
    system_code is NULL on every test created from Admin → master data, and
    `NOT (NULL IN (...) OR false)` is NULL, which silently drops the row.
    """
    return and_(
        or_(
            AnatomicalPathologyTest.system_code.is_(None),
            AnatomicalPathologyTest.system_code.notin_(HE_SYSTEM_CODES),
        ),
        AnatomicalPathologyTest.name.notilike("%H&E%"),
    )


def is_special_stain_order():
    """A real in-house special-stain order (AFB, GMS, PAS, …)."""
    return and_(
        AnatomicalPathologyTest.is_external.is_(False),
        func.lower(AnatomicalPathologyTest.category).in_(SPECIAL_STAIN_CATEGORIES),
        is_not_he_base_test(),
    )


def is_internal_stain_order():
    """What the Internal Stain Orders worklist tracks: special stains, plus
    recuts (BlockGridView routes a pathologist's recut request to that page).
    IHC / ISH / Molecular are ordered and tracked elsewhere, and the routine
    H&E has its own page (frontend Stain/RoutineHE)."""
    return or_(SurgicalBlockStain.is_recut.is_(True), is_special_stain_order())


def is_in_house_stain():
    """Any stain this lab runs itself, excluding the H&E pair. Wider than
    is_internal_stain_order on purpose — the HosXP Key tab bills in-house IHC
    too."""
    return or_(
        SurgicalBlockStain.is_recut.is_(True),
        and_(AnatomicalPathologyTest.is_external.is_(False), is_not_he_base_test()),
    )


def is_keyable_stain():
    """Billable to HosXP: every in-house test except the H&E pair — a recut is
    a re-section of an existing block, not a separately charged test."""
    return and_(
        # isnot(True), not is_(False): is_recut is a nullable column, and the
        # frontend's `!s.is_recut` reads NULL as "not a recut" too.
        SurgicalBlockStain.is_recut.isnot(True),
        AnatomicalPathologyTest.is_external.is_(False),
        is_not_he_base_test(),
    )
