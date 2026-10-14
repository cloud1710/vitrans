// Job report as a plain object (port of helper/vitranslate/report.py), the same shape the page renders for the
// helper's jobs.

// Informational flags (counted in "info", never a reason to list a segment as flagged), matched by the flag kind:
// the part before the first ':' ("kept_code", "retried:gate" -> "retried").
export const INFO_KINDS = new Set(["term_fix", "glossary_miss", "kept_code", "kept_english", "kept_reference", "retried",
  "polish_rejected"]);
// Flags that leave a real doubt about the text: any one of them calls for a thorough review.
export const WARNING_KINDS = new Set(["english_left", "omitted", "tags_broken", "acronym_lost", "suspect_output"]);

const kind = (flag) => flag.split(":")[0];
const info = (flag) => INFO_KINDS.has(kind(flag));

/** Counter -> object, keys in order of first occurrence (as dict(Counter(...))). */
function counter(values) {
  const out = {};
  for (const v of values) out[v] = (out[v] || 0) + 1;
  return out;
}

/** Recommended depth of the human review of a finished job: {level, reasons, flagged, segments}. */
export function reviewLevel(report) {
  const counts = report.counts || {};
  const segments = counts.segments || 0;
  const flagged = counts.flagged || 0;
  const share = segments ? flagged / segments : 0.0;
  const warnings = (report.flagged || []).some((r) => r.flags.some((f) => WARNING_KINDS.has(kind(f))));
  const thorough = [["fast_draft", Boolean(report.fast)], ["flagged_over_15", share > 0.15], ["warning_flags", warnings]]
    .filter(([, hit]) => hit).map(([code]) => code);
  const careful = [["no_pack", !(report.packs && report.packs.length)],
    ["polish_off", !(report.polish && report.polish.enabled)], ["flagged_over_5", share > 0.05 && share <= 0.15]]
    .filter(([, hit]) => hit).map(([code]) => code);
  const level = thorough.length ? "thorough" : careful.length ? "careful" : "moderate";
  return { level, reasons: thorough.concat(careful), flagged, segments };
}

export function buildReport(meta, rows, skippedItems, fitChanges, fontChanges) {
  const levels = counter(rows.map((r) => String(r.level)));
  const flagged = rows.filter((r) => r.level >= 3 || r.flags.some((f) => !info(f)));
  const infoCounts = counter(rows.flatMap((r) => r.flags.filter(info).map(kind)));
  const tagExact = ["0", "1", "2"].reduce((s, k) => s + (levels[k] || 0), 0);
  const report = { ...meta,
    counts: { segments: rows.length, cached: rows.filter((r) => r.cached).length, flagged: flagged.length,
      tag_exact_after_ladder: tagExact },
    levels,
    info: infoCounts,
    skipped: counter(skippedItems.map((s) => s.reason)),
    skipped_items: skippedItems.filter((s) => s.reason !== "no_text"),
    flagged,
    fit: fitChanges,
    fonts: fontChanges };
  report.review = reviewLevel(report);
  return report;
}
