// The author's review page (spec Amendment G): the term pairs users sent after a term review (POST /api/v1/feedback),
// one row per (term, proposed Vietnamese, pack, kind) with its count, most frequent first; "Duyệt" approves a row,
// "Bỏ" rejects it; tools/pull_feedback.py takes the approved rows to the pack learner. The page and its API
// (/admin/api/feedback, /admin/api/decide) live under /admin/, behind Cloudflare Access, and the API checks the Access
// login again (functions/_lib/access.js). No inline script or style (the site's CSP); rows are written as text only.
export const API = { list: "/admin/api/feedback", decide: "/admin/api/decide" };
export const STATUS_LABEL = { new: "Mới", approved: "Đã duyệt", rejected: "Đã bỏ" };
export const KIND_LABEL = { new: "Từ mới", fixed: "Đã sửa" };

/** The message shown for a refused request (HTTP status, JSON body {code, message} or null). */
export function errorText(status, body) {
  const code = body && body.code;
  if (code === "admin_not_configured") {
    return "Trang quản trị chưa được cấu hình (Cloudflare Access: ACCESS_AUD, ACCESS_TEAM, ADMIN_EMAILS).";
  }
  if (code === "access_unavailable") return "Không lấy được khóa của Cloudflare Access; thử lại sau ít phút.";
  if (status === 403) return "Không có quyền truy cập. " + ((body && body.message) || "");
  if (code === "not_found") return "Không tìm thấy dòng này; tải lại danh sách.";
  return "Lỗi máy chủ (" + status + (code ? " " + code : "") + ").";
}

async function request(fetch, url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, redirect: "manual", credentials: "same-origin" });
  } catch (err) {
    throw new Error("Không kết nối được máy chủ; kiểm tra mạng rồi thử lại.");
  }
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new Error("Phiên đăng nhập Cloudflare Access đã hết hạn: tải lại trang.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    body = null;
  }
  if (!res.ok || !body) throw new Error(errorText(res.status, body));
  return body;
}

/** The rows of a status (new | approved | rejected | all). */
export async function loadRows(fetch, status) {
  const body = await request(fetch, API.list + "?status=" + encodeURIComponent(status));
  return Array.isArray(body.rows) ? body.rows : [];
}

/** Approve or reject a row: {ok, key, status}. */
export function decide(fetch, key, decision) {
  return request(fetch, API.decide, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, decision }) });
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function render(rows, onDecide) {
  document.getElementById("rows").replaceChildren(...rows.map((r) => {
    const tr = document.createElement("tr");
    const days = r.first_day === r.last_day ? r.first_day : r.first_day + " - " + r.last_day;
    tr.append(cell(String(r.count)), cell(r.en), cell(r.vi_used), cell(r.vi_user), cell(r.pack),
      cell(KIND_LABEL[r.kind] || r.kind), cell(days), cell(STATUS_LABEL[r.status] || r.status));
    const actions = document.createElement("td");
    for (const [decision, label] of [["approved", "Duyệt"], ["rejected", "Bỏ"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = r.status === decision;
      button.addEventListener("click", () => onDecide(r.key, decision, button));
      actions.append(button);
    }
    tr.append(actions);
    return tr;
  }));
}

function start() {
  const fetch = (url, init) => globalThis.fetch(url, init);
  const select = document.getElementById("status");
  const msg = document.getElementById("msg");
  const show = (text) => {
    msg.textContent = text;
  };
  let act;
  const refresh = async () => {
    show("Đang tải...");
    try {
      const rows = await loadRows(fetch, select.value);
      render(rows, act);
      show(rows.length ? rows.length + " dòng" : "Không có dòng nào.");
    } catch (err) {
      render([], act);
      show(err.message);
    }
  };
  act = async (key, decision, button) => {
    button.disabled = true;
    try {
      await decide(fetch, key, decision);
      await refresh();
    } catch (err) {
      show(err.message);
      button.disabled = false;
    }
  };
  select.addEventListener("change", refresh);
  document.getElementById("reload").addEventListener("click", refresh);
  refresh();
}

if (typeof document !== "undefined") start();
