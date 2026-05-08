/* KL Yapı HelpDesk - Frontend JS */
(function() {
  "use strict";

  // ── THEME ──────────────────────────────────────────────────
  const THEME_KEY = "kl-theme";
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  }
  const saved = localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(saved);
  document.querySelectorAll(".theme-toggle, #theme-toggle").forEach(btn => btn.addEventListener("click", toggleTheme));

  // ── TOAST ──────────────────────────────────────────────────
  window.showToast = function(msg, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  };

  // ── CSRF HELPER ────────────────────────────────────────────
  function getCsrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }

  // ── NOTIFICATION BELL ──────────────────────────────────────
  const bell = document.getElementById("notif-bell");
  const widget = document.getElementById("notif-widget");
  const widgetBody = document.getElementById("notif-widget-body");
  const widgetCount = document.getElementById("notif-widget-count");
  const notifBadge = document.getElementById("notif-badge");
  const widgetClose = document.getElementById("notif-widget-close");

  if (bell && widget) {
    bell.addEventListener("click", () => {
      const hidden = widget.hidden;
      widget.hidden = !hidden;
      if (hidden) loadNotifications();
    });
    widgetClose?.addEventListener("click", () => { widget.hidden = true; });
    document.addEventListener("click", e => {
      if (!widget.contains(e.target) && !bell.contains(e.target)) widget.hidden = true;
    });

    function loadNotifications() {
      fetch("/api/notifications").then(r => r.json()).then(tickets => {
        const count = tickets.length;
        if (notifBadge) { notifBadge.hidden = count === 0; notifBadge.textContent = count > 9 ? "9+" : count; }
        if (widgetCount) { widgetCount.hidden = count === 0; widgetCount.textContent = count; }
        if (!widgetBody) return;
        if (!count) { widgetBody.innerHTML = '<p class="notif-widget__empty">Bekleyen aktif talep yok</p>'; return; }
        widgetBody.innerHTML = tickets.map(t => `
          <a href="/tickets/${t.id}" class="notif-widget__item">
            <div style="font-weight:600;font-size:13px;margin-bottom:2px">${t.ticket_no} — ${escHtml(t.title)}</div>
            <div style="font-size:11.5px;color:var(--t3)">${formatDate(t.updated_at)}</div>
          </a>`).join("");
      }).catch(() => {});
    }

    loadNotifications();
    setInterval(loadNotifications, 60000);
  }

  // ── BULK SELECT ────────────────────────────────────────────
  const selectAll = document.querySelector(".select-all-control input");
  const bulkBar = document.querySelector(".bulk-bar");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      document.querySelectorAll(".bulk-check input").forEach(cb => cb.checked = selectAll.checked);
      updateBulkBar();
    });
    document.querySelectorAll(".bulk-check input").forEach(cb => cb.addEventListener("change", updateBulkBar));
    function updateBulkBar() {
      const checked = document.querySelectorAll(".bulk-check input:checked").length;
      if (bulkBar) bulkBar.querySelector(".bulk-count") && (bulkBar.querySelector(".bulk-count").textContent = `${checked} seçili`);
    }
  }

  // ── QUICK REPLY ────────────────────────────────────────────
  const qrSelect = document.querySelector(".qr-select");
  if (qrSelect) {
    qrSelect.addEventListener("change", () => {
      const ta = document.querySelector(".chat-textarea");
      if (ta && qrSelect.value) { ta.value = qrSelect.value; ta.focus(); qrSelect.value = ""; }
    });
  }

  // ── AUTO RESIZE TEXTAREA ───────────────────────────────────
  document.querySelectorAll("textarea.chat-textarea, textarea.wa-textarea").forEach(ta => {
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
    });
  });

  // ── FILE ATTACH PREVIEW ────────────────────────────────────
  document.querySelectorAll(".attach-btn").forEach(btn => {
    const input = btn.parentElement?.querySelector(".attach-input");
    if (!input) return;
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const preview = btn.closest("form")?.querySelector(".attach-preview");
      if (!preview) return;
      preview.innerHTML = Array.from(input.files).map(f => `<span style="font-size:12px;background:var(--surface-2);border:1px solid var(--bd);padding:3px 10px;border-radius:6px;">📎 ${f.name}</span>`).join("");
    });
  });

  // ── SSE ────────────────────────────────────────────────────
  const streamId = document.querySelector("[data-stream-id]")?.dataset.streamId;
  if (streamId) {
    const es = new EventSource(`/api/tickets/${streamId}/stream`);
    es.addEventListener("message", (e) => {
      if (e.data === "ping") return;
    });
  }

  // ── STAR RATING ────────────────────────────────────────────
  document.querySelectorAll(".star-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.value;
      const input = document.querySelector("input[name=rating]");
      if (input) input.value = val;
      document.querySelectorAll(".star-btn").forEach(b => b.classList.toggle("is-active", parseInt(b.dataset.value) <= parseInt(val)));
    });
  });

  // ── COLOR PRESETS ──────────────────────────────────────────
  document.querySelectorAll(".color-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.closest("form")?.querySelector("input[name=color]");
      if (input) { input.value = btn.dataset.color; input.dispatchEvent(new Event("input")); }
    });
  });

  // ── UTILS ──────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function formatDate(d) {
    if (!d) return "";
    const date = new Date(d);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return "az önce";
    if (diff < 3600000) return Math.floor(diff / 60000) + " dk önce";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " sa önce";
    return date.toLocaleDateString("tr-TR");
  }

})();
