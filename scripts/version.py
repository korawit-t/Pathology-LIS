#!/usr/bin/env python3
"""Read, check and bump the product version.

The number lives in two files rather than one, on purpose. The Docker build
contexts are ``./backend`` and ``./frontend`` (docker-compose.yml), so a
VERSION file at the repo root would sit outside both contexts and neither
image could read it at runtime. Instead the version stays in the two places
each side already reads from, and this script keeps them identical:

    backend/app/core/config.py   Settings.VERSION -> GET /version
    frontend/package.json        "version"        -> __APP_VERSION__ -> login
                                                     footer, System Settings

``check`` runs in CI (see .github/workflows/tests.yml) so the two can never
drift silently.

Usage:
    python scripts/version.py show
    python scripts/version.py check
    python scripts/version.py bump major|minor|patch
    python scripts/version.py set 2.1.0

Which part to bump — the rule this project uses:

    patch   fix / docs / chore / refactor / test only
    minor   at least one feat
    major   the upgrade needs a human: a new or renamed env var, hand-run
            SQL, a data backfill, a required starting alembic revision, or
            a workflow change users must be retrained on.

A migration that ``alembic upgrade head`` applies by itself is NOT a major —
Railway and start.ps1 both run it automatically before the server starts.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CONFIG_PY = ROOT / "backend" / "app" / "core" / "config.py"
PACKAGE_JSON = ROOT / "frontend" / "package.json"
PACKAGE_LOCK = ROOT / "frontend" / "package-lock.json"

# Settings.VERSION: str = "2.0.0"
CONFIG_RE = re.compile(r'(VERSION:\s*str\s*=\s*")([^"]+)(")')
# The first top-level "version" key of package.json / package-lock.json.
JSON_RE = re.compile(r'(^\s*"version":\s*")([^"]+)(")', re.MULTILINE)
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def _read(path, pattern):
    text = path.read_text(encoding="utf-8")
    match = pattern.search(text)
    if not match:
        sys.exit(f"error: no version found in {path.relative_to(ROOT)}")
    return match.group(2)


def _write(path, pattern, new_version, count=1):
    text = path.read_text(encoding="utf-8")
    path.write_text(pattern.sub(rf"\g<1>{new_version}\g<3>", text, count=count), encoding="utf-8")


def read_versions():
    return {
        "backend/app/core/config.py": _read(CONFIG_PY, CONFIG_RE),
        "frontend/package.json": _read(PACKAGE_JSON, JSON_RE),
    }


def cmd_check(_args):
    versions = read_versions()
    if len(set(versions.values())) != 1:
        print("error: the backend and frontend versions disagree.", file=sys.stderr)
        for path, version in versions.items():
            print(f"  {version}  {path}", file=sys.stderr)
        print("\nfix with: python scripts/version.py set <version>", file=sys.stderr)
        return 1
    version = next(iter(versions.values()))
    if not SEMVER_RE.match(version):
        print(f"error: {version!r} is not MAJOR.MINOR.PATCH", file=sys.stderr)
        return 1
    print(f"ok: {version}")
    return 0


def cmd_show(_args):
    print(next(iter(read_versions().values())))
    return 0


def _set(new_version):
    if not SEMVER_RE.match(new_version):
        sys.exit(f"error: {new_version!r} is not MAJOR.MINOR.PATCH")
    old = next(iter(read_versions().values()))
    _write(CONFIG_PY, CONFIG_RE, new_version)
    _write(PACKAGE_JSON, JSON_RE, new_version)
    # The lock file repeats it at the root and under packages[""].
    _write(PACKAGE_LOCK, JSON_RE, new_version, count=2)
    print(f"{old} -> {new_version}")
    print("\nnext:")
    print("  1. add the release to CHANGELOG.md")
    print(f'  2. git commit -am "chore(release): v{new_version}"')
    print(f'  3. git tag -a v{new_version} -m "v{new_version}"   (after the PR is merged to main)')
    return 0


def cmd_set(args):
    return _set(args.version)


def cmd_bump(args):
    major, minor, patch = (int(p) for p in next(iter(read_versions().values())).split("."))
    if args.part == "major":
        major, minor, patch = major + 1, 0, 0
    elif args.part == "minor":
        minor, patch = minor + 1, 0
    else:
        patch += 1
    return _set(f"{major}.{minor}.{patch}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("show", help="print the current version").set_defaults(func=cmd_show)
    sub.add_parser("check", help="fail if backend and frontend disagree").set_defaults(func=cmd_check)
    bump = sub.add_parser("bump", help="raise one part of the version")
    bump.add_argument("part", choices=["major", "minor", "patch"])
    bump.set_defaults(func=cmd_bump)
    set_ = sub.add_parser("set", help="write an exact version")
    set_.add_argument("version")
    set_.set_defaults(func=cmd_set)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
