"""Static checks of the main page (web/index.html, app.js, advice.js, _headers): the app shell (five tool tabs, plain
text first, the image and live tools loaded when their tab opens, the old /anh/ and /live/ addresses redirected), the
recommendation card, the advanced options, the quality notice of the progress card, the progress log and the review
line, the cloud engine's parts (spec Amendment F: the one first-use consent, Turnstile, cancel, Blob download), the menu of
the tab bar (his 2026-10-15 design: the engine choice that replaced the "Dich tren may" switch, the local options,
the log view), the subtitle tool's parts, the default view true for the cloud (the helper's cards and words only in
the local mode); textContent only, no inline script or style, self-hosted fonts, and a CSP that adds only Turnstile,
wasm (the on-device OCR) and Blob images (the image tool) to the helper's."""
import re

from vitranslate.config import REPO_ROOT

WEB = REPO_ROOT / "web"
HTML = (WEB / "index.html").read_text(encoding="utf-8")
APP = (WEB / "app.js").read_text(encoding="utf-8")
ADVICE = (WEB / "advice.js").read_text(encoding="utf-8")
# the cloud API is on the page's own origin ('self'); Turnstile needs its script and its iframe; the on-device OCR of
# the PDF path and the image tool compiles its WebAssembly ('wasm-unsafe-eval': wasm only, never JS eval); the image
# tool, now a tab of this page, decodes the chosen photo through an <img> with a Blob URL (img-src blob:, as its old
# /anh/ page had)
CSP = ("Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' "
       "https://challenges.cloudflare.com; "
       "frame-src https://challenges.cloudflare.com; connect-src 'self' http://127.0.0.1:*; img-src 'self' data: blob:; "
       "frame-ancestors 'none'; base-uri 'none'; object-src 'none'")
LOCAL_SWITCH = "Dịch trên máy (riêng tư, không gửi lên mạng)"  # the old switch, gone since the menu (2026-10-15)
ENGINES = (("cloud", "Máy chủ (Cloudflare)"), ("local", "Trên máy (ViTranslate)"))

TIP_AWAKE = "Giữ máy không ngủ và không đóng trang trong lúc dịch."
TIP_REVIEW = "Dịch xong, hãy xem các đoạn cần xem lại; chuyên gia cần duyệt bản dịch trước khi dùng."
CHECKING = "Đang kiểm tra cấu hình phù hợp…"
NO_PACK = ("Không có gói thuật ngữ phù hợp với tài liệu này: "
           "thuật ngữ chuyên ngành có thể chưa chuẩn")
USING_PACK = "Đang dùng gói thuật ngữ: "
POLISH = "Đọc lại cho mượt: "


def menu():
    m = re.search(r'<div id="menu" class="menu" role="dialog" aria-label="Tùy chọn" hidden>(.*?)\n    </div>\n  </div>',
                  HTML, re.S)
    assert m, "menu"
    return m.group(1)


def section(sid):
    m = re.search(r'<section[^>]*id="%s"[^>]*>(.*?)</section>' % sid, HTML, re.S)
    assert m, sid
    return m.group(1)


def test_recommendation_card_comes_first_and_has_its_parts():
    card = section("advice")
    assert "<h2>Gợi ý cho máy này</h2>" in card
    for el in ("advice-line", "advice-estimate", "advice-detail", "advice-status", "advice-pull", "advice-redo"):
        assert 'id="%s"' % el in card, el
    # helperAdvice() never asks a question or links the lab: no ask buttons, no link, no code behind them
    for gone in ("advice-ask", "ask-a", "ask-b", "advice-link"):
        assert 'id="%s"' % gone not in HTML and '"%s"' % gone not in APP, gone
    for gone in ("askOptions", "function answer(", "a.ask", "a.link"):
        assert gone not in APP, gone
    assert not re.search(r"^\.ask\b", (WEB / "style.css").read_text(encoding="utf-8"), re.M)
    assert CHECKING in card  # shown at once, before anything is known
    assert ">Đo lại</button>" in card
    assert HTML.index('id="advice"') < HTML.index('id="upload"')


def test_options_move_under_a_collapsed_advanced_section():
    upload = section("upload")
    m = re.search(r"<details[^>]*>\s*<summary>Tùy chọn nâng cao</summary>(.*?)</details>", upload, re.S)
    assert m and " open" not in upload[upload.index("<details"):upload.index(">", upload.index("<details"))]
    assert 'id="opt-notes"' in m.group(1)
    # the read-back pass and the fast draft (the helper's jobs only) live in the menu's "Trên máy" section, shown with
    # Trên máy only: hidden at load, never on the upload card any more
    local = re.search(r'<fieldset class="menu-group" id="local-options" hidden>(.*?)</fieldset>', menu(), re.S)
    assert local and "<legend>Trên máy</legend>" in local.group(1)
    for opt in ("opt-polish", "opt-fast"):
        assert 'id="%s"' % opt in local.group(1) and 'id="%s"' % opt not in upload, opt


def test_quality_notice_on_top_of_the_progress_card():
    prog = section("progress")
    notice = re.search(r'<ul id="notice"[^>]*>(.*?)</ul>', prog, re.S)
    assert notice and prog.index('id="notice"') < prog.index('id="steps"')
    for el in ("q-model", "q-packs", "q-polish", "q-eta"):
        assert 'id="%s"' % el in notice.group(1), el
    assert TIP_AWAKE in notice.group(1) and TIP_REVIEW in notice.group(1)
    for text in (NO_PACK, USING_PACK, POLISH):
        assert text in APP + ADVICE, text  # advice.js builds the event texts of both engines


def test_progress_log_panel_and_review_line():
    log = section("log-card")
    assert re.search(r'<ol id="log" class="log"', log)
    assert HTML.index('id="progress"') < HTML.index('id="log-card"') < HTML.index('id="result"')
    result = section("result")
    assert 'id="review"' in result and 'id="review-why"' not in result  # the review in one line
    assert CHECKING in APP  # the first log line


def test_page_names_the_models_of_amendment_e_and_asks_for_the_recommended_one_only():
    # Gemma 4 E4B with a GPU, Qwen 3.5 9B on the CPU, Gemma 4 E2B as the fast draft
    fast = re.search(r'<input id="opt-fast" type="checkbox"> ([^<]*)<span', HTML).group(1)
    assert "Gemma 4 E2B" in fast
    assert "Gemma 4 E4B" in HTML and "Qwen 3.5 9B" in HTML and "Qwen 3.5 4B" not in HTML
    # one button on the card: the helper pulls the recommended model, the page cannot name another one
    assert 'post("/api/models/pull", {})' in APP and "/api/models/fast/pull" not in APP


def test_cloud_engine_parts_of_the_page():
    # ONE first-use consent (his 20:48 wording): three short bullets, a checkbox and one button; the other dialogs are
    # the term-feedback question after a job (spec Amendment G) and the live tool's own consent
    # the other dialogs are the term-feedback question after a job (spec Amendment G), the menu's log view and the
    # live tool's own consent: exactly these, each once
    assert re.findall(r'<dialog id="([^"]+)"', HTML) == ["consent", "feedback", "log-view", "live-consent"]
    m = re.search(r'<dialog id="consent">(.*?)</dialog>', HTML, re.S)
    assert m and HTML.count("<dialog") == 4
    consent = m.group(1)
    assert len(re.findall(r"<li>", consent)) == 3
    for text in ("chuyên gia duyệt", "gửi lên máy chủ", "không lưu lại", "huấn luyện", "định danh bệnh nhân"):
        assert text in consent, text
    assert 'id="agree"' in consent and 'id="consent-ok"' in consent and len(re.findall(r"<button", consent)) == 1
    # the Turnstile widget, cancel; the engine is the menu's "Dịch bằng" (always there: exactly two choices, no
    # automatic one), which replaced the small "Dich tren may" switch of the upload card
    upload = section("upload")
    assert 'id="turnstile-box"' in upload  # not id="turnstile": window.turnstile must stay the API
    for gone in ('id="engine-local"', 'id="engine-local-wrap"', LOCAL_SWITCH):
        assert gone not in HTML and gone not in APP, gone
    group = re.search(r'<fieldset class="menu-group">\s*<legend>Dịch bằng</legend>(.*?)</fieldset>', menu(), re.S)
    assert group, "Dich bang"
    radios = re.findall(r'<label><input type="radio" name="engine" value="(\w+)"> ([^<]*)</label>', group.group(1))
    assert tuple(radios) == ENGINES
    assert 'id="cancel"' in section("progress")
    # the in-browser model (paused, lab only) is not wired into the page any more
    for gone in ("model-consent", "opt-model", "advice-delete", "engine/runtime.js", "createModel"):
        assert gone not in HTML and gone not in APP, gone
    # the result is a Blob URL; the page asks before leaving and keeps the screen on while running; one job id
    for needle in ("URL.createObjectURL", "URL.revokeObjectURL", "beforeunload", "navigator.wakeLock",
                   "AbortController", "crypto.randomUUID", "createCloud", "cloudJob", "createSessionFlow"):
        assert needle in APP, needle


FEEDBACK_QUESTION = ("Gửi các thuật ngữ này cho tác giả để cập nhật dữ liệu? Chỉ gửi cặp thuật ngữ, không gửi câu nào "
                     "của tài liệu.")


def test_term_review_after_a_cloud_job():
    # spec Amendment G: a collapsed "Xem lại thuật ngữ" card, hidden until a cloud job ends; two lists, Áp dụng, the
    # explicit send button, the corrected download; the question asked every time before term pairs are sent
    assert re.search(r'<section class="card terms" id="terms" hidden>', HTML)
    terms = section("terms")
    assert re.search(r'<details id="terms-box">\s*<summary><h2>Xem lại thuật ngữ</h2></summary>', terms)  # closed
    assert "<h3>Từ mới</h3>" in terms and "<h3>Đã tự sửa</h3>" in terms
    for el in ("terms-new", "terms-fixed", "terms-new-note", "terms-retry", "terms-status", "terms-sent",
               "terms-copy-original"):
        assert 'id="%s"' % el in terms, el
    assert re.search(r'<button id="terms-apply"[^>]*disabled>Áp dụng</button>', terms)
    assert re.search(r'<button id="terms-send"[^>]*disabled>Gửi cho tác giả</button>', terms)
    assert re.search(r'<a id="terms-download"[^>]*hidden>Tải bản đã sửa</a>', terms)
    dialog = re.search(r'<dialog id="feedback">(.*?)</dialog>', HTML, re.S).group(1)
    assert "<p>" + FEEDBACK_QUESTION + "</p>" in dialog
    assert '<button id="feedback-send" class="primary" value="send">Gửi</button>' in dialog
    assert '<button id="feedback-no" value="no" autofocus>Không</button>' in dialog  # Enter answers Không
    # the helper's jobs never get the panel; the private switch closes it
    assert re.search(r"async function startHelper\(file\) \{\s*closeReview\(\);", APP)
    assert "if (local) closeReview();" in APP


# the helper's words: models, sizes, Ollama, 127.0.0.1, the pack registry, uninstalling, GPU / CPU, the card
HELPER_ACRONYMS = ("Ollama", "GB", "127.0.0.1", "Gemma 4 E", "Qwen", "GPU", "CPU")
HELPER_PHRASES = ("gỡ cài đặt", "kho gói", "tải mô hình", "gợi ý cho máy này", "phần cứng")
LOCAL_PARTS = (r'<section[^>]*id="setup".*?</section>', r'<section[^>]*id="advice".*?</section>',
               r'<fieldset class="menu-group" id="local-options".*?</fieldset>')


def test_the_default_view_is_the_cloud_and_the_helper_parts_belong_to_the_local_mode():
    # his 20:48 copy + the preview bug: every visible sentence is true for the cloud default; the helper's words only
    # in the local mode's parts (its set-up card, the recommendation card, its options), which start hidden
    for part in LOCAL_PARTS:
        m = re.search(part, HTML, re.S)
        assert m and re.match(r"<[^>]*\shidden>", m.group(0)), part + " must start hidden"
    rest = HTML
    for part in LOCAL_PARTS:
        rest = re.sub(part, "", rest, flags=re.S)
    for word in HELPER_ACRONYMS:
        assert word not in rest, word  # not in the cloud view, the consent or the footer
    for phrase in HELPER_PHRASES:
        assert phrase not in rest.lower(), phrase
    local = "".join(re.search(p, HTML, re.S).group(0) for p in LOCAL_PARTS)
    for word in ("Ollama", "6,6 GB", "127.0.0.1", "Gemma 4 E4B", "Qwen 3.5 9B", "gỡ cài đặt", "kho gói thuật ngữ"):
        assert word in local, word
    # one-line footer; the log card shows up with its first line
    assert re.search(r"<footer>Bản dịch máy – cần chuyên gia duyệt trước khi dùng\.</footer>", HTML)
    assert re.search(r'<section[^>]*id="log-card"[^>]*\shidden>', HTML)


TABS = [("text", "Văn bản", "view-app"), ("file", "Tài liệu", "view-app"), ("anh", "Ảnh", "view-anh"),
        ("sub", "Phụ đề", "view-app"), ("live", "Dịch đuổi", "view-live")]


def test_the_shell_has_five_tool_tabs_with_plain_text_first():
    # his 2026-10-15 order: Văn bản (default) · Tài liệu · Ảnh · Phụ đề · Dịch đuổi; one tablist, icons, keyboard
    bar = re.search(r'<div id="tools"([^>]*)>(.*?)</div>', HTML, re.S)
    assert bar and 'role="tablist"' in bar.group(1) and 'aria-label="' in bar.group(1)
    tabs = re.findall(r'<button([^>]*)>(.*?)</button>', bar.group(2), re.S)
    assert len(tabs) == 5
    for (tool, label, view), (attrs, inner) in zip(TABS, tabs):
        assert 'id="tab-%s"' % tool in attrs and 'data-tool="%s"' % tool in attrs, tool
        assert 'role="tab"' in attrs and 'type="button"' in attrs and 'aria-controls="%s"' % view in attrs, tool
        assert ('aria-selected="true"' if tool == "text" else 'aria-selected="false"') in attrs, tool
        assert ('tabindex="0"' if tool == "text" else 'tabindex="-1"') in attrs, tool
        assert re.search(r'<svg[^>]*aria-hidden="true"', inner) and "<span>%s</span>" % label in inner, tool
    # the views: the shared one shows first; the image and live tools start hidden
    assert re.search(r'<div id="view-app" role="tabpanel"[^>]*>', HTML)
    for view in ("view-anh", "view-live"):
        assert re.search(r'<div id="%s" role="tabpanel"[^>]*\shidden>' % view, HTML), view
    assert HTML.index('id="tools"') < HTML.index('id="view-app"') < HTML.index('id="view-anh"')
    # the shell switches tools; the image and live modules load only when their tab opens
    assert 'import { initTabs, APP_TOOLS } from "./shell.js";' in APP
    assert 'import("./anh/anh.js")' in APP and 'import("./live/live.js")' in APP
    assert 'import("./sub/subtitles.js")' in APP
    assert not re.search(r'^import [^;]*"\./(anh|live|sub)/', APP, re.M)
    # two scripts, both files: the theme before the first paint (head, classic) and the one module entry
    assert re.findall(r"<script[^>]*>", HTML) == ['<script src="theme.js">', '<script type="module" src="app.js">']
    assert HTML.index('<script src="theme.js">') < HTML.index("</head>")
    # the menu: a button at the right end of the tab bar (after the tablist, inside the bar), its panel hidden
    wrap = re.search(r'<div class="tabs-wrap">(.*?)\n  </div>\n\n  <main>', HTML, re.S)
    assert wrap and wrap.group(1).index('id="tools"') < wrap.group(1).index('id="menu-btn"')
    btn = re.search(r'<button([^>]*id="menu-btn"[^>]*)>', wrap.group(1)).group(1)
    for attr in ('type="button"', 'aria-controls="menu"', 'aria-label="Tùy chọn"', 'aria-haspopup="dialog"'):
        assert attr in btn, attr
    legends = re.findall(r"<legend>([^<]*)</legend>", menu())
    assert legends == ["Dịch bằng", "Phụ đề", "Trên máy", "Giao diện"] and 'id="menu-log"' in menu()


def test_text_tab_comes_first_and_files_second():
    # his order of 20:22: plain text first, then files; the mode buttons are now the tabs
    upload = section("upload")
    assert 'id="mode-text"' not in HTML and 'id="mode-file"' not in HTML
    assert re.search(r'<div id="text-panel">', upload) and re.search(r'<div id="file-panel" hidden>', upload)
    assert re.search(r'<div id="sub-panel" hidden>', upload)
    assert upload.index('id="text-panel"') < upload.index('id="file-panel"') < upload.index('id="drop"')
    assert re.search(r'<textarea id="src-text"', upload) and 'id="text-count"' in upload and 'id="text-note"' in upload
    # the Vietnamese comes paragraph by paragraph into its own card, with the pack line and a copy button
    out = section("text-result")
    for el in ("text-packs", "text-out", "text-copy"):
        assert 'id="%s"' % el in out, el
    for needle in ("textSegments", "textOutput", "countText", "navigator.clipboard.writeText", "isFlagged"):
        assert needle in APP, needle


def test_turnstile_uses_the_always_pass_test_key_on_localhost():
    # the page uses the shared browser check -> session flow (web/turnstile.js, also the image and live tools'), no
    # copy of it: one check at a time for the whole page (pageChecks) and one session (the shared store)
    assert 'import { createSessionFlow, pageChecks } from "./turnstile.js";' in APP
    assert 'createSessionFlow({ cloud, box: () => $("turnstile-box"), log, hub: pageChecks() })' in APP
    assert re.search(r"createCloud\(\{ store: sharedSessionStore\(\)[,}]", APP)
    for gone in ("turnstile.render", "TURNSTILE_SITE_KEY", "TURNSTILE_TEST_KEY", "function turnstileSiteKey",
                 "function ensureSession", "challenges.cloudflare.com"):
        assert gone not in APP, gone
    ts = (WEB / "turnstile.js").read_text(encoding="utf-8")
    fn = re.search(r"export function turnstileSiteKey\(hostname\) \{(.*?)\n\}", ts, re.S)
    assert fn, "turnstileSiteKey() not found"
    assert fn.group(1).strip() == ('return ["127.0.0.1", "localhost"].includes(hostname) ? TURNSTILE_TEST_KEY : '
                                   'TURNSTILE_SITE_KEY;')
    assert 'export const TURNSTILE_TEST_KEY = "1x00000000000000000000AA";' in ts  # Cloudflare's always-pass test key
    # anywhere else the site's own widget (vitrans.pages.dev, his 2026-10-14 key; public), never the test key
    assert 'export const TURNSTILE_SITE_KEY = "0x4AAAAAAFWpPjhZYuN91QqX";' in ts
    assert "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" in ts
    assert "flow.hostname || (typeof location" in ts  # the page's own host name


def test_subtitle_tool_parts():
    # his 13:45 tool: .srt / .vtt upload or paste, bilingual or Vietnamese only, SRT or VTT, the term review reused
    sub = re.search(r'<div id="sub-panel" hidden>(.*?)</div>\s*<div id="turnstile-box"', section("upload"), re.S)
    assert sub, "sub-panel"
    sub = sub.group(1)
    assert re.search(r'<input id="sub-file" type="file" accept="\.srt,\.vtt"', sub)
    assert re.search(r'<textarea id="sub-src"', sub) and 'id="sub-count"' in sub and 'id="sub-note"' in sub
    for name, values in (("sub-kind", ("bi", "vi")), ("sub-format", ("srt", "vtt"))):
        for v in values:
            assert re.search(r'<input type="radio" name="%s" value="%s"' % (name, v), sub), (name, v)
    assert "Chép lời từ tệp ghi âm: sắp có" in sub
    out = section("sub-result")
    for el in ("sub-packs", "sub-summary", "sub-out", "sub-download"):
        assert 'id="%s"' % el in out, el
    for needle in ("subSegments", "subResults", "writeSubs", 'profile: "file"', 'openReview({ mode: "sub"'):
        assert needle in APP, needle


def test_old_tool_addresses_open_their_tab():
    # /anh/ and /live/ keep working: a redirect page (no inline code) to the shell's tab, the query kept (?ocr=wasm)
    for path, slug in (("anh", "anh"), ("live", "dich-duoi")):
        page = (WEB / path / "index.html").read_text(encoding="utf-8")
        assert '<meta http-equiv="refresh" content="0; url=../#%s">' % slug in page, path
        assert '<script src="../redirect.js"></script>' in page and '<a href="../#%s">' % slug in page, path
        assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", page) and not re.search(r"\sstyle=", page), path
    redirect = (WEB / "redirect.js").read_text(encoding="utf-8")
    assert "location.search" in redirect and "location.replace" in redirect


def test_self_hosted_fonts_and_both_colour_schemes():
    css = (WEB / "style.css").read_text(encoding="utf-8")
    fonts = re.findall(r'url\("([^"]+)"\)', css)
    assert fonts and all(f.startswith("pdf/fonts/Noto") and f.endswith(".ttf") for f in fonts), fonts
    assert "https:" not in css and "@import" not in css  # same origin only
    assert "@media (prefers-color-scheme: dark)" in css and "--accent:" in css


def test_text_only_dom_no_inline_code_and_the_page_csp():
    tools = {p: (WEB / p).read_text(encoding="utf-8") for p in ("shell.js", "sub/subtitles.js", "anh/anh.js",
                                                                "live/live.js", "settings.js", "log.js", "prefs.js",
                                                                "adapter.js", "helper.js", "theme.js")}
    for name, js in [("app.js", APP), ("advice.js", ADVICE)] + list(tools.items()):
        assert "innerHTML" not in js and "insertAdjacentHTML" not in js and "document.write" not in js, name
    assert '<script type="module" src="app.js"></script>' in HTML
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", HTML)  # no inline script
    assert "<style" not in HTML and not re.search(r"\sstyle=", HTML) and not re.search(r"\son\w+=", HTML)
    headers = (WEB / "_headers").read_text(encoding="utf-8")
    # the page's block is exactly this: its CSP and the two /* headers
    assert headers.split("\n\n")[0] == ("/*\n  " + CSP + "\n  X-Content-Type-Options: nosniff\n"
                                        "  Referrer-Policy: no-referrer")
    # nothing else in the page's or the image tool's block: no inline script, no JS eval (only 'wasm-unsafe-eval'),
    # no workers directive, no model or library CDN
    page_block = headers.split("/lab/*")[0]
    for gone in ("unsafe-inline", "'unsafe-eval'", "worker-src", "jsdelivr", "huggingface", "hf.co"):
        assert gone not in page_block, gone
