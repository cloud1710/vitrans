"""Job report as a plain dict (rendered by the web UI)."""
from collections import Counter

# Informational flags (counted in "info", never a reason to list a segment as flagged), matched by the flag kind:
# the part before the first ':' ("kept_code", "retried:gate" -> "retried").
INFO_KINDS = frozenset({"term_fix", "glossary_miss", "kept_code", "kept_english", "kept_reference", "retried",
                        "polish_rejected"})
# Flags that leave a real doubt about the text (left in English, a part left out, broken tags, a lost acronym, an
# answer that is not a clean translation): any one of them calls for a thorough review.
WARNING_KINDS = frozenset({"english_left", "omitted", "tags_broken", "acronym_lost", "suspect_output"})


def _info(flag):
    return flag.split(":", 1)[0] in INFO_KINDS


def review_level(report):
    """Recommended depth of the human review of a finished job: {level, reasons, flagged, segments}.

    "thorough" (that ky) when the fast draft was used, OR flagged segments > 15 % of the translated segments, OR
    any warning-level flag remains (english_left, omitted, tags_broken, acronym_lost, suspect_output);
    "careful" (ky) when no matching glossary pack was selected, OR the read-back pass was off, OR flagged > 5 %;
    "moderate" (vua phai) otherwise. Reasons: fast_draft, flagged_over_15, warning_flags, no_pack, polish_off,
    flagged_over_5 (thorough ones first)."""
    counts = report.get("counts") or {}
    segments, flagged = counts.get("segments") or 0, counts.get("flagged") or 0
    share = flagged / segments if segments else 0.0
    warnings = any(f.split(":", 1)[0] in WARNING_KINDS for r in report.get("flagged") or [] for f in r["flags"])
    thorough = [code for code, hit in (("fast_draft", bool(report.get("fast"))), ("flagged_over_15", share > 0.15),
                                       ("warning_flags", warnings)) if hit]
    careful = [code for code, hit in (("no_pack", not report.get("packs")),
                                      ("polish_off", not (report.get("polish") or {}).get("enabled")),
                                      ("flagged_over_5", 0.05 < share <= 0.15)) if hit]
    level = "thorough" if thorough else "careful" if careful else "moderate"
    return {"level": level, "reasons": thorough + careful, "flagged": flagged, "segments": segments}


def build_report(meta, rows, skipped_items, fit_changes, font_changes):
    levels = Counter(str(r["level"]) for r in rows)
    flagged = [r for r in rows if r["level"] >= 3 or any(not _info(f) for f in r["flags"])]
    info = Counter(f.split(":", 1)[0] for r in rows for f in r["flags"] if _info(f))
    tag_exact = sum(levels[k] for k in ("0", "1", "2"))
    report = dict(meta, **{
        "counts": {"segments": len(rows), "cached": sum(1 for r in rows if r["cached"]),
                   "flagged": len(flagged), "tag_exact_after_ladder": tag_exact},
        "levels": dict(levels),
        "info": dict(info),
        "skipped": dict(Counter(s["reason"] for s in skipped_items)),
        "skipped_items": [s for s in skipped_items if s["reason"] != "no_text"],
        "flagged": flagged,
        "fit": fit_changes,
        "fonts": font_changes,
    })
    report["review"] = review_level(report)
    return report
