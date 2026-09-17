"""Page-layout tests for the printed disposal checklists
(templates/reports/specimen_disposal_checklist.html and
nongyne_specimen_disposal_checklist.html).

The signatures are the only place the sheet is signed in full, so the page they
land on must also carry case rows. A signature page with no accession numbers on
it can be stapled to any list, and then the signatures attest to nothing.

Before this was fixed, roughly one sheet in four (142 of 560 renders across 1–70
cases) put the signatures on a page of their own, split the summary box from the
signatures, or pushed the closing notice onto a blank trailing page.

The mechanism the templates rely on — the closing block living inside a single
<tr>, and the last rows carrying break-after: avoid — was chosen because
WeasyPrint ignores break-inside: avoid on <tbody>. These tests are what notice
if a WeasyPrint upgrade changes that.

Real Thai text is garbled by PDF text extraction, so the signer names and the
accession numbers used as page markers are ASCII.
"""

import re

import fitz
import pytest

from app.services import pdf_service
from app.services.pdf_service import env, generate_pdf_blob


@pytest.fixture(autouse=True)
def _shipped_templates_only(monkeypatch):
    """generate_pdf_blob renders reports/local/<name> instead when a hospital
    override exists. Those are git-ignored and machine-specific, so pin these
    tests to the templates the repo actually ships."""
    monkeypatch.setattr(pdf_service, "_resolve_template", lambda name: name)

APPROVER = "Approver Zulu"
SIGNERS = {
    "disposer_name": "Disposer Alpha",
    "verifier_name": "Verifier Bravo",
    "approver_name": APPROVER,
}


def _surgical(n: int, per_group: int):
    groups: dict[str, list] = {}
    for i in range(n):
        groups.setdefault(f"B-{i // per_group + 1:02d}", []).append(
            {
                "accession_no": f"S26-{i + 1:05d}",
                "hn": f"{1000000 + i}",
                "patient_name": "นาง สมศรี ใจงาม",
                "storage_date": "01/07/2026",
                "report_date": "01/07/2026",
                "age_days": 65,
            }
        )
    grouped = [{"container": k, "count": len(v), "rows": v} for k, v in groups.items()]
    return "reports/specimen_disposal_checklist.html", {
        "lab_name_th": "กลุ่มงานพยาธิวิทยา",
        "lab_address": "",
        "doc_no": "FM-PAT-025",
        "batch_no": "DSP-2026-0042",
        "retention_days": 30,
        "printed_on": "17/09/2026 10:00",
        "printed_by_name": "tester",
        **SIGNERS,
        "groups": grouped,
        "total_items": n,
        "total_containers": len(grouped),
    }


def _nongyne(n: int, per_group: int):
    groups: dict[str, list] = {}
    for i in range(n):
        groups.setdefault(f"Fluid-{i // per_group}", []).append(
            {
                "accession_no": f"N26-{i + 1:05d}",
                "hn": f"{1000000 + i}",
                "patient_name": "นาง สมศรี ใจงาม",
                "container": "NG-01",
                "collection_site": "Pleural fluid",
                "report_date": "01/07/2026",
                "age_days": 65,
            }
        )
    grouped = [{"specimen_type": k, "count": len(v), "rows": v} for k, v in groups.items()]
    return "reports/nongyne_specimen_disposal_checklist.html", {
        "lab_name_th": "กลุ่มงานพยาธิวิทยา",
        "lab_address": "",
        "doc_no": "FM-CYT-011",
        "batch_no": "NDSP-2026-0042",
        "retention_days": 30,
        "printed_on": "17/09/2026 10:00",
        "printed_by_name": "tester",
        **SIGNERS,
        "groups": grouped,
        "total_items": n,
        "total_groups": len(grouped),
    }


BUILDERS = {"surgical": _surgical, "nongyne": _nongyne}
ACCESSION = re.compile(r"[SN]26-\d{5}")


def _pages(builder, n, per_group):
    template, data = builder(n, per_group)
    doc = fitz.open(stream=generate_pdf_blob(data, template_name=template), filetype="pdf")
    return [page.get_text() for page in doc]


# 13–20 straddles the first page boundary, where main produced every failure
# mode at once. per_group=12 is a normal box of cases; per_group=1 makes each
# case its own group, so the last group is a single row and the tail has to
# pull a group heading along with it.
@pytest.mark.parametrize("per_group", [12, 1])
@pytest.mark.parametrize("n", range(13, 21))
@pytest.mark.parametrize("kind", sorted(BUILDERS))
def test_signatures_share_a_page_with_cases(kind, n, per_group):
    pages = _pages(BUILDERS[kind], n, per_group)

    sig_pages = [i for i, text in enumerate(pages) if APPROVER in text]
    assert sig_pages == [len(pages) - 1], (
        f"signatures should appear once, on the last page; found on {sig_pages} of {len(pages)}"
    )

    last = pages[-1]
    assert "สรุปผล" in last, "the summary box was split from the signatures"
    assert ACCESSION.search(last), "the signature page carries no case rows"

    # the tail split must not drop or duplicate a case
    found = [m for text in pages for m in ACCESSION.findall(text)]
    assert len(found) == len(set(found)) == n


@pytest.mark.parametrize("kind", sorted(BUILDERS))
def test_range_actually_forces_a_page_break(kind):
    """Guards the test above against passing vacuously on single-page sheets."""
    assert any(len(_pages(BUILDERS[kind], n, 12)) > 1 for n in range(13, 21))


@pytest.mark.parametrize("kind", sorted(BUILDERS))
def test_empty_sheet_still_signs_once(kind):
    pages = _pages(BUILDERS[kind], 0, 12)
    assert len(pages) == 1
    assert pages[0].count(APPROVER) == 1


@pytest.mark.parametrize("kind", sorted(BUILDERS))
def test_row_numbers_run_on_across_the_tail(kind):
    """The last rows render in a separate loop from the rest of their group;
    their ที่ column must continue from the rows above, not restart at 1."""
    template, data = BUILDERS[kind](10, 12)
    html = env.get_template(template).render(**data, font_path="")
    last_table = html[html.rindex("<table"):]
    # the ที่ cell is the one right after the tick box — HN and age are digits too
    numbers = [
        int(x)
        for x in re.findall(r'<td class="c tick">☐</td>\s*<td class="c">(\d+)</td>', last_table)
    ]
    assert numbers == list(range(1, 11))


@pytest.mark.parametrize("kind", sorted(BUILDERS))
def test_every_page_has_an_initials_box(kind):
    """Only the last page is signed in full, so pages 1..N-1 are initialled to
    stop a page from another sheet being swapped in."""
    template, _ = BUILDERS[kind](1, 12)
    source = env.loader.get_source(env, template)[0]
    page_rule = source[source.index("@page"):source.index("body {")]
    assert "@top-right" in page_rule
    assert "ลงชื่อย่อ" in page_rule
    # the doc-no footer keeps the bottom margin to itself — sharing it squeezed
    # the controlled-document number until the batch number wrapped
    assert "@bottom-center" not in page_rule
