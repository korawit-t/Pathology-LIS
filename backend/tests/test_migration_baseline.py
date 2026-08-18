"""Guards on the Alembic revision graph itself.

These exist because the graph silently stopped being a DAG and nobody noticed
for months. The id `a1b2c3d4e5f6` had been hand-picked and reused across six
files; five were later renamed inside the file while one kept the id, which
left two `down_revision` values pointing at a revision created weeks *after*
them and closed a loop. Nothing failed loudly — `alembic upgrade head` on a
fresh database, `alembic history` and `alembic revision --autogenerate` simply
never returned, because each needs a full base..head path.

The checks below would have caught that the day it landed, and they are cheap:
they parse the revision files with `ast` rather than asking Alembic, which
matters because Alembic's own `walk_revisions()` hangs on a cyclic graph and so
cannot be used to diagnose one.
"""

import ast
import pathlib

import pytest

from app.db.database import Base
import app.models  # noqa: F401  ensure every model is registered

VERSIONS_DIR = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _parse_revisions():
    """Map revision id -> (parents tuple, filename), read straight from source."""
    revisions = {}
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        tree = ast.parse(path.read_text())
        revision = down_revision = None
        for node in tree.body:
            if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                continue
            target = node.targets[0] if isinstance(node, ast.Assign) else node.target
            if not isinstance(target, ast.Name) or node.value is None:
                continue
            try:
                value = ast.literal_eval(node.value)
            except (ValueError, SyntaxError):
                continue
            if target.id == "revision":
                revision = value
            elif target.id == "down_revision":
                down_revision = value
        assert revision, f"{path.name} declares no revision id"
        if down_revision is None:
            parents = ()
        elif isinstance(down_revision, (tuple, list)):
            parents = tuple(down_revision)
        else:
            parents = (down_revision,)
        revisions[revision] = (parents, path.name)
    return revisions


@pytest.fixture(scope="module")
def revisions():
    return _parse_revisions()


class TestRevisionGraph:
    def test_the_graph_is_acyclic(self, revisions):
        """The regression this whole file exists for."""
        WHITE, GREY, BLACK = 0, 1, 2
        colour = dict.fromkeys(revisions, WHITE)

        def visit(node, trail):
            if colour.get(node) == GREY:
                cycle = trail[trail.index(node):] + [node]
                pytest.fail("cycle in the revision graph: " + " -> ".join(cycle))
            if colour.get(node, BLACK) == BLACK:
                return
            colour[node] = GREY
            for parent in revisions[node][0]:
                if parent in revisions:
                    visit(parent, trail + [node])
            colour[node] = BLACK

        for revision in revisions:
            visit(revision, [])

    def test_every_down_revision_exists(self, revisions):
        dangling = sorted(
            (rev, parent)
            for rev, (parents, _) in revisions.items()
            for parent in parents
            if parent not in revisions
        )
        assert not dangling, f"down_revision values with no such revision: {dangling}"

    def test_there_is_exactly_one_head(self, revisions):
        parents = {p for parents, _ in revisions.values() for p in parents}
        heads = sorted(set(revisions) - parents)
        assert len(heads) == 1, (
            f"expected a single head, found {heads}. Merge them before adding a revision "
            "— both deploy paths run `alembic upgrade head` on boot."
        )

    def test_there_is_exactly_one_base(self, revisions):
        bases = sorted(rev for rev, (parents, _) in revisions.items() if not parents)
        assert len(bases) == 1, f"expected a single base revision, found {bases}"

    def test_every_revision_is_reachable_from_the_head(self, revisions):
        parents = {p for ps, _ in revisions.values() for p in ps}
        (head,) = set(revisions) - parents
        seen, stack = set(), [head]
        while stack:
            node = stack.pop()
            if node in seen:
                continue
            seen.add(node)
            stack.extend(p for p in revisions[node][0] if p in revisions)
        assert seen == set(revisions), (
            f"orphaned revisions, unreachable from head: {sorted(set(revisions) - seen)}"
        )

    def test_no_two_files_share_a_revision_id_prefix(self):
        """The actual root cause: `a1b2c3d4e5f6_*.py` existed six times.

        Filenames are cosmetic to Alembic, but a duplicated prefix means the id
        was reused and later renamed inside the file, which is exactly how a
        `down_revision` ends up naming a revision that has since moved.
        """
        prefixes = {}
        for path in VERSIONS_DIR.glob("*.py"):
            prefixes.setdefault(path.name.split("_")[0], []).append(path.name)
        duplicates = {p: sorted(f) for p, f in prefixes.items() if len(f) > 1}
        assert not duplicates, f"revision id prefix reused across files: {duplicates}"


class TestBaselineCoversEveryModel:
    def test_the_baseline_creates_every_table_the_models_declare(self, revisions):
        """A model added without a migration is invisible until runtime.

        Alembic's autogenerate silently emits an empty revision when a model is
        not imported in app/models/__init__.py, so this compares the tables the
        migrations create against the metadata the app actually uses.
        """
        created = set()
        for path in VERSIONS_DIR.glob("*.py"):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "create_table"
                    and node.args
                ):
                    try:
                        created.add(ast.literal_eval(node.args[0]))
                    except (ValueError, SyntaxError):
                        pass

        missing = sorted(set(Base.metadata.tables) - created)
        assert not missing, (
            f"models declare tables no migration creates: {missing}. "
            "Add the migration, and check the model is imported in app/models/__init__.py."
        )
