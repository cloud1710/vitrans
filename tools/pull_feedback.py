"""Pull the APPROVED term-pair feedback (spec Amendment G) out of the D1 database vitrans-feedback into a JSON file for
the pack learner.

Usage: python tools/pull_feedback.py [--out FILE] [--database NAME] [--local [--persist-to DIR]]

- Runs `npx --yes wrangler@4.150.0 d1 execute <database> --remote --json --command <QUERY>` (a wrangler login with D1
  access); --local [--persist-to DIR] reads the local state of `wrangler pages dev` instead (local tests).
- Writes {"source", "pulled_utc", "rows": [{en, vi_used, vi_user, pack, kind, count, first_day, last_day}]} as UTF-8
  JSON to FILE (default out/feedback/approved-<UTC date>.json; out/ is git-ignored).
- The rows reach a pack only through the normal pack work: evidence note "user feedback, n users", pack tests,
  tools/check_packs.py and the eval, then a deploy.
- Console output is ASCII only and never names a term: rows per pack and the file written. Exit 1, nothing written,
  when wrangler fails or does not answer its JSON.
"""
import argparse
import datetime
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "out" / "feedback"
DATABASE = "vitrans-feedback"
WRANGLER = "wrangler@4.150.0"
COLUMNS = ("en", "vi_used", "vi_user", "pack", "kind", "count", "first_day", "last_day")
QUERY = ("SELECT " + ", ".join(COLUMNS) + " FROM feedback WHERE status = 'approved' "
         "ORDER BY pack, count DESC, en")


def _ascii(text):
    return str(text).encode("ascii", "replace").decode("ascii")


def wrangler_args(database, local=False, persist_to=None):
    """The wrangler command line of the query (npx resolved, so that npx.cmd runs on Windows)."""
    args = [shutil.which("npx") or "npx", "--yes", WRANGLER, "d1", "execute", database]
    if local:
        args.append("--local")
        if persist_to:
            args += ["--persist-to", persist_to]
    else:
        args.append("--remote")
    return args + ["--json", "--command", QUERY]


def parse_rows(stdout):
    """The rows of wrangler's --json answer, a list of statement results [{"results": [...], "success": true}];
    ValueError for anything else."""
    data = json.loads(stdout)
    if not isinstance(data, list) or not data or not all(isinstance(r, dict) for r in data):
        raise ValueError("not a list of statement results")
    rows = []
    for result in data:
        if result.get("success") is not True or not isinstance(result.get("results"), list):
            raise ValueError("the query did not succeed")
        rows += result["results"]
    return [{c: row.get(c) for c in COLUMNS} for row in rows]


def main(argv=None, run=subprocess.run):
    ap = argparse.ArgumentParser(description="Export the approved term-pair feedback from D1 to a JSON file.")
    ap.add_argument("--out", help="output file (default out/feedback/approved-<UTC date>.json)")
    ap.add_argument("--database", default=DATABASE, help="D1 database name (default %(default)s)")
    ap.add_argument("--local", action="store_true", help="the local state of wrangler pages dev, not the remote one")
    ap.add_argument("--persist-to", help="with --local: the --persist-to folder of wrangler pages dev")
    args = ap.parse_args(argv)
    proc = run(wrangler_args(args.database, args.local, args.persist_to), capture_output=True, encoding="utf-8",
               errors="replace", cwd=str(ROOT))
    if proc.returncode != 0:
        print("FAILED: wrangler exited with %d; nothing written" % proc.returncode)
        last = (proc.stderr or proc.stdout or "").strip().splitlines()[-1:]
        for line in last:
            print("  " + _ascii(line.strip()))
        return 1
    try:
        rows = parse_rows(proc.stdout)
    except ValueError as err:
        print("FAILED: wrangler did not answer its JSON (%s); nothing written" % _ascii(err))
        return 1
    now = datetime.datetime.now(datetime.timezone.utc)
    out = Path(args.out) if args.out else OUT_DIR / ("approved-%s.json" % now.strftime("%Y-%m-%d"))
    source = "d1 %s (%s)" % (args.database, "local" if args.local else "remote")
    data = {"source": source, "pulled_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "rows": rows}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    per_pack = {}
    for row in rows:
        per_pack[row["pack"]] = per_pack.get(row["pack"], 0) + 1
    print("%d approved row(s) from %s" % (len(rows), _ascii(source)))
    for pack in sorted(per_pack, key=str):
        print("  %s: %d" % (_ascii(pack), per_pack[pack]))
    print("-> %s" % _ascii(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
