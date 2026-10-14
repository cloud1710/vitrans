"""One translation job: package -> items -> packs -> translate -> polish (optional editor pass) -> apply -> fit -> fonts ->
save -> reopen -> report."""
import csv
import os
import re
import time
from dataclasses import dataclass, field, replace
from pathlib import Path

from . import config
from . import device as device_mod
from .fit import fit_pptx
from .fonts import FontIndex, fix_fonts
from .llm import LLMError, OllamaLLM
from .ooxml.codec import apply
from .ooxml.document import collect_items
from .ooxml.package import OoxmlPackage, UnsupportedFile
from .matching import families, score_packs, select_packs  # noqa: F401 (score_packs: choose_packs, top_candidates)
from .packs import EMPTY_PACK, glossary_hits, load_pack, merge_packs
from .polish import Polisher, build_editor_system, run_polish
from .registry import PackUnavailable, Registry
from .report import build_report
from .tags import strip_tags
from .tm import TM
from .translate import Translator, build_system

RETRY_DELAY = 3  # seconds before the one retry of a segment whose model call failed
# a downloaded pack whose files cannot be read or parsed (bad JSON / CSV / regex / structure)
LOAD_ERRORS = (OSError, ValueError, KeyError, TypeError, AttributeError, csv.Error)


class JobError(Exception):
    """The job ran but its output cannot be delivered; `report` is the report of what was done."""

    def __init__(self, message, report=None):
        super().__init__(message)
        self.report = report or {}


@dataclass
class Options:
    fast: bool = False
    notes: bool = True
    comments: bool = False
    domain: str = ""
    polish: bool = None  # read-back editor pass; None = automatic (on with a GPU, off on the CPU)


@dataclass
class JobResult:
    output: Path
    report: dict = field(default_factory=dict)


def output_name(src):
    src = Path(src)
    return src.stem + "_vi" + src.suffix


def _shown(tagged):
    """Report text: a placeholder (line break, tab, field) shows as a space, tags are dropped, spaces collapsed."""
    return " ".join(strip_tags(re.sub(r"<x\d+/>", " ", tagged)).split())[:300]


def make_llm(dev, model):
    return OllamaLLM(config.ollama_url(), model, num_gpu=dev.num_gpu)


def reopen(path):
    """Fail loud if the written package does not load."""
    if Path(path).suffix.lower() == ".docx":
        import docx
        docx.Document(str(path))
    else:
        import pptx
        pptx.Presentation(str(path))


def _translate(translator, item, prev, nxt, sleep):
    """One retry after RETRY_DELAY when the model call fails; a second failure aborts the job."""
    try:
        return translator.translate(item.segment, prev, nxt)
    except LLMError:
        sleep(RETRY_DELAY)
    try:
        return translator.translate(item.segment, prev, nxt)
    except LLMError as exc:
        raise LLMError("Ollama failed twice while translating %s: %s" % (item.location, exc)) from exc


def choose_packs(text, domain, manifest):
    """(Matches to use in merge order, unknown ids). domain = comma-separated pack ids chosen by the user (reason
    "user", no family / pack cap), else cosine selection; either way a chosen pack brings its parent along (reason
    "parent") and comes before it (matching.families)."""
    if not domain:
        return select_packs(text, manifest), []
    wanted = list(dict.fromkeys(d.strip() for d in domain.split(",") if d.strip()))
    scored = score_packs(text, manifest)
    by_id = {m.entry.get("id"): m for m in scored}
    chosen = [replace(by_id[d], reason="user") for d in wanted if d in by_id]
    return families(chosen, scored), [d for d in wanted if d not in by_id]


def top_candidates(text, manifest, chosen, n=3):
    """The n best-scoring packs that were not selected (cosine score shown next to the selected ones)."""
    return [{"id": m.entry.get("id"), "name": m.entry.get("name") or m.entry.get("id"), "score": round(m.score, 3)}
            for m in score_packs(text, manifest) if m.entry.get("id") not in chosen][:n]


def _as_written(matched, pack):
    """Matched terms (normalised lower case) as the pack writes them: glossary English, else the detect keyword."""
    written = {" ".join(w.lower().split()): w for w in pack.detect}
    written.update({" ".join(en.lower().split()): en for en, _, _ in pack.glossary})
    return [written.get(t, t) for t in matched]


def load_packs(matches, registry):
    """Download / open the chosen packs: (merged pack or EMPTY_PACK, report rows, entries that could not be had,
    translation-memory key: each pack key with the first 8 hex digits of its sha256)."""
    loaded, rows, missing, keys = [], [], [], []
    for m in matches:
        e = m.entry
        try:
            pk = load_pack(registry.ensure(e))
        except PackUnavailable:
            missing.append(e)
            continue
        except LOAD_ERRORS:  # verified but unreadable: drop the copy so the next job downloads it again
            registry.forget(e)
            missing.append(e)
            continue
        loaded.append(pk)
        keys.append("%s#%s" % (pk.key(), e["sha256"][:8]))
        rows.append({"id": e["id"], "name": e.get("name", e["id"]), "version": e.get("version"),
                     "score": round(m.score, 3), "matched": _as_written(m.matched, pk), "reason": m.reason,
                     "source": registry.last_source.get(e["id"])})
    pack = merge_packs(loaded) or EMPTY_PACK
    return pack, rows, missing, "+".join(keys) or pack.key()


def run_job(src, out_dir, options=None, progress=lambda event: None, llm_factory=make_llm,
            probe=device_mod.probe, registry=None, font_index=None, tm=None, sleep=time.sleep, estimator=None):
    """estimator(device, model, source word count per segment, read-back on) -> recommend.JobEstimate: when given,
    the "device" event carries the time estimate and translate / polish events the remaining seconds (eta_s)."""
    options = options or Options()
    src, out_dir = Path(src), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()
    progress({"stage": "extract"})
    pkg = OoxmlPackage(src)
    if "." + pkg.kind != src.suffix.lower():
        raise UnsupportedFile("the file extension %s does not match its content (a %s package)"
                              % (src.suffix or "(none)", pkg.kind.upper()))
    items = collect_items(pkg, notes=options.notes, comments=options.comments)
    work = [i for i in items if i.segment]
    skipped = [{"where": i.location, "reason": i.skip, "text": i.text[:200]} for i in items if not i.segment]
    full_text = "\n".join(i.segment.plain for i in work)
    words = [len(i.segment.plain.split()) for i in work]
    progress({"stage": "extract", "segments": len(work), "words": sum(words), "skipped": len(skipped)})

    style = load_pack(config.style_dir())
    registry = registry or Registry(config.registry_source(), config.app_home())
    manifest = registry.manifest()
    matches, unknown = choose_packs(full_text, options.domain, manifest)
    pack, pack_rows, missing, pack_key = load_packs(matches, registry)
    unavailable = unknown + [e["id"] for e in missing]
    unavailable_names = unknown + [e.get("name") or e["id"] for e in missing]
    progress({"stage": "classify", "offline": registry.offline, "unavailable": unavailable_names,
              "packs": [{k: r[k] for k in ("id", "name", "score", "matched", "reason")} for r in pack_rows],
              "candidates": top_candidates(full_text, manifest, {m.entry.get("id") for m in matches})})
    hits = glossary_hits(full_text, pack.glossary)

    dev = probe()
    model = config.MODEL_FAST if options.fast else config.default_model(dev.kind)
    polish_on = options.polish if options.polish is not None else dev.kind == "gpu"
    estimate = estimator(dev, model, words, polish_on) if estimator is not None else None
    llm = llm_factory(dev, model)
    own_tm = tm is None
    rows, pairs = [], []
    try:
        event = {"stage": "device", "device": dev.kind, "device_name": dev.name, "model": model, "polish": polish_on}
        if estimate is not None:
            event["estimate"] = estimate.summary()
        progress(event)
        if own_tm:
            tm = TM(config.app_home() / "tm.sqlite")
        # app version in the cache key: prompt / QA changes between releases must not reuse old translations
        scope = pack_key + "+" + style.key() + "+" + config.VERSION
        translator = Translator(llm, build_system(style.prompt, pack, hits), model, scope, pack.term_fixes, hits, tm)
        t_translate = time.time()
        for n, item in enumerate(work):
            prev = work[n - 1].segment.plain if n > 0 else ""
            nxt = work[n + 1].segment.plain if n + 1 < len(work) else ""
            outcome = _translate(translator, item, prev, nxt, sleep)
            pairs.append((item, outcome))
            flags = list(outcome.flags)
            if item.segment.locked:
                flags.append("locked_text:" + " | ".join(t[:60] for t in item.segment.locked))
            rows.append({"where": item.location, "src": _shown(item.segment.tagged), "out": _shown(outcome.text),
                         "level": outcome.level, "flags": flags, "cached": outcome.cached})
            event = {"stage": "translate", "done": n + 1, "total": len(work), "where": item.location}
            if estimate is not None:
                event["eta_s"] = round(estimate.remaining_translate(n + 1, time.time() - t_translate))
            progress(event)
        t_polish = time.time()
        polish = {"enabled": False}
        if polish_on:
            ratio = estimate.translate_ratio(len(work), t_polish - t_translate) if estimate is not None else 1.0

            def polish_progress(event):
                if estimate is not None and event.get("stage") == "polish":
                    event = dict(event, eta_s=round(estimate.remaining_polish(
                        event["done"], event["total"], time.time() - t_polish, ratio)))
                progress(event)
            polisher = Polisher(llm, build_editor_system(style.prompt, pack), model, scope, pack.term_fixes, hits, tm)
            polish, changed = run_polish(pairs, pkg.kind, polisher, polish_progress, translator.recheck)
            for n in changed:
                rows[n]["out"], rows[n]["flags"] = _shown(pairs[n][1].text), list(pairs[n][1].flags)
    finally:
        if own_tm and tm is not None:
            tm.close()
        if hasattr(llm, "close"):
            llm.close()
    t_write = time.time()

    progress({"stage": "write"})
    for (item, outcome), row in zip(pairs, rows):
        fixes = apply(item.element, outcome.segment, outcome.text)  # placeholder fixes made while writing
        if fixes:
            row["flags"] = row["flags"] + ["apply:" + f for f in fixes]
        pkg.mark_dirty(item.part)
    fit_changes = fit_pptx([(i, o) for i, o in pairs if "/slides/" in i.part]) if pkg.kind == "pptx" else []
    index = font_index or FontIndex(config.app_home() / "font_index.json")
    font_changes = fix_fonts(pkg, [strip_tags(o.text) for _, o in pairs], index)
    out_path = out_dir / output_name(src)
    partial = out_path.with_name(out_path.stem + ".partial" + out_path.suffix)
    pkg.save(partial)

    meta = {"file": src.name, "output": out_path.name, "kind": pkg.kind, "domain": pack.id,
            "domain_name": pack.name, "pack": pack.key(), "packs": pack_rows, "packs_unavailable": unavailable,
            "packs_unavailable_names": unavailable_names, "registry_offline": registry.offline,
            "device": dev.kind, "device_name": dev.name,
            "model": model, "fast": options.fast, "polish": polish,
            "seconds": {"prepare": round(t_translate - started, 1), "translate": round(t_polish - t_translate, 1),
                        "polish": round(t_write - t_polish, 1), "write": round(time.time() - t_write, 1)}}
    report = build_report(meta, rows, skipped, fit_changes, font_changes)
    try:
        reopen(partial)
    except Exception as exc:  # any load failure means a broken file: never deliver it
        partial.unlink(missing_ok=True)
        raise JobError("the translated file could not be opened again (%s); no output was kept"
                       % type(exc).__name__, report) from exc
    os.replace(partial, out_path)
    progress({"stage": "done", "flagged": report["counts"]["flagged"]})
    return JobResult(out_path, report)
