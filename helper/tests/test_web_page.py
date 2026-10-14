"""Static checks of the main page (web/index.html, app.js, advice.js, _headers): the recommendation card, the advanced
options, the quality notice of the progress card, the progress log and the review line, the cloud engine's parts
(spec Amendment F: the one first-use consent, Turnstile, the small "Dich tren may" switch, cancel, Blob download), the
default view true for the cloud (the helper's cards and words only in the local mode); textContent only, no inline
script or style, and a CSP that adds only Turnstile to the helper's."""
import re

from vitranslate.config import REPO_ROOT

WEB = REPO_ROOT / "web"
HTML = (WEB / "index.html").read_text(encoding="utf-8")
APP = (WEB / "app.js").read_text(encoding="utf-8")
ADVICE = (WEB / "advice.js").read_text(encoding="utf-8")
# the cloud API is on the page's own origin ('self'); Turnstile needs its script and its iframe
CSP = ("Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; "
       "frame-src https://challenges.cloudflare.com; connect-src 'self' http://127.0.0.1:*; img-src 'self' data:; "
       "frame-ancestors 'none'; base-uri 'none'; object-src 'none'")
LOCAL_SWITCH = "Dịch trên máy (riêng tư, không gửi lên mạng)"

TIP_AWAKE = "Giữ máy không ngủ và không đóng trang trong lúc dịch."
TIP_REVIEW = "Dịch xong, hãy xem các đoạn cần xem lại; chuyên gia cần duyệt bản dịch trước khi dùng."
CHECKING = "Đang kiểm tra cấu hình phù hợp…"
NO_PACK = ("Không có gói thuật ngữ phù hợp với tài liệu này: "
           "thuật ngữ chuyên ngành có thể chưa chuẩn")
USING_PACK = "Đang dùng gói thuật ngữ: "
POLISH = "Đọc lại cho mượt: "


def section(sid):
    m = re.search(r'<section[^>]*id="%s"[^>]*>(.*?)</section>' % sid, HTML, re.S)
    assert m, sid
    return m.group(1)


def test_recommendation_card_comes_first_and_has_its_parts():
    card = section("advice")
    assert "<h2>Gợi ý cho máy này</h2>" in card
    for el in ("advice-line", "advice-estimate", "advice-detail", "advice-status", "advice-ask", "ask-a", "ask-b",
               "advice-link", "advice-pull", "advice-redo"):
        assert 'id="%s"' % el in card, el
    assert CHECKING in card  # shown at once, before anything is known
    assert ">Đo lại</button>" in card
    assert HTML.index('id="advice"') < HTML.index('id="upload"')


def test_options_move_under_a_collapsed_advanced_section():
    upload = section("upload")
    m = re.search(r"<details[^>]*>\s*<summary>Tùy chọn nâng cao</summary>(.*?)</details>", upload, re.S)
    assert m and " open" not in upload[upload.index("<details"):upload.index(">", upload.index("<details"))]
    for opt in ("opt-notes", "opt-polish", "opt-fast"):
        assert 'id="%s"' % opt in m.group(1), opt


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
    # ONE first-use consent (his 20:48 wording): three short bullets, a checkbox and one button
    m = re.search(r'<dialog id="consent">(.*?)</dialog>', HTML, re.S)
    assert m and HTML.count("<dialog") == 1
    consent = m.group(1)
    assert len(re.findall(r"<li>", consent)) == 3
    for text in ("chuyên gia duyệt", "gửi lên máy chủ", "không lưu lại", "huấn luyện", "định danh bệnh nhân"):
        assert text in consent, text
    assert 'id="agree"' in consent and 'id="consent-ok"' in consent and len(re.findall(r"<button", consent)) == 1
    # the Turnstile widget, the small "Dich tren may" switch (always there: it turns the local mode on), cancel
    upload = section("upload")
    assert 'id="turnstile-box"' in upload  # not id="turnstile": window.turnstile must stay the API
    switch = re.search(r'<label id="engine-local-wrap"([^>]*)>(.*?)</label>', upload, re.S)
    assert switch and 'id="engine-local"' in switch.group(2) and LOCAL_SWITCH in switch.group(2)
    assert "hidden" not in switch.group(1)
    assert upload.index('id="go"') < upload.index('id="engine-local-wrap"')  # under the Dich button, not above
    assert 'id="cancel"' in section("progress")
    # the in-browser model (paused, lab only) is not wired into the page any more
    for gone in ("model-consent", "opt-model", "advice-delete", "engine/runtime.js", "createModel"):
        assert gone not in HTML and gone not in APP, gone
    # the result is a Blob URL; the page asks before leaving and keeps the screen on while running; one job id
    for needle in ("URL.createObjectURL", "URL.revokeObjectURL", "beforeunload", "navigator.wakeLock",
                   "AbortController", "crypto.randomUUID", "createCloud", "cloudJob", "turnstile.render"):
        assert needle in APP, needle


# the helper's words: models, sizes, Ollama, 127.0.0.1, the pack registry, uninstalling, GPU / CPU, the card
HELPER_ACRONYMS = ("Ollama", "GB", "127.0.0.1", "Gemma 4 E", "Qwen", "GPU", "CPU")
HELPER_PHRASES = ("gỡ cài đặt", "kho gói", "tải mô hình", "gợi ý cho máy này", "phần cứng")
LOCAL_PARTS = (r'<section[^>]*id="setup".*?</section>', r'<section[^>]*id="advice".*?</section>',
               r'<div id="local-options".*?</div>')


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


def test_text_mode_comes_first_and_files_second():
    # his order of 20:22: plain text first, then files
    upload = section("upload")
    assert upload.index('id="mode-text"') < upload.index('id="mode-file"')
    assert re.search(r'<button id="mode-text"[^>]*aria-pressed="true"[^>]*>Văn bản</button>', upload)
    assert re.search(r'<button id="mode-file"[^>]*aria-pressed="false"[^>]*>Tệp</button>', upload)
    assert re.search(r'<div id="text-panel">', upload) and re.search(r'<div id="file-panel" hidden>', upload)
    assert upload.index('id="text-panel"') < upload.index('id="file-panel"') < upload.index('id="drop"')
    assert re.search(r'<textarea id="src-text"', upload) and 'id="text-count"' in upload and 'id="text-note"' in upload
    # the Vietnamese comes paragraph by paragraph into its own card, with the pack line and a copy button
    out = section("text-result")
    for el in ("text-packs", "text-out", "text-copy"):
        assert 'id="%s"' % el in out, el
    for needle in ("textSegments", "textOutput", "countText", "navigator.clipboard.writeText", "isFlagged"):
        assert needle in APP, needle


def test_turnstile_uses_the_always_pass_test_key_on_localhost():
    fn = re.search(r"function turnstileSiteKey\(\) \{(.*?)\n\}", APP, re.S)
    assert fn, "turnstileSiteKey() not found"
    assert '["127.0.0.1", "localhost"].includes(location.hostname)' in fn.group(1)
    assert '"1x00000000000000000000AA"' in APP  # Cloudflare's always-pass test site key
    # anywhere else the site's own widget (vitrans.pages.dev, his 2026-10-14 key; public), never the test key
    assert 'const TURNSTILE_SITE_KEY = "0x4AAAAAAFWpPjhZYuN91QqX";' in APP
    assert fn.group(1).strip().endswith("return TURNSTILE_SITE_KEY;")
    assert "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" in APP


def test_text_only_dom_no_inline_code_and_the_page_csp():
    for name, js in (("app.js", APP), ("advice.js", ADVICE)):
        assert "innerHTML" not in js and "insertAdjacentHTML" not in js and "document.write" not in js, name
    assert '<script type="module" src="app.js"></script>' in HTML
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", HTML)  # no inline script
    assert "<style" not in HTML and not re.search(r"\sstyle=", HTML) and not re.search(r"\son\w+=", HTML)
    headers = (WEB / "_headers").read_text(encoding="utf-8")
    assert CSP in headers
    # nothing else: no inline script, no eval, no wasm, no workers, no model or library CDN in the page's block
    page_block = headers.split("/lab/*")[0]
    for gone in ("unsafe-inline", "unsafe-eval", "worker-src", "jsdelivr", "huggingface", "hf.co"):
        assert gone not in page_block, gone
