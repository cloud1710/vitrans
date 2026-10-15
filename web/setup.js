// The installed helper's first-run setup as one short line for the local mode's card (GET /api/setup of the helper:
// state idle | running | waiting | ready | error | off, step detect | download | unpack | start | model, reason,
// download {done, total} bytes, model {model, completed, total}, error). Pure: no DOM, no network.
const pct = (done, total) => (total > 0 ? Math.max(0, Math.min(100, Math.floor((100 * done) / total))) : null);
const withPct = (text, p) => text + (p === null ? "…" : "… " + p + "%");

/** -> {text, error (show the retry button), active (keep polling)}; text "" = nothing to show. */
export function setupView(st) {
  if (!st || !st.state || st.state === "off" || st.state === "idle" || st.state === "ready") {
    return { text: "", error: false, active: false };
  }
  if (st.state === "error") {
    return { text: "Cài đặt chưa xong: " + (st.error || "lỗi không rõ"), error: true, active: false };
  }
  if (st.state === "waiting") {
    return { text: st.reason === "system_ollama_starting" ? "Đang chờ Ollama trên máy khởi động"
      : "Đang chờ Ollama", error: false, active: true };
  }
  if (st.step === "model") {
    const m = st.model || {};
    return { text: withPct("Đang tải mô hình" + (m.model ? " " + m.model : ""), pct(m.completed, m.total)), error: false,
      active: true };
  }
  const d = st.download || {};
  return { text: withPct("Đang tải thư viện", pct(d.done, d.total)), error: false, active: true };
}
