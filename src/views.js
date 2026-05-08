const STATUS_LABELS = {
  open: "Açık",
  in_progress: "İşleme Alındı",
  waiting: "Beklemede",
  resolved: "Çözüldü",
  closed: "Çözüldü"   // eski kayıtlar için uyumluluk
};

const PRIORITY_LABELS = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
  urgent: "Acil"
};

const ROLE_LABELS = {
  admin: "Yönetici",
  agent: "Destek Ekibi",
  requester: "Talep Sahibi"
};

const DEFAULT_DEPARTMENT_OPTIONS = ["Tasarım", "Üretim", "Satın Alma", "Teknik Ofis", "Satış&Teklif", "Depo&Lojistik"];
const LOCATION_OPTIONS = ["Fabrika", "Merkez", "Saha"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function selected(value, current) {
  return String(value) === String(current) ? "selected" : "";
}

function formatDate(value) {
  const date = parseDateValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatTimeShort(value) {
  const date = parseDateValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("tr-TR", { timeStyle: "short" }).format(date);
}

function formatDurationMs(value) {
  const ms = Math.max(0, Math.round(Number(value) || 0));
  if (!ms) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} sn`;
}

function parseDateValue(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(/[tz]$/i.test(raw) || raw.includes("T") ? raw : `${raw}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ticketAge(createdAt, priority, slaConfig) {
  const createdDate = parseDateValue(createdAt);
  const ms = createdDate ? Date.now() - createdDate.getTime() : 0;
  const hours = ms / 3600000;

  const label = hours < 1
    ? "Az önce"
    : hours < 24
      ? `${Math.floor(hours)}s`
      : `${Math.floor(hours / 24)}g`;

  if (slaConfig && priority && slaConfig[priority]) {
    const pct = hours / slaConfig[priority];
    if (pct < 0.5) return { label, level: "fresh" };
    if (pct < 1.0) return { label, level: "warn" };
    return { label: label + " ⚠", level: "old" };
  }

  // SLA tanımsızsa saat/gün eşikleri
  if (hours < 1) return { label, level: "fresh" };
  if (hours < 24) return { label, level: "fresh" };
  const days = Math.floor(hours / 24);
  if (days < 3) return { label, level: "warn" };
  return { label, level: "old" };
}

function contactValue(value) {
  return value ? escapeHtml(value) : `<span class="empty-value">Belirtilmedi</span>`;
}

function ticketStatusWorkHint(ticket) {
  const hints = {
    open: "Kullanıcı takip ekranından mesaj yazabilir. İşleme alma adımı yalnızca durum bilgisini günceller.",
    in_progress: "Kullanıcıyla yazışma açık. Çözümde kısa bir açıklama yazarak kapat.",
    waiting: "Talep beklemede. Geri dönüş geldiğinde işleme devam et veya çözüm notuyla kapat.",
    resolved: "Talep çözüldü ve kapatıldı. Yazışma ve durum değişikliği kilitli.",
    closed: "Talep çözüldü ve kapatıldı. Yazışma ve durum değişikliği kilitli."
  };
  return hints[ticket.status] || "Talep durumunu kontrol ederek sıradaki işlemi seç.";
}

function ticketWorkflowPanel(ticket) {
  const status = ticket.status || "open";
  const started = ["in_progress", "waiting", "resolved", "closed"].includes(status);
  const waiting = status === "waiting";
  const done = ["resolved", "closed"].includes(status);
  const steps = [
    { label: "Kayıt", text: "Talep oluşturuldu", state: "is-done" },
    { label: "İşleme Al", text: "Durum güncellenir", state: started || done ? "is-done" : "is-active" },
    { label: "Takip", text: waiting ? "Geri dönüş bekleniyor" : "Yazışma açık", state: done ? "is-done" : "is-active" },
    { label: "Çözüm", text: "Notla kapatılır", state: done ? "is-done is-active" : "is-muted" }
  ];

  return `<section class="panel ticket-flow-panel">
    <div class="ticket-flow-copy">
      <span>İş akışı</span>
      <strong>${escapeHtml(STATUS_LABELS[status] || status)}</strong>
      <p>${escapeHtml(ticketStatusWorkHint(ticket))}</p>
    </div>
    <ol class="ticket-flow-steps">
      ${steps.map((step, index) => `
        <li class="ticket-flow-step ${step.state}">
          <span class="ticket-flow-dot">${index + 1}</span>
          <span>
            <strong>${escapeHtml(step.label)}</strong>
            <small>${escapeHtml(step.text)}</small>
          </span>
        </li>`).join("")}
    </ol>
  </section>`;
}

function detailContactValue(item) {
  const value = String(item.value || "").trim();
  if (!value) return `<span class="empty-value">Belirtilmedi</span>`;
  if (item.key === "email") {
    return `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  }
  if (item.key === "phone") {
    const tel = value.replace(/[^\d+]/g, "");
    return `<a href="tel:${escapeHtml(tel)}">${escapeHtml(value)}</a>`;
  }
  return escapeHtml(value);
}

function departmentOptions(current = "", departments = []) {
  const configured = departments
    .map((department) => typeof department === "string" ? department : department?.name)
    .filter(Boolean);
  const list = configured.length ? configured : DEFAULT_DEPARTMENT_OPTIONS;
  const normalizedCurrent = String(current || "");
  const options = list.includes(normalizedCurrent) || !normalizedCurrent
    ? list
    : [normalizedCurrent, ...list];

  return `<option value="">Departman seçin</option>${options.map(
    (department) => `<option value="${escapeHtml(department)}" ${selected(department, current)}>${escapeHtml(department)}</option>`
  ).join("")}`;
}

function locationOptions(current = "") {
  return `<option value="">Lokasyon seçin</option>${LOCATION_OPTIONS.map(
    (location) => `<option value="${escapeHtml(location)}" ${selected(location, current)}>${escapeHtml(location)}</option>`
  ).join("")}`;
}

function parseThemeCookie(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)theme=([^;]+)/);
  if (!match) return null;
  const val = decodeURIComponent(match[1]);
  return val === "dark" || val === "light" ? val : null;
}

function publicTicketPath(ticket) {
  return ticket.public_token ? `/talep/takip/${encodeURIComponent(ticket.public_token)}` : "";
}

function isTerminalTicket(ticket) {
  return ticket?.status === "closed" || ticket?.status === "resolved";
}

function ticketNumber(ticket) {
  return ticket.ticket_no || `#${ticket.id}`;
}

function isSupportComment(comment) {
  return comment.user_role === "admin";
}

function commentAuthor(comment, ticket) {
  if (comment.is_internal) return "İç not";
  if (isSupportComment(comment)) return "IT Destek";
  return ticket.requester_name || "Kullanıcı";
}

function chatDirection(comment, viewer) {
  if (comment.is_internal) return "message-note";
  const fromSupport = isSupportComment(comment);
  return viewer === "admin"
    ? fromSupport
      ? "message-out"
      : "message-in"
    : fromSupport
      ? "message-in"
      : "message-out";
}

function chatAttachmentList(comment, ticket, viewer) {
  const attachments = comment.attachments || [];
  if (!attachments.length) return "";
  const ticketPath = viewer === "public" ? publicTicketPath(ticket) : `/tickets/${ticket.id}`;
  const hrefPrefix = viewer === "public" ? `${ticketPath}/attachments` : `/tickets/${ticket.id}/attachments`;

  return `<div class="chat-attachments">
    ${attachments.map((attachment) => `
      <a class="chat-attachment" href="${hrefPrefix}/${attachment.id}" target="_blank" rel="noopener">
        <span class="chat-attachment-icon">${attachmentIcon(attachment.mime_type)}</span>
        <span>
          <strong>${escapeHtml(attachment.original_name)}</strong>
          <small>${formatBytes(attachment.size)}</small>
        </span>
      </a>`).join("")}
  </div>`;
}

function chatMessages({ ticket, comments, viewer }) {
  const hasMessages = comments.length > 0;
  const items = hasMessages
    ? comments
        .map((comment) => {
          const dir = chatDirection(comment, viewer);
          const time = formatTimeShort(comment.created_at);
          const attachments = chatAttachmentList(comment, ticket, viewer);

          if (dir === "message-note") {
            return `<article class="wa-msg wa-msg-note">
              <div class="wa-bubble wa-bubble-note">
                <span class="wa-sender">İç not — sadece panelde görünür</span>
                <p class="wa-bubble-text">${escapeHtml(comment.body)}</p>
                ${attachments}
                <span class="wa-bubble-meta">${time}</span>
              </div>
            </article>`;
          }

          const isIn = dir === "message-in";
          const author = commentAuthor(comment, ticket);
          return `<article class="wa-msg ${isIn ? "wa-msg-in" : "wa-msg-out"}">
            <div class="wa-bubble">
              ${isIn ? `<span class="wa-sender">${escapeHtml(author)}</span>` : ""}
              <p class="wa-bubble-text">${escapeHtml(comment.body)}</p>
              ${attachments}
              <span class="wa-bubble-meta">${time}</span>
            </div>
          </article>`;
        })
        .join("\n")
    : `<div class="empty chat-empty">
        <span class="chat-empty-mark" aria-hidden="true"></span>
        <strong class="chat-empty-title">Henüz mesaj yok</strong>
        <span class="chat-empty-text">${viewer === "admin" ? "İlk yanıtı buradan gönderebilirsiniz." : "Mesajınızı buradan yazabilirsiniz. IT ekibi yanıt verdiğinde konuşma burada devam eder."}</span>
      </div>`;

  return `<div class="chat-messages ${hasMessages ? "has-messages" : "is-empty"}" aria-label="Canlı yazışma">
    <div class="wa-messages-list">${items}</div>
  </div>`;
}

function waMessageItems({ ticket, comments }) {
  if (!comments.length) {
    return `<div class="wa-empty">Mesajınızı buradan yazabilirsiniz. IT ekibi yanıt verdiğinde konuşma burada devam eder.</div>`;
  }

  return comments
    .map((comment) => {
      const fromSupport = isSupportComment(comment);
      return `<article class="wa-msg ${fromSupport ? "wa-msg-in" : "wa-msg-out"}">
        <div class="wa-bubble">
          ${fromSupport ? `<span class="wa-sender">IT Destek</span>` : ""}
          <p class="wa-bubble-text">${escapeHtml(comment.body)}</p>
          <span class="wa-bubble-meta">${formatTimeShort(comment.created_at)}</span>
        </div>
      </article>`;
    })
    .join("\n");
}

function chatMessagesFragment({ ticket, comments, viewer }) {
  return chatMessages({ ticket, comments, viewer });
}

function publicSelfCloseForm(req, ticket) {
  if (!ticket || isTerminalTicket(ticket)) return "";
  const followPath = publicTicketPath(ticket);
  if (!followPath) return "";

  return `<div class="public-self-close">
    <div>
      <strong>Desteğe ihtiyaç kalmadıysa</strong>
      <p>Sorun destek müdahalesi gerekmeden düzeldiyse talebi buradan kapatabilirsiniz. Kayıt silinmez, geçmiş talep ekranında korunur.</p>
    </div>
    <form method="post" action="${escapeHtml(followPath + "/kapat")}" class="public-self-close-form">
      ${csrfInput(req)}
      <label>Kısa not <span>isteğe bağlı</span>
        <textarea name="closeNote" rows="2" maxlength="500" placeholder="Örn. Sorun kendiliğinden düzeldi, desteğe ihtiyaç kalmadı."></textarea>
      </label>
      <button type="submit" class="button secondary">Desteğe İhtiyaç Kalmadı, Talebi Kapat</button>
    </form>
  </div>`;
}

function chatPanel(req, { ticket, comments, viewer, canReply, action, refreshPath, includeInternalOption = false, lockedText, allowAttachment = false, quickReplies = [] }) {
  const sendIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  const clipIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
  const eventPath = refreshPath ? refreshPath.replace(/\/messages$/, "/events") : "";
  const panelClass = viewer === "public" ? " public-chat-panel" : viewer === "admin" ? " admin-chat-panel" : "";
  const title = viewer === "public" ? "Talep iletişimi" : "Canlı yazışma";
  const description = viewer === "admin"
    ? "Kullanıcıyla konuşmayı bu ekrandan takip et."
    : "Mesajınızı buradan iletin; IT ekibi yanıtladığında konuşma aynı alanda devam eder.";
  const selfCloseForm = viewer === "public" ? publicSelfCloseForm(req, ticket) : "";
  const isPublicWaiting = viewer === "public" && !canReply && comments.length === 0;
  const messageSurface = chatMessages({ ticket, comments, viewer });
  const scrollShell = `<div class="chat-scroll-shell">${messageSurface}</div>`;
  const panelExtra = selfCloseForm ? `<div class="chat-panel-extra">${selfCloseForm}</div>` : "";

  if (isPublicWaiting) {
    return `<section class="panel chat-panel${panelClass} public-chat-waiting" data-chat-url="${escapeHtml(refreshPath)}" data-chat-events="${escapeHtml(eventPath)}" data-chat-can-reply="0">
      <div class="section-title chat-title">
        <div>
          <h2>${title}</h2>
          <p>Talep aktif olduğunda yazışma otomatik olarak bu ekranda başlayacak.</p>
        </div>
        <span class="pill status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
      </div>
      <div class="chat-waiting-body">
        <span class="waiting-mark" aria-hidden="true"></span>
        <h3>Yazışma henüz başlamadı</h3>
        <p>Talebiniz IT destek ekibine ulaştı. Talep aktif olduğunda bu alan mesajlaşma ekranına dönüşür.</p>
        <div class="waiting-steps" aria-label="Talep süreci">
          <div class="waiting-step is-done">
            <span aria-hidden="true"></span>
            <div>
              <strong>Talep alındı</strong>
              <small>Kayıt oluşturuldu ve takip numarası üretildi.</small>
            </div>
          </div>
          <div class="waiting-step is-active">
            <span aria-hidden="true"></span>
            <div>
              <strong>İnceleme bekliyor</strong>
              <small>IT ekibi talebi sıraya aldı.</small>
            </div>
          </div>
          <div class="waiting-step">
            <span aria-hidden="true"></span>
            <div>
              <strong>Yazışma açılacak</strong>
              <small>Talep aktif olduğunda buradan mesaj gönderebilirsiniz.</small>
            </div>
          </div>
        </div>
      </div>
      <div class="chat-waiting-foot">
        <span>${escapeHtml(lockedText)}</span>
        ${selfCloseForm}
      </div>
    </section>`;
  }

  return `<section class="panel chat-panel${panelClass}" data-chat-url="${escapeHtml(refreshPath)}" data-chat-events="${escapeHtml(eventPath)}" data-chat-can-reply="${canReply ? "1" : "0"}">
    <div class="section-title chat-title">
      <div>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
      <span class="pill status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
    </div>
      <div class="chat-panel-body">
        ${scrollShell}
        ${
          canReply
          ? `<form class="chat-form" method="post" action="${escapeHtml(action)}" enctype="multipart/form-data">
            ${csrfInput(req)}
            ${includeInternalOption
              ? `<div class="chat-top-bar">
                  <label class="checkbox"><input type="checkbox" name="isInternal" value="1"> İç not olarak gönder</label>
                  ${quickReplies.length
                    ? `<select class="qr-select" data-qr-target>
                        <option value="">Hazır yanıt seç…</option>
                        ${quickReplies.map((qr) => `<option value="${escapeHtml(qr.body)}">${escapeHtml(qr.title)}</option>`).join("")}
                      </select>`
                    : ""}
                </div>`
              : ""}
            <div class="chat-input-row">
              ${allowAttachment
                ? `<label class="attach-btn" title="Dosya ekle">
                    ${clipIcon}
                    <input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" class="attach-input">
                  </label>`
                : ""}
              <textarea name="body" class="chat-textarea" rows="1" placeholder="Mesajını yaz\u2026"></textarea>
              <button type="submit" class="wa-send-btn" aria-label="Gönder">${sendIcon}</button>
            </div>
            <div class="attach-preview" hidden></div>
          </form>`
          : `<div class="chat-locked">${escapeHtml(lockedText)}</div>`
      }
    </div>
    ${panelExtra}
  </section>`;
}

function csrfInput(req) {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(req.session.csrfToken)}">`;
}

function publicTicketRememberMarker(ticket, followPath = "") {
  if (!ticket || !followPath) return "";
  return `<div hidden
    data-current-public-ticket
    data-ticket-no="${escapeHtml(ticketNumber(ticket))}"
    data-ticket-title="${escapeHtml(ticket.title || "Destek talebi")}"
    data-ticket-url="${escapeHtml(followPath)}"></div>`;
}

function flash(req) {
  const message = req.session.flash;
  if (!message) return "";
  delete req.session.flash;
  const text = message.text || message.msg || "";
  return `<div class="notice notice-${escapeHtml(message.type)}" role="status">${escapeHtml(text)}</div>`;
}

function layout(req, { title, body, actions = "", publicOnly = false, pageClass = "", showPageHeading = true }) {
  const user = publicOnly ? null : req.currentUser;
  const appName = req.app.locals.appName;
  const themeCookie = parseThemeCookie(req);
  const currentPath = req.path || "";
  const isAdminAuth = !user && (currentPath === "/login" || currentPath === "/setup");
  const userLabel = user ? escapeHtml(user.name || user.full_name || user.email || "Yönetici") : "";
  const userInitials = userLabel ? userLabel.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) : "?";
  const userRole = user?.role === "admin" ? "Yönetici" : "Destek Ekibi";

  const isActive = (href, exact = false) => exact ? currentPath === href : currentPath === href || currentPath.startsWith(href + "/");
  const navLink = (href, label, icon, exact = false) =>
    `<a href="${href}" class="nav-item${isActive(href, exact) ? " nav-item--active" : ""}">
      <span class="nav-item__icon">${icon}</span>
      <span class="nav-item__label">${label}</span>
    </a>`;

  const svgMoon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const svgSun = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const svgLogout = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
  const svgBell = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const svgPlus = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const svgDash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
  const svgTicket = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const svgChart = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  const svgMsg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const svgFolder = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  const svgTag = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
  const svgLink = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  const svgGear = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`;

  if (user) {
    return `<!doctype html>
<html lang="tr"${themeCookie ? ` data-theme="${themeCookie}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${escapeHtml(req.session.csrfToken)}">
  <title>${escapeHtml(title)} | ${escapeHtml(appName)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css?v=20260507-v9">
</head>
<body class="app-body">
  <aside class="sidebar">
    <div class="sidebar__brand">
      <div class="sidebar__logo">KL</div>
      <span class="sidebar__name">${escapeHtml(appName)}</span>
      <button class="sidebar__bell notif-bell" id="notif-bell" type="button" aria-label="Bildirimler">
        ${svgBell}<span class="notif-badge" id="notif-badge" hidden>0</span>
      </button>
    </div>
    <nav class="sidebar__nav">
      ${navLink("/dashboard", "Ana Sayfa", svgDash, true)}
      ${navLink("/tickets", "Biletler", svgTicket)}
      ${navLink("/admin/reports", "Raporlar", svgChart)}
      ${navLink("/admin/quick-replies", "Hazır Yanıtlar", svgMsg)}
      ${user.role === "admin" ? navLink("/admin/categories", "Kategoriler", svgFolder) : ""}
      ${user.role === "admin" ? navLink("/admin/tags", "Etiketler", svgTag) : ""}
      ${user.role === "admin" ? navLink("/admin/webhooks", "Webhooks", svgLink) : ""}
      ${user.role === "admin" ? navLink("/admin/settings", "Ayarlar", svgGear) : ""}
    </nav>
    <a href="/tickets/new" class="sidebar__new-btn">${svgPlus} Yeni Destek Talebi</a>
    <div class="sidebar__footer">
      <div class="sidebar__avatar">${userInitials}</div>
      <div class="sidebar__user">
        <span class="sidebar__user-name">${userLabel}</span>
        <span class="sidebar__user-role">${userRole}</span>
      </div>
      <div class="sidebar__footer-actions">
        <button class="sidebar__icon-btn theme-toggle" id="theme-toggle" type="button">
          <span class="theme-icon-moon">${svgMoon}</span>
          <span class="theme-icon-sun">${svgSun}</span>
        </button>
        <form method="post" action="/logout" style="display:inline">
          ${csrfInput(req)}
          <button class="sidebar__icon-btn" type="submit">${svgLogout}</button>
        </form>
      </div>
    </div>
  </aside>
  <div class="main-wrap">
    <div class="main-content${pageClass ? " " + escapeHtml(pageClass) : ""}">
      ${showPageHeading !== false ? `
      <div class="page-head">
        <div>
          <p class="page-head__eyebrow">IT Destek</p>
          <h1 class="page-head__title">${escapeHtml(title)}</h1>
        </div>
        ${actions ? `<div class="page-head__actions">${actions}</div>` : ""}
      </div>` : ""}
      ${flash(req)}
      ${body}
    </div>
  </div>
  <div id="toast-container" aria-live="polite"></div>
  <div id="notif-widget" class="notif-widget" hidden>
    <div class="notif-widget__head">
      <span class="notif-widget__title">Aktif Talepler<span class="notif-widget__count" id="notif-widget-count" hidden></span></span>
      <button class="notif-widget__close" id="notif-widget-close" type="button">✕</button>
    </div>
    <div class="notif-widget__body" id="notif-widget-body"><p class="notif-widget__empty">Yükleniyor…</p></div>
    <div class="notif-widget__footer"><a href="/tickets">Tüm talepler →</a></div>
  </div>
  <script src="/chat.js?v=20260429-02" defer></script>
</body>
</html>`;
  }

  return `<!doctype html>
<html lang="tr"${themeCookie ? ` data-theme="${themeCookie}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${escapeHtml(req.session.csrfToken)}">
  <title>${escapeHtml(title)} | ${escapeHtml(appName)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css?v=20260507-v9">
</head>
<body class="pub-body${isAdminAuth ? " pub-body--auth" : ""}">
  <header class="pub-header">
    <div class="pub-header__inner">
      <a class="pub-header__brand" href="${isAdminAuth ? "/login" : "/talep"}">
        <img src="/assets/logo-on-light.png" alt="KL Yapı" height="28" class="pub-header__logo-light" decoding="async">
        <img src="/assets/brand-logo-header.png" alt="KL Yapı" height="28" class="pub-header__logo-dark" decoding="async">
        <span>IT Talep Takip Sistemi</span>
      </a>
      <nav class="pub-header__nav">
        ${isAdminAuth ? "" : `
          <a href="/talep" class="${currentPath === "/talep" ? "active" : ""}">Talep Aç</a>
          <a href="/talep/ara" class="${currentPath.startsWith("/talep/ara") ? "active" : ""}">Talep Sorgula</a>
          <a href="/login" class="pub-header__login-btn">Yönetici Girişi</a>
        `}
        <button class="pub-header__theme-btn theme-toggle" id="theme-toggle" type="button">
          <span class="theme-icon-moon">${svgMoon}</span>
          <span class="theme-icon-sun">${svgSun}</span>
        </button>
      </nav>
    </div>
  </header>
  <main class="pub-main${pageClass ? " " + escapeHtml(pageClass) : ""}">
    ${showPageHeading !== false && !isAdminAuth ? `
    <div class="pub-page-head">
      <h1>${escapeHtml(title)}</h1>
      ${actions ? `<div>${actions}</div>` : ""}
    </div>` : ""}
    ${flash(req)}
    ${body}
  </main>
  <div id="toast-container" aria-live="polite"></div>
  <script src="/chat.js?v=20260429-02" defer></script>
</body>
</html>`;
}



function layoutWaChat(req, { title, ticket, canReply, comments, action }) {
  const appName = req.app.locals.appName;
  const followPath = publicTicketPath(ticket);
  const descriptionPreview =
    ticket.description.length > 110
      ? ticket.description.slice(0, 110) + "\u2026"
      : ticket.description;

  const sendIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  const lockIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const backIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ${escapeHtml(appName)}</title>
  <link rel="stylesheet" href="/styles.css?v=20260507-v9">
</head>
<body class="wa-body website-shell portal-shell is-public public-shell">
  <header class="wa-topbar">
    <a class="wa-back" href="/talep" aria-label="Talep formuna dön">${backIcon}</a>
    <div class="wa-avatar" aria-hidden="true">IT</div>
    <div class="wa-topbar-info">
      <strong>IT Destek</strong>
      <span>${escapeHtml(ticketNumber(ticket))} &middot; ${escapeHtml(STATUS_LABELS[ticket.status] || ticket.status)}</span>
    </div>
  </header>

  <div class="wa-ticket-strip">
    <strong>${escapeHtml(ticket.title)}</strong>
    <p>${escapeHtml(descriptionPreview)}</p>
  </div>

  ${flash(req)}

  <div class="wa-messages"
       role="log"
       aria-label="Canlı yazışma"
       data-wa-url="${escapeHtml(followPath + "/messages")}"
       data-wa-events="${escapeHtml(followPath + "/events")}"
       data-wa-can-reply="${canReply ? "1" : "0"}">
    <div class="wa-messages-list">
      ${waMessageItems({ ticket, comments })}
    </div>
  </div>

  ${
    canReply
      ? `<form class="wa-input-bar" method="post" action="${escapeHtml(action)}" data-wa-form>
          <input type="hidden" name="_csrf" value="${escapeHtml(req.session.csrfToken)}">
          <textarea name="body" class="wa-textarea" rows="1" placeholder="Mesajını yaz\u2026" autocomplete="off" required></textarea>
          <button type="submit" class="wa-send-btn" aria-label="Gönder">${sendIcon}</button>
        </form>`
      : `<div class="wa-locked-bar">
          ${lockIcon}
          <span>${(ticket.status === "closed" || ticket.status === "resolved") ? "Bu talep çözüldü ve kapatıldı, yeni mesaj gönderilemez." : "Talep işleme alındığında buradan mesaj yazabilirsin."}</span>
        </div>`
  }

  <script src="/chat.js?v=20260429-02" defer></script>
</body>
</html>`;
}

function setupPage(req) {
  return layout(req, {
    title: "İlk Kurulum",
    pageClass: "auth-page",
    body: `
      <section class="panel narrow auth-card">
        <h2>İlk yönetici hesabını oluştur</h2>
        <p>Bu ekran sadece sistemde hiç kullanıcı yokken açıktır.</p>
        <form method="post" action="/setup" class="form-grid">
          ${csrfInput(req)}
          <label>Ad Soyad
            <input name="name" autocomplete="name" required>
          </label>
          <label>E-posta
            <input name="email" type="email" autocomplete="email" required>
          </label>
          <label>Şifre
            <input name="password" type="password" autocomplete="new-password" minlength="10" required>
          </label>
          <button type="submit">Yönetici hesabını oluştur</button>
        </form>
      </section>`
  });
}

function totpVerifyPage(req) {
  return layout(req, {
    title: "İki Adımlı Doğrulama",
    pageClass: "auth-page",
    publicOnly: true,
    body: `
      <section class="panel narrow auth-card">
        <div class="auth-card-head">
          <span>Güvenlik doğrulaması</span>
          <h2>Doğrulama Kodu</h2>
          <p>Authenticator uygulamanızdaki 6 haneli kodu girin.</p>
        </div>
        <form method="post" action="/login/2fa" class="form-grid auth-form">
          ${csrfInput(req)}
          <label>Doğrulama Kodu
            <input name="token" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
              autocomplete="one-time-code" placeholder="000000" required autofocus>
          </label>
          <button type="submit">Giriş yap</button>
        </form>
        <div class="auth-user-link">
          <a href="/login">← Giriş ekranına dön</a>
        </div>
      </section>`
  });
}

function totpSetupPage(req, { secret, qrDataUri }) {
  return layout(req, {
    title: "2FA Kurulumu",
    body: `
      <section class="panel narrow">
        <h2>İki Adımlı Doğrulama Kur</h2>
        <p>Google Authenticator, Authy veya benzeri bir TOTP uygulamasıyla QR kodu tarayın, ardından uygulamanın gösterdiği 6 haneli kodu girerek etkinleştirin.</p>
        <div class="totp-qr-wrap">
          ${qrDataUri
            ? `<img src="${escapeHtml(qrDataUri)}" alt="QR Kod" width="200" height="200" class="totp-qr">`
            : `<div class="totp-qr-error">QR kod yüklenemedi. Lütfen aşağıdaki kodu manuel girin.</div>`}
        </div>
        <p class="settings-hint">QR tarayamıyorsanız uygulamaya manuel girin: <code class="totp-secret">${escapeHtml(secret)}</code></p>
        <form method="post" action="/admin/profile/2fa/setup" class="form-grid">
          ${csrfInput(req)}
          <label>Uygulamanın gösterdiği 6 haneli kod
            <input name="token" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
              autocomplete="off" placeholder="000000" required autofocus>
          </label>
          <button type="submit">Doğrula ve Etkinleştir</button>
        </form>
      </section>`
  });
}

function loginPage(req) {
  return layout(req, {
    title: "Yönetici Girişi",
    pageClass: "auth-page",
    body: `
      <section class="panel narrow auth-card admin-auth-card">
        <div class="auth-card-head">
          <span>Yönetici erişimi</span>
          <h2>IT Yönetim Paneli</h2>
          <p>Bu ekran sadece IT destek yönetimi içindir. Çalışan talepleri ayrı talep ekranından alınır.</p>
        </div>
        <form method="post" action="/login" class="form-grid auth-form">
          ${csrfInput(req)}
          <label>E-posta
            <input name="email" type="email" autocomplete="email" required>
          </label>
          <label>Şifre
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <label class="checkbox-label auth-remember wide">
            <input type="checkbox" name="remember" value="1">
            <span>Beni bu cihazda hatırla</span>
          </label>
          <button type="submit">Giriş yap</button>
        </form>
        <div class="auth-user-link">
          <span>Talep oluşturmak isteyen kullanıcılar için ayrı ekran:</span>
          <a href="/talep">Kullanıcı talep ekranına geç</a>
        </div>
      </section>`,
    publicOnly: true
  });
}

function publicTicketPage(req, { priorities = ["low","normal","high","urgent"], categories = [], departments = [], lastTicket = null }) {
  return layout(req, {
    title: "Destek Talebi Aç",
    pageClass: "support-page",
    publicOnly: true,
    body: `
      <div class="support-form-shell">
        <section class="support-form-intro">
          <span>IT Destek Merkezi</span>
          <h2>Talebinizi bize iletin</h2>
          <p>Adınızı, ulaşabileceğimiz e-posta adresini ve yaşadığınız sorunu yazın. Talebiniz kayıt altına alındığında e-posta ile bilgilendirme yapılır.</p>
        </section>

        <section class="recent-ticket-card" data-recent-ticket hidden>
          <div>
            <span>Bu cihazda son açılan talep</span>
            <strong data-recent-ticket-no></strong>
            <p data-recent-ticket-title></p>
          </div>
          <div class="recent-ticket-actions">
            <a class="button secondary" href="#" data-recent-ticket-link>Talebi Aç</a>
            <button type="button" class="button ghost" data-recent-ticket-clear>Unut</button>
          </div>
        </section>

        <form method="post" action="/talep" id="support-ticket-form" class="panel support-form-card" enctype="multipart/form-data">
          ${csrfInput(req)}

          <section class="form-section">
            <div class="form-section-title">
              <h2>İletişim Bilgileri</h2>
              <p>Talep ile ilgili dönüş yapabilmemiz için bilgilerinizi eksiksiz girin.</p>
            </div>
            <div class="form-grid">
              <label class="wide">İsim Soyisim <span class="req">*</span>
                <input name="requesterName" autocomplete="name" required>
              </label>
              <label>E-posta <span class="req">*</span>
                <input name="requesterEmail" type="email" autocomplete="email" required>
              </label>
              <label class="phone-field">Telefon
                <input name="requesterPhone" autocomplete="tel">
              </label>
              <label>Departman
                <select name="requesterCompany">${departmentOptions("", departments)}</select>
              </label>
              <label>Lokasyon
                <select name="requesterLocation">${locationOptions()}</select>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-title">
              <h2>Talep Detayı</h2>
              <p>Kısa bir başlık ve açıklama, talebin daha hızlı değerlendirilmesini sağlar.</p>
            </div>
            <div class="form-grid">
              <label class="wide">Konu Başlığı <span class="req">*</span>
                <input name="title" maxlength="120" required>
              </label>
              <label>Öncelik
                <select name="priority">
                  ${priorities.map((p) => `<option value="${p}" ${selected(p, "normal")}>${PRIORITY_LABELS[p]}</option>`).join("")}
                </select>
              </label>
              <label class="wide">Sorun / Talep Detayı <span class="req">*</span>
                <textarea name="description" rows="8" placeholder="Talebinizi mümkün olduğunca açık ve anlaşılır şekilde yazın." required></textarea>
              </label>
              <label class="wide file-drop">Ek dosya
                <input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
                <span>Ekran görüntüsü, PDF, Word, Excel veya metin dosyası ekleyebilirsiniz. En fazla 5 dosya, dosya başına 10 MB.</span>
              </label>
            </div>
          </section>

          <div class="support-form-footer">
            <p>Talebiniz oluşturulduktan sonra talep numarası e-posta ile paylaşılır.</p>
            <button type="submit" class="button">Talebi Gönder</button>
          </div>
        </form>
      </div>`
  });
}

function ticketSearchPage(req, { q, contact = "", searched = false, rateLimited = false }) {
  return layout(req, {
    title: "Talep Sorgula",
    pageClass: "search-page",
    body: `
      <section class="panel narrow">
        <h2>Talebini sorgula</h2>
        <p>Güvenlik için takip bağlantısı bu ekranda gösterilmez. Bilgiler eşleşirse bağlantı talepte kayıtlı e-posta adresine gönderilir.</p>
        <form method="post" action="/talep/ara" class="form-grid">
          ${csrfInput(req)}
          <label class="wide">Talep numarası
            <input name="q" value="${escapeHtml(q)}" placeholder="KLY-2026-0001" autocomplete="off" required>
          </label>
          <label class="wide">Kayıtlı e-posta veya telefon
            <input name="contact" value="${escapeHtml(contact)}" placeholder="ornek@domain.com veya 05xx xxx xx xx" autocomplete="off" required>
          </label>
          <button type="submit">Takip bağlantısı gönder</button>
        </form>
        ${rateLimited
          ? `<div class="notice notice-error" style="margin-top:16px">Çok fazla sorgu denemesi yapıldı. Lütfen bir süre sonra tekrar dene.</div>`
          : ""}
        ${searched
          ? `<div class="notice notice-success" style="margin-top:16px">Bilgiler kayıtlarımızla eşleşiyorsa takip bağlantısı kayıtlı e-posta adresine gönderildi. Gelen kutusunu ve gereksiz klasörünü kontrol et.</div>`
          : ""}
      </section>`,
    publicOnly: true
  });
}

function receiptAttachmentSummary(attachments = [], followPath = "") {
  if (!attachments.length) return "";
  return `<div class="receipt-attachments">
    <h3>Eklenen Dosyalar</h3>
    <div class="receipt-attachment-list">
      ${attachments.map((attachment) => {
        const href = followPath ? `${followPath}/attachments/${attachment.id}` : "#";
        return `<a class="receipt-attachment" href="${escapeHtml(href)}">
          <span>${attachmentIcon(attachment.mime_type)}</span>
          <strong>${escapeHtml(attachment.original_name)}</strong>
          <small>${formatBytes(attachment.size)}</small>
        </a>`;
      }).join("")}
    </div>
  </div>`;
}

function publicTicketExperiencePage(req, { title, ticket, followPath, attachments = [], comments = [], canReply = false, success = false }) {
  const number = ticketNumber(ticket || {});
  const requesterName = ticket?.requester_name || "Talep sahibi";
  const isClosed = isTerminalTicket(ticket);
  const statusLabel = STATUS_LABELS[ticket?.status] || "Açık";
  const details = [
    { label: "Konu", value: ticket?.title || "Destek talebi", tone: "topic" },
    { label: "Departman", value: ticket?.requester_company || "Belirtilmedi", tone: "department" },
    { label: "Lokasyon", value: ticket?.requester_location || "Belirtilmedi", tone: "location" },
    { label: "Öncelik", value: PRIORITY_LABELS[ticket?.priority] || "Normal", tone: "priority" },
    { label: "Durum", value: statusLabel, tone: "status" }
  ];
  const flow = [
    { label: "Talep alındı", text: "Kayıt oluşturuldu.", done: true },
    { label: "İnceleme", text: isClosed ? "IT ekibi talebi tamamladı." : "IT ekibi talebi sıraya aldı.", done: isClosed, active: !isClosed },
    { label: "Canlı iletişim", text: canReply ? "Mesajlaşma açık." : "Talep kapatıldı.", done: canReply || isClosed, active: canReply },
    { label: "Sonuç", text: isClosed ? "Talep çözüldü." : "Çözüm bekleniyor.", done: isClosed }
  ];
  const railLinks = [
    { href: "#client-overview", label: "Genel Bakış", meta: "Talep özeti" },
    { href: "#client-details", label: "Talep Detayı", meta: "Kayıt bilgileri" },
    { href: "#client-chat", label: "Canlı Sohbet", meta: canReply ? "Mesajlaşma açık" : "Yanıt bekliyor" },
    { href: "#client-feedback", label: "Değerlendirme", meta: isClosed ? "Talep sonrası" : "Talep kapandıktan sonra" }
  ];

  return layout(req, {
    title,
    pageClass: "receipt-page client-ticket-page client-ticket-page-portal",
    showPageHeading: false,
    body: `
      ${publicTicketRememberMarker(ticket, followPath)}
      <section class="client-ticket-hero">
        <div class="client-hero-logo" aria-hidden="true">
          <img class="receipt-logo client-hero-logo-light" src="/assets/logo-on-light.png" alt="KL Yapı" width="760" height="255" decoding="async">
          <img class="receipt-logo client-hero-logo-dark" src="/assets/logo-on-dark.png" alt="KL Yapı" width="760" height="255" decoding="async">
        </div>
        <div class="client-hero-copy">
          <p class="eyebrow">${success ? "Talebiniz Alındı" : "Talep Takibi"}</p>
          <h2>${success ? "Destek kaydınız canlı takipte" : "Talebinizin güncel durumu"}</h2>
          <p>${success
            ? "Talebiniz IT destek ekibine ulaştı. Bu ekranı kapatsanız bile e-postadaki takip bağlantısıyla aynı alana dönebilirsiniz."
            : "Bu sayfadan talebin durumunu izleyebilir ve IT destek ekibiyle yazışabilirsiniz."}</p>
        </div>
        <div class="client-hero-no">
          <span>Talep No</span>
          <strong>${escapeHtml(number)}</strong>
          <small>${escapeHtml(statusLabel)}</small>
        </div>
      </section>

      <section class="client-ticket-shell">
        <aside class="client-ticket-rail">
          <section class="panel client-rail-card">
            <span class="mini-eyebrow">Hızlı Menü</span>
            <h3>Takip Merkezi</h3>
            <nav class="client-rail-nav" aria-label="Talep menüsü">
              ${railLinks.map((item) => `
                <a href="${item.href}">
                  <strong>${escapeHtml(item.label)}</strong>
                  <small>${escapeHtml(item.meta)}</small>
                </a>
              `).join("")}
            </nav>
          </section>

          <section class="panel client-rail-card client-rail-status">
            <span class="mini-eyebrow">Kayıt Özeti</span>
            <h3>${escapeHtml(number)}</h3>
            <dl>
              <div>
                <dt>Durum</dt>
                <dd>${escapeHtml(statusLabel)}</dd>
              </div>
              <div>
                <dt>Öncelik</dt>
                <dd>${escapeHtml(PRIORITY_LABELS[ticket?.priority] || "Normal")}</dd>
              </div>
              <div>
                <dt>Departman</dt>
                <dd>${escapeHtml(ticket?.requester_company || "Belirtilmedi")}</dd>
              </div>
              <div>
                <dt>Oluşturulma</dt>
                <dd>${escapeHtml(formatDate(ticket?.created_at || new Date().toISOString()))}</dd>
              </div>
            </dl>
            <div class="client-rail-actions">
              <a class="button secondary" href="/talep">Yeni Talep Aç</a>
              <a class="button ghost" href="#client-chat">Sohbete Git</a>
            </div>
          </section>
        </aside>

        <article class="client-ticket-main" id="client-overview">
          <div class="client-success-card">
            <span class="client-check" aria-hidden="true">✓</span>
            <div>
              <p class="eyebrow">${success ? "Kayıt tamamlandı" : "Güncel kayıt"}</p>
              <h2>Sayın ${escapeHtml(requesterName)}, talebiniz kayıt altında.</h2>
              <p>${isClosed
                ? "Talep çözüldü olarak kapatıldı. Kayıt geçmişi bu ekranda korunur."
                : canReply
                  ? "Sağdaki canlı iletişim alanından mesaj gönderebilir, IT ekibinin yanıtlarını aynı ekranda takip edebilirsiniz."
                  : "IT destek ekibimiz talebinizi inceleyecek. Talep kapalıysa yeni mesaj gönderilemez."}</p>
            </div>
          </div>

          <div class="client-flow" aria-label="Talep süreci">
            ${flow.map((item) => `
              <div class="client-flow-step${item.done ? " is-done" : ""}${item.active ? " is-active" : ""}">
                <span aria-hidden="true"></span>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.text)}</small>
              </div>
            `).join("")}
          </div>

          <div class="client-section-head" id="client-details">
            <h3>Talep Detayları</h3>
            <span>${escapeHtml(formatDate(ticket?.created_at || new Date().toISOString()))}</span>
          </div>
          <div class="client-detail-grid">
            ${details.map((item) => `
              <div class="client-detail-card receipt-${item.tone}">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
              </div>
            `).join("")}
          </div>

          <div class="client-message-card">
            <div>
              <span>Mesajınız</span>
              <strong>${escapeHtml(ticket?.title || "Destek talebi")}</strong>
            </div>
            <p>${escapeHtml(ticket?.description || "Açıklama girilmemiş.")}</p>
          </div>
          ${receiptAttachmentSummary(attachments, followPath)}

          <div class="client-action-row" id="client-feedback">
            <a class="button secondary" href="/talep">Yeni Talep Aç</a>
          </div>
          ${starRatingSection(req, ticket)}
        </article>

        <aside class="client-live-column" id="client-chat">
          ${followPath && ticket
            ? chatPanel(req, {
                action: `${followPath}/comment`,
                canReply,
                comments,
                lockedText: isClosed
                  ? "Bu talep çözüldü ve kapatıldı. Yeni mesaj gönderilemez."
                  : "Mesajınızı buradan yazabilirsiniz.",
                refreshPath: `${followPath}/messages`,
                ticket,
                viewer: "public",
                allowAttachment: true
              })
            : `<section class="panel chat-panel"><div class="chat-locked">Canlı yazışma bağlantısı hazırlanamadı. E-posta ile bilgilendirme yapılacaktır.</div></section>`}
        </aside>
      </section>`,
    publicOnly: true
  });
}

function publicTicketSuccessPage(req, { ticketId, ticketNo, followPath, ticket, attachments = [], comments = [], canReply = false }) {
  const fallbackTicket = ticket || { id: ticketId, ticket_no: ticketNo, requester_name: "Talep sahibi", title: "Destek talebi", description: "" };
  return publicTicketExperiencePage(req, {
    attachments,
    canReply,
    comments,
    followPath,
    success: true,
    ticket: fallbackTicket,
    title: "Talep Alındı"
  });
}

function starRatingSection(req, ticket) {
  const followPath = publicTicketPath(ticket);
  const isTerminal = isTerminalTicket(ticket);
  if (!isTerminal) return "";

  if (ticket.rating) {
    const stars = "★".repeat(ticket.rating) + "☆".repeat(5 - ticket.rating);
    return `<section class="panel rating-panel rating-done">
      <h2>Değerlendirmeniz</h2>
      <p class="rating-stars-display">${stars}</p>
      <p class="rating-thanks">Geri bildiriminiz için teşekkürler.</p>
    </section>`;
  }

  return `<section class="panel rating-panel">
    <h2>Bu talebi değerlendir</h2>
    <p class="rating-hint">Aldığınız destek hizmetini puanlayın.</p>
    <form method="post" action="${escapeHtml(followPath + "/rate")}" class="rating-form">
      ${csrfInput(req)}
      <div class="star-rating" role="group" aria-label="Puan ver">
        ${[1, 2, 3, 4, 5].map((n) => `
          <button type="submit" name="rating" value="${n}" class="star-btn" aria-label="${n} yıldız">★</button>`).join("")}
      </div>
    </form>
  </section>`;
}

function publicTicketChatPage(req, { ticket, comments, canReply }) {
  const followPath = publicTicketPath(ticket);
  const number = ticketNumber(ticket);

  return publicTicketExperiencePage(req, {
    canReply,
    comments,
    followPath,
    ticket,
    title: `Talep ${number}`
  });
}

function barChart(daily) {
  // Son 7 günü doldur (eksik günler 0 olsun)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }

  const dataMap = Object.fromEntries(daily.map((r) => [r.day, r.count]));
  const values = days.map((d) => dataMap[d] || 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);

  const bars = values.map((v, i) => {
    const height = v > 0 ? Math.max(10, Math.round((v / max) * 100)) : 2;
    const label = days[i].slice(5); // MM-DD
    return `
      <div class="daily-bar-cell">
        <strong>${v || ""}</strong>
        <div class="daily-bar-track" aria-hidden="true">
          <span style="height:${height}%"></span>
        </div>
        <small>${label}</small>
      </div>`;
  }).join("");

  return `<div class="trend-graph">
    <div class="chart-summary">
      <strong>${total}</strong>
      <span>Talep</span>
    </div>
    <div class="daily-bars" aria-label="Son 7 gün talep sayısı">
      ${bars}
    </div>
  </div>`;
}

function donutChart(byStatus) {
  const statusOrder = [
    { status: "open", label: "Açık", color: "#4a9eff" },
    { status: "in_progress", label: "İşleme alındı", color: "#f2b319" },
    { status: "waiting", label: "Beklemede", color: "#54c6b8" },
    { status: "resolved", label: "Çözüldü", color: "#4caf7d" },
  ];
  const counts = Object.fromEntries((byStatus || []).map((row) => [row.status, Number(row.count) || 0]));
  const rows = statusOrder.map((row) => ({
    ...row,
    count: row.status === "resolved" ? (counts.resolved || 0) + (counts.closed || 0) : counts[row.status] || 0
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (!total) {
    return `<div class="status-empty">Henüz durum dağılımı oluşturacak talep yok.</div>`;
  }

  const statusRows = rows
    .map((row, index) => {
      const percent = total ? Math.round((row.count / total) * 100) : 0;
      const width = percent > 0 ? Math.max(percent, 2) : 0;
      return `
        <div class="status-row">
          <div class="status-row-label">
            <span style="background:${row.color}"></span>
            <strong>${escapeHtml(row.label)}</strong>
          </div>
          <div class="status-row-track" aria-hidden="true">
            <span style="width:${width}%;background:${row.color}"></span>
          </div>
          <div class="status-row-meta">
            <strong>${row.count}</strong>
            <span>${percent}%</span>
          </div>
        </div>`;
    })
    .join("");

  return `<div class="status-graph">
    <div class="chart-summary">
      <strong>${total}</strong>
      <span>Toplam talep</span>
    </div>
    <div class="status-bars" aria-label="Durum dağılımı">
      ${statusRows}
    </div>
  </div>`;
}

function ticketRows(tickets, { bulk = false, slaConfig = null } = {}) {
  if (!tickets.length) {
    return `<div class="empty">Henüz kayıtlı destek talebi yok.</div>`;
  }

  return `<div class="ticket-list${bulk ? " ticket-list-selectable" : ""}">
    ${tickets
      .map((ticket) => {
        const age = ticketAge(ticket.created_at, ticket.priority, slaConfig);
        const isActive = !["resolved", "closed"].includes(ticket.status);
        const requester = ticket.requester_name || "Talep sahibi belirtilmedi";
        const owner = ticket.assignee_name ? ` → ${ticket.assignee_name}` : "";
        return `
          <div class="ticket-row-wrap ticket-row-status-${escapeHtml(ticket.status)}">
            ${bulk ? `<label class="bulk-check"><input type="checkbox" name="ids" value="${ticket.id}" form="bulk-form"><span class="bulk-check-ui" aria-hidden="true"></span><span class="sr-only">${escapeHtml(ticketNumber(ticket))} seç</span></label>` : ""}
            <a class="ticket-row" href="/tickets/${ticket.id}">
              <span class="ticket-id"><span>${escapeHtml(ticketNumber(ticket))}</span></span>
              <span class="ticket-row-main">
                <strong>${escapeHtml(ticket.title)}</strong>
                <small>${escapeHtml(requester)}${escapeHtml(owner)} · ${formatDate(ticket.updated_at)}</small>
              </span>
              <span class="ticket-row-tags">
                <span class="pill status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
                <span class="pill priority-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>
                ${isActive ? `<span class="sla-badge sla-${age.level}">${age.label}</span>` : `<span class="sla-badge sla-done">✓</span>`}
              </span>
            </a>
          </div>`;
      })
      .join("")}
  </div>`;
}

function systemStatusPanel(status, { compact = false } = {}) {
  if (!status) return "";

  const backupTone = status.lastBackup ? (status.backupFresh ? "ok" : "warn") : "warn";
  const mailTone = status.lastMail?.status === "failed" ? "error" : status.smtpConfigured ? "ok" : "warn";
  const diskTone = status.disk?.usedPercent >= 90 ? "error" : status.disk?.usedPercent >= 75 ? "warn" : "ok";
  const backupText = status.lastBackup
    ? `${formatDate(status.lastBackup.createdAt)} · ${formatBytes(status.lastBackup.size)}`
    : "Henüz yedek yok";
  const mailText = status.lastMail
    ? `${status.lastMail.status === "sent" ? "Son gönderim başarılı" : status.lastMail.status === "failed" ? "Son gönderim hatalı" : "Son gönderim atlandı"}`
    : status.smtpConfigured ? "SMTP hazır" : "SMTP ayarı bekliyor";
  const diskText = status.disk
    ? `${status.disk.usedPercent}% kullanım · ${formatBytes(status.disk.available)} boş`
    : "Disk bilgisi okunamadı";

  return `
    <section class="panel side-panel system-status-panel${compact ? " system-status-compact" : ""}">
      <div class="side-title">
        <span>Sistem durumu</span>
        <h2>İşletim Özeti</h2>
      </div>
      <div class="system-status-list">
        <div class="system-status-item">
          <span class="status-light status-${mailTone}"></span>
          <div>
            <strong>E-posta</strong>
            <small>${escapeHtml(mailText)}</small>
          </div>
        </div>
        <div class="system-status-item">
          <span class="status-light status-${backupTone}"></span>
          <div>
            <strong>Yedekleme</strong>
            <small>${escapeHtml(backupText)}</small>
          </div>
        </div>
        <div class="system-status-item">
          <span class="status-light status-${diskTone}"></span>
          <div>
            <strong>Depolama</strong>
            <small>${escapeHtml(diskText)}</small>
          </div>
        </div>
      </div>
    </section>`;
}

function dashboardPage(req, { stats, tickets, chartStats, workQueue = [], systemStatus = null, slaBreached = [] }) {
  const avgHoursLabel = chartStats && chartStats.avgHours
    ? chartStats.avgHours < 24
      ? `${Math.round(chartStats.avgHours)}s`
      : `${(chartStats.avgHours / 24).toFixed(1)}g`
    : "—";

  const avgRatingLabel = chartStats && chartStats.avgRating != null
    ? chartStats.avgRating.toFixed(1)
    : null;
  const statusCounts = Object.fromEntries((chartStats?.byStatus || []).map((row) => [row.status, row.count]));
  const flowItems = [
    ["open", "Açık", statusCounts.open || 0],
    ["in_progress", "İşleme alındı", statusCounts.in_progress || 0],
    ["waiting", "Beklemede", statusCounts.waiting || 0],
    ["resolved", "Çözüldü", (statusCounts.resolved || 0) + (statusCounts.closed || 0)]
  ];

  // SVG ikonları
  const ico = {
    layers:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    zap:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    alert:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    clock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    star:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    tickets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    chart:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  };

  return layout(req, {
    title: "Panel",
    pageClass: "dashboard-page",
    body: `

      <!-- ── KPI Kartları ──────────────────────────────── -->
      <div class="db-kpis">
        <a class="db-kpi db-kpi-c-blue" href="/tickets">
          <span class="db-kpi-icon">${ico.layers}</span>
          <strong class="db-kpi-val">${stats.total}</strong>
          <span class="db-kpi-lbl">Toplam</span>
        </a>
        <a class="db-kpi db-kpi-c-amber" href="/tickets?status=open">
          <span class="db-kpi-icon">${ico.zap}</span>
          <strong class="db-kpi-val">${stats.active}</strong>
          <span class="db-kpi-lbl">Aktif</span>
        </a>
        <a class="db-kpi db-kpi-c-red" href="/tickets?priority=urgent">
          <span class="db-kpi-icon">${ico.alert}</span>
          <strong class="db-kpi-val">${stats.urgent}</strong>
          <span class="db-kpi-lbl">Acil</span>
        </a>
        <a class="db-kpi db-kpi-c-green" href="/tickets?status=resolved">
          <span class="db-kpi-icon">${ico.check}</span>
          <strong class="db-kpi-val">${stats.done}</strong>
          <span class="db-kpi-lbl">Tamamlanan</span>
        </a>
        ${chartStats ? `
        <a class="db-kpi db-kpi-c-teal" href="/admin/reports">
          <span class="db-kpi-icon">${ico.clock}</span>
          <strong class="db-kpi-val">${escapeHtml(avgHoursLabel)}</strong>
          <span class="db-kpi-lbl">Ort. Çözüm</span>
        </a>` : ""}
        ${avgRatingLabel ? `
        <a class="db-kpi db-kpi-c-violet" href="/admin/reports">
          <span class="db-kpi-icon">${ico.star}</span>
          <strong class="db-kpi-val">${escapeHtml(avgRatingLabel)}<small> / 5</small></strong>
          <span class="db-kpi-lbl">Memnuniyet</span>
        </a>` : ""}
        ${slaBreached.length ? `
        <a class="db-kpi db-kpi-c-red" href="/tickets?status=open">
          <span class="db-kpi-icon">${ico.warning}</span>
          <strong class="db-kpi-val">${slaBreached.length}</strong>
          <span class="db-kpi-lbl">SLA İhlali</span>
        </a>` : ""}
      </div>

      <!-- ── Analytics (tam genişlik) ──────────────────── -->
      ${chartStats ? `
      <div class="db-analytics">
        <div class="db-analytics-hdr">
          <span class="db-analytics-ico">${ico.chart}</span>
          <h2>Talep Analitiği</h2>
          <span>Son 7 gün ve canlı durum</span>
        </div>
        <div class="db-analytics-body">
          <div class="db-chart-col">
            <p class="db-chart-label">Son 7 Gün</p>
            ${barChart(chartStats.daily)}
          </div>
          <div class="db-chart-col">
            <p class="db-chart-label">Durum Dağılımı</p>
            ${donutChart(chartStats.byStatus)}
          </div>
        </div>
      </div>` : ""}

      <!-- ── Ana çalışma alanı ──────────────────────────── -->
      <div class="db-workspace">

        <!-- Sol: talepler -->
        <div class="db-main">
          ${slaBreached.length ? `
          <div class="db-section">
            <div class="db-section-hdr">
              <h2>⚠ SLA İhlali</h2>
              <span class="db-badge-red">${slaBreached.length} talep</span>
              <a href="/tickets?status=open">Filtrele →</a>
            </div>
            <div class="db-section-body">${ticketRows(slaBreached)}</div>
          </div>` : ""}

          ${workQueue.length ? `
          <div class="db-section">
            <div class="db-section-hdr">
              <h2>Öncelikli İşler</h2>
              <a href="/tickets">Tümü →</a>
            </div>
            <div class="db-section-body">${ticketRows(workQueue)}</div>
          </div>` : ""}

          <div class="db-section">
            <div class="db-section-hdr">
              <h2>Son Hareketler</h2>
              <a href="/tickets">Tüm talepler →</a>
            </div>
            <div class="db-section-body">${ticketRows(tickets)}</div>
          </div>
        </div>

        <!-- Sağ: sidebar -->
        <aside class="db-side" aria-label="Panel özeti">

          <!-- İş akışı -->
          <div class="db-side-card">
            <div class="db-side-hdr">
              <small>Canlı Durum</small>
              <h3>İş Akışı</h3>
            </div>
            <div class="db-flow">
              ${flowItems.map(([status, label, count]) => `
              <a class="db-flow-item" href="/tickets?status=${status === "resolved" ? "resolved" : status}">
                <span class="db-flow-dot status-dot-${status}"></span>
                <span class="db-flow-lbl">${escapeHtml(label)}</span>
                <strong class="db-flow-cnt">${count}</strong>
              </a>`).join("")}
            </div>
          </div>

          <!-- Hızlı işlem -->
          <div class="db-side-card">
            <div class="db-side-hdr">
              <small>Hızlı İşlem</small>
              <h3>Bugün</h3>
            </div>
            <div class="db-quick">
              <a class="button" href="/tickets">Tüm Talepler</a>
              <a class="button secondary" href="/admin/reports">Raporlar</a>
            </div>
          </div>

          <!-- Performans -->
          <div class="db-side-card">
            <div class="db-side-hdr">
              <small>Performans</small>
              <h3>Özet</h3>
            </div>
            <dl class="db-metrics">
              <div>
                <dt>Ort. çözüm süresi</dt>
                <dd>${escapeHtml(avgHoursLabel)}</dd>
              </div>
              <div>
                <dt>Memnuniyet puanı</dt>
                <dd>${avgRatingLabel ? `${escapeHtml(avgRatingLabel)} / 5` : "—"}</dd>
              </div>
              <div>
                <dt>Aktif talep yükü</dt>
                <dd>${stats.active}</dd>
              </div>
            </dl>
          </div>

          ${systemStatusPanel(systemStatus, { compact: true })}
        </aside>
      </div>`
  });
}

function ticketsPage(req, { tickets, filters, statuses, agents, categories = [], months = [], slaConfig = null }) {
  const canBulk = req.currentUser.role === "admin";
  const canDelete = req.currentUser.role === "admin";
  const visibleStatuses = statuses.filter((s) => s !== "closed");
  const activeCount = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const urgentCount = tickets.filter((ticket) => ticket.priority === "urgent").length;
  const resolvedCount = tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status)).length;
  const hasFilters = Boolean(filters.status || filters.assignee || filters.category || filters.month || filters.search);
  return layout(req, {
    title: "Destek Talepleri",
    pageClass: "tickets-page",
    body: `
      <section class="tickets-console">
        <div class="tickets-console-head">
          <div>
            <span class="mini-eyebrow">IT destek</span>
            <h2>Talep merkezi</h2>
            <p>${hasFilters ? "Filtrelenen talepler aşağıda listeleniyor." : "Açık, acil ve çözülen talepleri tek ekrandan yönetin."}</p>
          </div>
          <div class="tickets-console-stats" aria-label="Liste özeti">
            <span><strong>${tickets.length}</strong> kayıt</span>
            <span><strong>${activeCount}</strong> aktif</span>
            <span><strong>${urgentCount}</strong> acil</span>
            <span><strong>${resolvedCount}</strong> çözüldü</span>
          </div>
        </div>

        <form method="get" action="/tickets" class="filters tickets-filter-panel">
          <label>Durum
            <select name="status">
              <option value="">Tümü</option>
              ${visibleStatuses.map((s) => `<option value="${s}" ${selected(s, filters.status)}>${STATUS_LABELS[s]}</option>`).join("")}
            </select>
          </label>
          <label>Sorumlu
            <select name="assignee">
              <option value="">Hepsi</option>
              <option value="me" ${selected("me", filters.assignee)}>Bana ait talepler</option>
              <option value="none" ${selected("none", filters.assignee)}>Sorumlu atanmayanlar</option>
            </select>
          </label>
          ${categories.length ? `<label>Kategori
            <select name="category">
              <option value="">Tümü</option>
              ${categories.map((c) => `<option value="${escapeHtml(c.name)}" ${selected(c.name, filters.category || "")}>${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>` : ""}
          ${months.length ? `<label>Ay
            <select name="month">
              <option value="">Tüm aylar</option>
              ${months.map((m) => `<option value="${m.ym}" ${selected(m.ym, filters.month || "")}>${escapeHtml(m.label)}</option>`).join("")}
            </select>
          </label>` : ""}
          <label class="tickets-search-field">Arama
            <input name="q" value="${escapeHtml(filters.search)}" placeholder="Başlık, açıklama veya talep no">
          </label>
          <button type="submit">Filtrele</button>
          ${hasFilters ? `<a class="button secondary" href="/tickets">Temizle</a>` : ""}
        </form>

        <section class="panel tickets-list-panel">
          <div class="tickets-list-toolbar">
            <div>
              <h2>Talep Listesi</h2>
              <p>${tickets.length ? "Satırı açarak detayları görüntüleyebilir, seçim moduyla toplu işlem yapabilirsiniz." : "Bu filtrede görüntülenecek talep bulunamadı."}</p>
            </div>
            ${canBulk && tickets.length ? `
              <label class="select-all-control">
                <input type="checkbox" id="bulk-select-all">
                <span>Tümünü seç</span>
              </label>` : ""}
          </div>

          ${canBulk && tickets.length ? `
          <div class="bulk-bar bulk-command" id="bulk-bar" hidden>
            <span id="bulk-count">0 seçili</span>
            <div class="bulk-actions">
              <button type="submit" name="action" value="in_progress" form="bulk-form" class="button secondary">İşleme Al</button>
              <button type="submit" name="action" value="urgent" form="bulk-form" class="button secondary">Acil Yap</button>
              ${canDelete ? `<button type="submit" name="action" value="delete" form="bulk-form" class="button danger-btn" data-bulk-delete>Toplu Sil</button>` : ""}
            </div>
          </div>
          <form id="bulk-form" method="post" action="/tickets/bulk">
            ${csrfInput(req)}
          </form>` : ""}

          ${ticketRows(tickets, { bulk: canBulk, slaConfig })}
        </section>
      </section>`
  });
}

function newTicketPage(req, { priorities, departments = [] }) {
  return layout(req, {
    title: "Yeni Destek Talebi",
    pageClass: "admin-form-page",
    body: `
      <section class="panel">
        <form method="post" action="/tickets" class="form-grid" enctype="multipart/form-data">
          ${csrfInput(req)}
          <label>İsim Soyisim
            <input name="requesterName" maxlength="120" required>
          </label>
          <label>E-posta
            <input name="requesterEmail" type="email">
          </label>
          <label>Telefon
            <input name="requesterPhone">
          </label>
          <label>Departman
            <select name="requesterCompany">
              ${departmentOptions("", departments)}
            </select>
          </label>
          <label>Lokasyon
            <select name="requesterLocation">
              ${locationOptions()}
            </select>
          </label>
          <label>Öncelik
            <select name="priority">
              ${priorities
                .map(
                  (priority) =>
                    `<option value="${priority}" ${selected(priority, "normal")}>${PRIORITY_LABELS[priority]}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="wide">Konu Başlığı
            <input name="title" maxlength="120" required>
          </label>
          <label class="wide">Açıklama
            <textarea name="description" rows="8" required></textarea>
          </label>
          <label class="wide file-drop">Ek dosya
            <input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
            <span>Ekran görüntüsü, PDF, Word, Excel veya metin dosyası ekleyebilirsiniz. En fazla 5 dosya, dosya başına 10 MB.</span>
          </label>
          <button type="submit">Talebi oluştur</button>
        </form>
      </section>`
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(mime) {
  if (mime.startsWith("image/")) return "🖼";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word")) return "📝";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "📊";
  return "📎";
}

function attachmentList(attachments, ticketId) {
  if (!attachments || !attachments.length) return "";
  return `<section class="panel attach-panel">
    <h2>Ekler <span class="attach-count">${attachments.length}</span></h2>
    <ul class="attach-list">
      ${attachments.map((a) => `
        <li class="attach-item">
          <span class="attach-icon">${attachmentIcon(a.mime_type)}</span>
          <span class="attach-info">
            <a href="/tickets/${ticketId}/attachments/${a.id}" class="attach-name">${escapeHtml(a.original_name)}</a>
            <span class="attach-meta">${formatBytes(a.size)} · ${formatDate(a.created_at)}</span>
          </span>
        </li>`).join("")}
    </ul>
  </section>`;
}

function quickRepliesPage(req, { quickReplies }) {
  return layout(req, {
    title: "Hazır Yanıtlar",
    actions: "",
    body: `
      <section class="panel narrow">
        <h2>Yeni hazır yanıt</h2>
        <form method="post" action="/admin/quick-replies/new" class="form-grid">
          ${csrfInput(req)}
          <label class="wide">Başlık (kısa, açıklayıcı)
            <input name="title" maxlength="80" required>
          </label>
          <label class="wide">Yanıt metni
            <textarea name="body" rows="5" required></textarea>
          </label>
          <button type="submit">Ekle</button>
        </form>
      </section>
      <section class="panel">
        <h2>Kayıtlı hazır yanıtlar</h2>
        ${quickReplies.length
          ? `<div class="qr-list">
              ${quickReplies.map((qr) => `
                <div class="qr-row">
                  <div class="qr-info">
                    <strong>${escapeHtml(qr.title)}</strong>
                    <p>${escapeHtml(qr.body)}</p>
                  </div>
                  <form method="post" action="/admin/quick-replies/${qr.id}/delete">
                    ${csrfInput(req)}
                    <button type="submit" class="button danger-btn" onclick="return confirm('Silinsin mi?')">Sil</button>
                  </form>
                </div>`).join("")}
            </div>`
          : `<div class="empty">Henüz hazır yanıt yok.</div>`}
      </section>`
  });
}

function ticketDetailPage(req, { ticket, comments, statuses, priorities, attachments, quickReplies, auditLogs = [], tags = [], allTags = [] }) {
  const canManage = req.currentUser.role === "admin";
  const canDelete = req.currentUser.role === "admin";
  const isClosed = ticket.status === "closed" || ticket.status === "resolved";
  // "closed" seçeneği dropdown'da gösterilmez; "resolved" kapatır
  const dropdownStatuses = statuses.filter((s) => s !== "closed");
  const followPath = publicTicketPath(ticket);
  const workHint = ticketStatusWorkHint(ticket);
  const ticketInfo = [
    { key: "name", label: "İsim Soyisim", value: ticket.requester_name },
    { key: "phone", label: "Telefon", value: ticket.requester_phone },
    { key: "email", label: "E-posta", value: ticket.requester_email },
    { key: "department", label: "Departman", value: ticket.requester_company },
    { key: "location", label: "Lokasyon", value: ticket.requester_location },
    { key: "created", label: "Oluşturulma", value: formatDate(ticket.created_at) }
  ];

  return layout(req, {
    title: `${ticketNumber(ticket)} — ${escapeHtml(ticket.title)}`,
    pageClass: "ticket-detail-page",
    actions: `<a class="button secondary" href="/tickets">Listeye dön</a>`,
    body: `
      ${ticketWorkflowPanel(ticket)}
      <section class="ticket-detail-shell">
        <div class="ticket-detail-main">
          <article class="panel ticket-hero">
            <div class="ticket-hero-top">
              <div>
                <span class="ticket-no-badge">${escapeHtml(ticketNumber(ticket))}</span>
                <h2>${escapeHtml(ticket.title)}</h2>
                <p>${escapeHtml(ticket.requester_name || "Talep sahibi belirtilmedi")} · ${formatDate(ticket.created_at)}</p>
              </div>
              <div class="ticket-pills">
                <span class="pill status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
                <span class="pill priority-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>
              </div>
            </div>
            <div class="ticket-context-row">
              <div>
                <span>Mevcut durum</span>
                <strong>${escapeHtml(STATUS_LABELS[ticket.status] || ticket.status)}</strong>
              </div>
              <div>
                <span>Sıradaki işlem</span>
                <strong>${escapeHtml(workHint)}</strong>
              </div>
            </div>
            <div class="ticket-description-block">
              <span>Talep açıklaması</span>
              <p>${escapeHtml(ticket.description)}</p>
            </div>
            <dl class="ticket-meta-grid">
              ${ticketInfo.map((item) => `
                <div class="ticket-meta-item ticket-meta-${escapeHtml(item.key)}">
                  <dt>${escapeHtml(item.label)}</dt>
                  <dd>${detailContactValue(item)}</dd>
                </div>`).join("")}
            </dl>
            ${attachments && attachments.length ? attachmentList(attachments, ticket.id) : ""}
          </article>
          ${chatPanel(req, {
            action: `/tickets/${ticket.id}/comment`,
            allowAttachment: true,
            canReply: !isClosed,
            comments,
            includeInternalOption: canManage,
            lockedText: "Bu talep çözüldü ve kapatıldı. Yeni mesaj eklenemez.",
            quickReplies: quickReplies || [],
            refreshPath: `/tickets/${ticket.id}/messages`,
            ticket,
            viewer: "admin"
          })}
        </div>

        <aside class="ticket-detail-side">
          ${
            canManage
              ? `<section class="panel manage-panel operation-panel">
                  <div class="manage-head">
                    <span>İşlem Merkezi</span>
                    <h2>Talebi yönet</h2>
                    <p>Durum ve önceliği buradan güncelle. Çözüldü seçildiğinde çözüm açıklaması kullanıcıya giden kapanış mailine eklenir.</p>
                  </div>
                  <div class="manage-status-card status-${ticket.status}">
                    <span>Mevcut durum</span>
                    <strong>${escapeHtml(STATUS_LABELS[ticket.status] || ticket.status)}</strong>
                    <p>${escapeHtml(workHint)}</p>
                  </div>
                  ${
                    isClosed
                      ? `<p class="locked-note">Bu talep çözüldü ve kapatıldı. Tekrar açılamaz.</p>`
                      : `<form method="post" action="/tickets/${ticket.id}/update" class="form-grid manage-form" data-resolution-form>
                          ${csrfInput(req)}
                          <label>Durum
                            <select name="status" data-status-select>
                              ${dropdownStatuses
                                .map(
                                  (status) =>
                                    `<option value="${status}" ${selected(status, ticket.status)}>${STATUS_LABELS[status]}</option>`
                                )
                                .join("")}
                            </select>
                          </label>
                          <label>Öncelik
                            <select name="priority">
                              ${priorities
                                .map(
                                  (priority) =>
                                    `<option value="${priority}" ${selected(priority, ticket.priority)}>${PRIORITY_LABELS[priority]}</option>`
                                )
                                .join("")}
                            </select>
                          </label>
                          <label class="wide solution-note-field resolution-card" data-resolution-field>
                            <span>Çözüm açıklaması</span>
                            <textarea name="resolutionNote" rows="5" maxlength="2000" data-resolution-note placeholder="Yapılan işlemi kısa ve net şekilde yazın. Ör: Yazıcı sürücüsü yeniden kuruldu, ağ bağlantısı test edildi ve test çıktısı alındı."></textarea>
                            <small class="field-hint">Bu not hem talep yazışmasına eklenir hem de kullanıcıya giden çözüm mailinde görünür.</small>
                          </label>
                          <button type="submit">İşlemi Kaydet</button>
                        </form>`
                  }
                  <div class="manage-footer-actions">
                    ${
                      followPath
                        ? `<a class="button secondary" href="${escapeHtml(followPath)}">Kullanıcı ekranını aç</a>`
                        : ""
                    }
                    ${
                      canDelete
                        ? `<form method="post" action="/tickets/${ticket.id}/delete" class="manage-delete-form">
                            ${csrfInput(req)}
                            <button type="submit" class="button danger-btn" onclick="return confirm('${escapeHtml(ticketNumber(ticket))} kalıcı olarak silinsin mi?')">Talebi Sil</button>
                          </form>`
                        : ""
                    }
                  </div>
                </section>`
              : ""
          }

          ${
            !canManage && followPath
              ? `<section class="panel follow-panel">
                  <span class="mini-eyebrow">Kullanıcı Takibi</span>
                  <h2>Kullanıcı ekranı</h2>
                  <p>Talep sahibi bu bağlantıdan durumunu görür ve destek ekibiyle yazışmaya devam eder.</p>
                  <a class="button secondary" href="${escapeHtml(followPath)}">Takip ekranını aç</a>
                  <code>${escapeHtml(followPath)}</code>
                </section>`
              : ""
          }

          ${canManage && allTags.length > 0 ? `
            <section class="panel tag-panel">
              <h2>Etiketler</h2>
              <form method="post" action="/tickets/${ticket.id}/tags" class="tag-form">
                ${csrfInput(req)}
                <div class="tag-checkboxes">
                  ${allTags.map((t) => `
                    <label class="tag-check-label">
                      <input type="checkbox" name="tagIds" value="${t.id}" ${tags.some((tt) => tt.id === t.id) ? "checked" : ""}>
                      <span class="tag-chip" style="background:${escapeHtml(t.color)}20;color:${escapeHtml(t.color)};border-color:${escapeHtml(t.color)}40">${escapeHtml(t.name)}</span>
                    </label>`).join("")}
                </div>
                <button type="submit" class="button secondary tiny-btn">Kaydet</button>
              </form>
            </section>` : tags.length > 0 ? `
            <section class="panel tag-panel">
              <h2>Etiketler</h2>
              <div class="tag-chips">
                ${tags.map((t) => `<span class="tag-chip" style="background:${escapeHtml(t.color)}20;color:${escapeHtml(t.color)};border-color:${escapeHtml(t.color)}40">${escapeHtml(t.name)}</span>`).join("")}
              </div>
            </section>` : ""}
        </aside>
      </section>`
  });
}

function auditLogPanel(logs = []) {
  const ACTION_LABELS = {
    created:          { icon: "🆕", label: "Talep oluşturuldu" },
    status_changed:   { icon: "🔄", label: "Durum değiştirildi" },
    priority_changed: { icon: "⚡", label: "Öncelik değiştirildi" },
    assignee_changed: { icon: "👤", label: "Atama değiştirildi" },
    comment_added:    { icon: "💬", label: "Yorum eklendi" },
    internal_note:    { icon: "🔒", label: "İç not eklendi" },
    resolved:         { icon: "✅", label: "Talep çözüldü" },
    rated:            { icon: "⭐", label: "Değerlendirme yapıldı" }
  };

  const STATUS_TR  = { open: "Açık", in_progress: "İşleme Alındı", waiting: "Beklemede", resolved: "Çözüldü", closed: "Çözüldü" };
  const PRIORITY_TR = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };

  function renderChange(log) {
    if (log.action === "status_changed") {
      return `<span class="audit-change">${STATUS_TR[log.old_value] || log.old_value} → ${STATUS_TR[log.new_value] || log.new_value}</span>`;
    }
    if (log.action === "priority_changed") {
      return `<span class="audit-change">${PRIORITY_TR[log.old_value] || log.old_value} → ${PRIORITY_TR[log.new_value] || log.new_value}</span>`;
    }
    if (log.action === "assignee_changed") {
      const from = log.old_value || "—";
      const to   = log.new_value || "—";
      return `<span class="audit-change">${escapeHtml(from)} → ${escapeHtml(to)}</span>`;
    }
    return "";
  }

  const rows = logs.map((log) => {
    const def = ACTION_LABELS[log.action] || { icon: "•", label: log.action };
    return `<li class="audit-row">
      <span class="audit-icon">${def.icon}</span>
      <span class="audit-body">
        <span class="audit-label">${def.label}</span>${renderChange(log)}
        <span class="audit-meta">${escapeHtml(log.user_name)} · ${formatDate(log.created_at)}</span>
      </span>
    </li>`;
  });

  return `<section class="panel audit-panel">
    <details ${logs.length <= 5 ? "open" : ""}>
      <summary><h2>Denetim İzi <span class="audit-count">${logs.length}</span></h2></summary>
      ${logs.length
        ? `<ul class="audit-list">${rows.join("")}</ul>`
        : `<p class="audit-empty">Henüz kayıt yok.</p>`}
    </details>
  </section>`;
}

function settingsPage(req, { settings, backups = [], systemStatus = null, backupRetentionLimit = 14, departments = [] }) {
  const s = settings || {};
  const testIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
  const backupRows = backups.length
    ? backups.map((backup) => `<div class="backup-item">
        <div>
          <strong>${escapeHtml(backup.name)}</strong>
          <span>${escapeHtml(new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(backup.createdAt)))}</span>
        </div>
        <div class="backup-actions">
          <em>${formatBytes(backup.size)}</em>
          <a class="button secondary tiny-btn" href="/admin/settings/backups/${encodeURIComponent(backup.name)}/download">İndir</a>
        </div>
      </div>`).join("")
    : `<div class="empty">Henüz yedek alınmamış.</div>`;
  const departmentRows = departments.length
    ? departments.map((department) => `
        <div class="department-row">
          <form method="post" action="/admin/departments/${department.id}/update" class="department-update-form">
            ${csrfInput(req)}
            <input name="name" value="${escapeHtml(department.name)}" maxlength="80" required>
            <button type="submit" class="button secondary tiny-btn">Kaydet</button>
          </form>
          <form method="post" action="/admin/departments/${department.id}/delete">
            ${csrfInput(req)}
            <button type="submit" class="button danger-btn tiny-btn" onclick="return confirm('${escapeHtml(department.name)} departmanı silinsin mi? Eski taleplerdeki departman bilgisi korunur.')">Sil</button>
          </form>
        </div>`).join("")
    : `<div class="empty">Henüz departman eklenmemiş.</div>`;

  return layout(req, {
    title: "Sistem Ayarları",
    body: `
      <form method="post" action="/admin/settings" class="settings-form">
        ${csrfInput(req)}

        ${systemStatusPanel(systemStatus)}

        <!-- ── Genel ───────────────────────────────────────────── -->
        <section class="panel settings-section">
          <h2>Genel Ayarlar</h2>
          <div class="form-grid">
            <label>Uygulama Adı
              <input name="app_name" value="${escapeHtml(s.app_name || "")}" placeholder="KL YAPI ÇELİK İMALAT VE TİCARET A.Ş. IT TALEP TAKİP SİSTEMİ">
            </label>
            <label>Uygulama URL <small>(e-postalarda kullanılır)</small>
              <input name="app_url" type="url" value="${escapeHtml(s.app_url || "")}" placeholder="https://destek.klyapi.com">
            </label>
            <label>Destek Telefon
              <input name="support_phone" value="${escapeHtml(s.support_phone || "")}" placeholder="0212 000 00 00">
            </label>
            <label>Destek E-posta
              <input name="support_email" type="email" value="${escapeHtml(s.support_email || "")}" placeholder="it@klyapi.com">
            </label>
            <label>Günlük Maksimum Talep <small>(kullanıcı başına, 0=sınırsız)</small>
              <input name="max_tickets_per_day" type="number" min="0" value="${escapeHtml(s.max_tickets_per_day || "0")}">
            </label>
          </div>
        </section>

        <!-- ── SLA Süreleri ────────────────────────────────────── -->
        <section class="panel settings-section">
          <h2>SLA Süreleri</h2>
          <p class="settings-hint">Önceliğe göre maksimum yanıt süresi (saat). Bu eşik aşılınca talep listesinde uyarı gösterilir.</p>
          <div class="form-grid sla-grid">
            <label class="sla-field sla-urgent">Acil <small>(saat)</small>
              <input name="sla_urgent" type="number" min="1" value="${escapeHtml(s.sla_urgent || "2")}">
            </label>
            <label class="sla-field sla-high">Yüksek <small>(saat)</small>
              <input name="sla_high" type="number" min="1" value="${escapeHtml(s.sla_high || "8")}">
            </label>
            <label class="sla-field sla-normal">Normal <small>(saat)</small>
              <input name="sla_normal" type="number" min="1" value="${escapeHtml(s.sla_normal || "24")}">
            </label>
            <label class="sla-field sla-low">Düşük <small>(saat)</small>
              <input name="sla_low" type="number" min="1" value="${escapeHtml(s.sla_low || "72")}">
            </label>
          </div>
        </section>

        <!-- ── Bildirimler ─────────────────────────────────────── -->
        <section class="panel settings-section">
          <h2>Bildirim Ayarları</h2>
          <div class="form-grid">
            <label class="checkbox-label">
              <input type="checkbox" name="notification_sound" value="1" ${s.notification_sound === "1" ? "checked" : ""}>
              Yeni mesaj geldiğinde ses çal
            </label>
            <label>Çalışma Saati Başlangıç
              <input name="work_hours_start" type="time" value="${escapeHtml(s.work_hours_start || "08:00")}">
            </label>
            <label>Çalışma Saati Bitiş
              <input name="work_hours_end" type="time" value="${escapeHtml(s.work_hours_end || "18:00")}">
            </label>
          </div>
        </section>

        <!-- ── SMTP ───────────────────────────────────────────── -->
        <section class="panel settings-section">
          <h2>E-posta (SMTP)</h2>
          <p class="settings-hint">Boş bırakılırsa e-posta gönderilmez.</p>
          <div class="form-grid">
            <label>SMTP Sunucu
              <input name="smtp_host" value="${escapeHtml(s.smtp_host || "")}" placeholder="smtp.gmail.com">
            </label>
            <label>Port
              <input name="smtp_port" type="number" value="${escapeHtml(s.smtp_port || "587")}" placeholder="587">
            </label>
            <label>SSL/TLS
              <select name="smtp_secure">
                <option value="false" ${s.smtp_secure !== "true" ? "selected" : ""}>STARTTLS (Port 587)</option>
                <option value="true" ${s.smtp_secure === "true" ? "selected" : ""}>SSL/TLS (Port 465)</option>
              </select>
            </label>
            <label>Kullanıcı Adı
              <input name="smtp_user" type="email" value="${escapeHtml(s.smtp_user || "")}" placeholder="it@klyapi.com" autocomplete="off">
            </label>
            <label>Şifre / Uygulama Şifresi
              <input name="smtp_pass" type="password" value="${s.smtp_pass ? "••••••••" : ""}" placeholder="Değiştirmek için girin" autocomplete="new-password" data-smtp-pass>
            </label>
            <label>Gönderen Adres
              <input name="mail_from" value="${escapeHtml(s.mail_from || "")}" placeholder='IT Destek &lt;it@klyapi.com&gt;'>
            </label>
            <label class="wide">Admin Bildirim E-postası
              <input name="admin_email" type="email" value="${escapeHtml(s.admin_email || "")}" placeholder="ahmet@klyapi.com">
            </label>
          </div>
          <div class="settings-test-row">
            <button type="button" class="button secondary" id="test-smtp-btn">
              ${testIcon} Bağlantıyı Test Et
            </button>
            <span id="test-smtp-result" class="test-result" hidden></span>
          </div>
        </section>

        <div class="settings-actions">
          <button type="submit" class="button">Tüm Ayarları Kaydet</button>
          <a href="/admin/categories" class="button secondary">Kategorileri Düzenle →</a>
        </div>
      </form>

      <div class="settings-grid-extra">
        <section class="panel settings-section department-manager" id="departmanlar">
          <div class="section-title">
            <div>
              <h2>Departmanlar</h2>
              <p>Kullanıcı talep formundaki departman listesini buradan yönetin.</p>
            </div>
          </div>
          <form method="post" action="/admin/departments/new" class="department-create-form">
            ${csrfInput(req)}
            <label class="sr-only" for="department-name">Departman adı</label>
            <input id="department-name" name="name" maxlength="80" placeholder="Yeni departman adı" required>
            <button type="submit" class="button">Departman Ekle</button>
          </form>
          <div class="department-list">${departmentRows}</div>
        </section>

        <section class="panel settings-section">
          <div class="section-title">
            <div>
              <h2>Yedekleme</h2>
              <p>Veritabanı günlük olarak otomatik yedeklenir. Gerektiğinde buradan manuel yedek de alabilirsiniz.</p>
            </div>
          </div>
          <form method="post" action="/admin/settings/backup" class="backup-action">
            ${csrfInput(req)}
            <button type="submit" class="button secondary">Şimdi Yedek Al</button>
          </form>
          <form method="post" action="/admin/settings/backups/cleanup" class="backup-action backup-maintenance">
            ${csrfInput(req)}
            <button type="submit" class="button secondary">Eski Yedekleri Temizle</button>
            <small>Son ${backupRetentionLimit} yedek saklanır.</small>
          </form>
          <div class="backup-list">${backupRows}</div>
        </section>

        <section class="panel settings-section">
          <div class="section-title">
            <div>
              <h2>Yönetici Şifresi</h2>
              <p>Panel hesabınızın şifresini buradan değiştirebilirsiniz.</p>
            </div>
          </div>
          <form method="post" action="/admin/profile/password" class="form-grid password-form">
            ${csrfInput(req)}
            <label>Mevcut Şifre
              <input name="currentPassword" type="password" autocomplete="current-password" required>
            </label>
            <label>Yeni Şifre
              <input name="newPassword" type="password" autocomplete="new-password" minlength="10" required>
            </label>
            <label>Yeni Şifre Tekrar
              <input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required>
            </label>
            <button type="submit">Şifreyi Güncelle</button>
          </form>
        </section>

        <section class="panel settings-section" id="iki-faktor">
          <div class="section-title">
            <div>
              <h2>İki Adımlı Doğrulama (2FA)</h2>
              <p>Giriş yapılırken ek doğrulama kodu istenerek hesap güvenliği artırılır.</p>
            </div>
            ${req.currentUser?.totp_enabled
              ? `<span class="pill status-in_progress">Aktif</span>`
              : `<span class="pill status-waiting">Kapalı</span>`}
          </div>
          ${req.currentUser?.totp_enabled
            ? `<p class="settings-hint">2FA aktif. Devre dışı bırakmak için mevcut şifrenizi girin.</p>
               <form method="post" action="/admin/profile/2fa/disable" class="form-grid">
                 ${csrfInput(req)}
                 <label>Mevcut Şifre
                   <input name="password" type="password" autocomplete="current-password" required>
                 </label>
                 <button type="submit" class="button danger-btn">2FA'yı Devre Dışı Bırak</button>
               </form>`
            : `<p class="settings-hint">Henüz etkinleştirilmemiş. Authenticator uygulaması ile kurabilirsiniz.</p>
               <a href="/admin/profile/2fa/setup" class="button secondary">2FA Kur →</a>`}
        </section>
      </div>
      <input type="hidden" id="smtp-csrf" value="${escapeHtml(req.session.csrfToken)}">`
  });
}

function categoriesPage(req, { categories }) {
  const PRESET_COLORS = ["#1d4ed8", "#7c3aed", "#0f766e", "#b45309", "#0369a1", "#166534", "#9f1239", "#64748b", "#c2410c", "#0891b2"];
  return layout(req, {
    title: "Kategoriler",
    body: `
      <section class="panel narrow">
        <h2>Yeni Kategori</h2>
        <form method="post" action="/admin/categories/new" class="form-grid">
          ${csrfInput(req)}
          <label>Kategori Adı
            <input name="name" maxlength="60" required placeholder="Ör: Güvenlik">
          </label>
          <label>Renk
            <div class="color-picker-row">
              <input type="color" name="color" value="#0f766e" class="color-input">
              <div class="color-presets">
                ${PRESET_COLORS.map((c) => `<button type="button" class="color-preset" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join("")}
              </div>
            </div>
          </label>
          <button type="submit">Ekle</button>
        </form>
      </section>
      <section class="panel">
        <h2>Mevcut Kategoriler</h2>
        ${categories.length
          ? `<div class="cat-list">
              ${categories.map((c) => `
                <div class="cat-row">
                  <span class="cat-dot" style="background:${escapeHtml(c.color)}"></span>
                  <strong>${escapeHtml(c.name)}</strong>
                  <form method="post" action="/admin/categories/${c.id}/delete" style="margin-left:auto">
                    ${csrfInput(req)}
                    <button type="submit" class="button danger-btn" onclick="return confirm('Silinsin mi?')">Sil</button>
                  </form>
                </div>`).join("")}
            </div>`
          : `<div class="empty">Kategori yok.</div>`}
      </section>
      `
  });
}

function reportsPage(req, { agents, categories, statuses, monthlyStats = [], categoryStats = [], resolutionByPriority = [] }) {
  const visibleStatuses = statuses.filter((s) => s !== "closed");

  // Aylık trend tablosu
  const monthlyTable = monthlyStats.length
    ? `<div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Ay</th><th>Yeni</th><th>Çözülen</th><th>Ort. Çözüm (sa)</th></tr></thead>
          <tbody>
            ${monthlyStats.map((row) => {
              const [y, m] = (row.ym || "").split("-");
              const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
              const label = y && m ? `${TR_MONTHS[parseInt(m,10)-1]} ${y}` : (row.ym || "");
              const avg = row.avg_resolution_hours !== null && row.avg_resolution_hours !== undefined
                ? Number(row.avg_resolution_hours).toFixed(1)
                : "—";
              return `<tr>
                <td>${escapeHtml(label)}</td>
                <td>${row.total}</td>
                <td>${row.resolved}</td>
                <td>${avg}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="empty">Henüz talep verisi yok.</div>`;

  // Kategori dağılımı
  const categoryTable = categoryStats.length
    ? `<div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Kategori</th><th>Talep</th><th>Çözülen</th><th>Ort. (sa)</th></tr></thead>
          <tbody>
            ${categoryStats.map((row) => {
              const avg = row.avg_resolution_hours !== null && row.avg_resolution_hours !== undefined
                ? Number(row.avg_resolution_hours).toFixed(1) : "—";
              return `<tr>
                <td>${escapeHtml(row.category || "Genel")}</td>
                <td>${row.total}</td>
                <td>${row.resolved}</td>
                <td>${avg}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="empty">Henüz talep verisi yok.</div>`;

  // Önceliğe göre çözüm
  const priorityTable = resolutionByPriority.length
    ? `<div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Öncelik</th><th>Toplam</th><th>Çözülen</th><th>Çözülme % </th><th>Ort. (sa)</th></tr></thead>
          <tbody>
            ${resolutionByPriority.map((row) => {
              const pct = row.total > 0 ? Math.round((row.resolved / row.total) * 100) : 0;
              const avg = row.avg_resolution_hours !== null && row.avg_resolution_hours !== undefined
                ? Number(row.avg_resolution_hours).toFixed(1) : "—";
              return `<tr>
                <td><span class="pill priority-${row.priority}">${PRIORITY_LABELS[row.priority] || row.priority}</span></td>
                <td>${row.total}</td>
                <td>${row.resolved}</td>
                <td>${pct}%</td>
                <td>${avg}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="empty">Henüz talep verisi yok.</div>`;

  return layout(req, {
    title: "Raporlar",
    body: `
      <div class="reports-grid">
        <section class="panel report-stats-section">
          <h2>Aylık Trend (Son 12 Ay)</h2>
          ${monthlyTable}
        </section>

        <section class="panel report-stats-section">
          <h2>Kategori Dağılımı</h2>
          ${categoryTable}
        </section>

        <section class="panel report-stats-section">
          <h2>Önceliğe Göre Çözüm</h2>
          ${priorityTable}
        </section>
      </div>

      <section class="panel">
        <h2>Excel / CSV Dışa Aktarma</h2>
        <p class="settings-hint">Filtreleri seçerek destek taleplerini Excel uyumlu rapor dosyası olarak indirin.</p>
        <form method="get" action="/admin/reports/export.csv" class="form-grid">
          <label>Durum
            <select name="status">
              <option value="">Tümü</option>
              ${visibleStatuses.map((s) => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join("")}
            </select>
          </label>
          <label>Kategori
            <select name="category">
              <option value="">Tümü</option>
              ${categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <label>Sorumlu
            <select name="assignee">
              <option value="">Hepsi</option>
              ${agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}
            </select>
          </label>
          <label>Arama
            <input name="q" placeholder="Konu başlığı veya açıklama">
          </label>
          <button type="submit" class="button">CSV İndir</button>
        </form>
      </section>

      <section class="panel">
        <h2>Hızlı Dışa Aktarma</h2>
        <div class="quick-reports">
          <a class="report-card" href="/admin/reports/export.csv">
            <span class="report-icon">R</span>
            <strong>Tüm Talepler</strong>
            <small>Filtresiz tam liste</small>
          </a>
          <a class="report-card" href="/admin/reports/export.csv?status=open">
            <span class="report-icon">A</span>
            <strong>Açık Talepler</strong>
            <small>Yanıt bekleyenler</small>
          </a>
          <a class="report-card" href="/admin/reports/export.csv?status=resolved">
            <span class="report-icon">Ç</span>
            <strong>Çözülen Talepler</strong>
            <small>Tamamlanan kayıtlar</small>
          </a>
          <a class="report-card" href="/admin/reports/export.csv?status=in_progress">
            <span class="report-icon">S</span>
            <strong>İşlemdeki Talepler</strong>
            <small>Üzerinde çalışılan kayıtlar</small>
          </a>
        </div>
      </section>`
  });
}

function tagsPage(req, { tags }) {
  const PRESET_COLORS = ["#1d4ed8","#7c3aed","#0f766e","#b45309","#0369a1","#166534","#9f1239","#64748b","#c2410c","#0891b2","#be185d","#047857"];
  return layout(req, {
    title: "Etiketler",
    body: `
      <section class="panel narrow">
        <h2>Yeni Etiket</h2>
        <form method="post" action="/admin/tags/new" class="form-grid">
          ${csrfInput(req)}
          <label>Etiket Adı
            <input name="name" maxlength="40" required placeholder="Ör: Kritik, Yazıcı Sorunu">
          </label>
          <label>Renk
            <div class="color-picker-row">
              <input type="color" name="color" value="#64748b" class="color-input">
              <div class="color-presets">
                ${PRESET_COLORS.map((c) => `<button type="button" class="color-preset" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join("")}
              </div>
            </div>
          </label>
          <button type="submit">Ekle</button>
        </form>
      </section>
      <section class="panel">
        <h2>Mevcut Etiketler</h2>
        ${tags.length
          ? `<div class="cat-list">
              ${tags.map((t) => `
                <div class="cat-row">
                  <span class="cat-dot" style="background:${escapeHtml(t.color)}"></span>
                  <strong>${escapeHtml(t.name)}</strong>
                  <form method="post" action="/admin/tags/${t.id}/delete" style="margin-left:auto">
                    ${csrfInput(req)}
                    <button type="submit" class="button danger-btn" onclick="return confirm('Silinsin mi?')">Sil</button>
                  </form>
                </div>`).join("")}
            </div>`
          : `<div class="empty">Henüz etiket eklenmemiş.</div>`}
      </section>`
  });
}

function webhooksPage(req, { webhooks }) {
  const WEBHOOK_EVENTS = [
    { key: "ticket.created", label: "Talep oluşturuldu" },
    { key: "ticket.updated", label: "Talep güncellendi" },
    { key: "ticket.resolved", label: "Talep çözüldü" },
    { key: "comment.added",  label: "Yorum eklendi" }
  ];
  return layout(req, {
    title: "Webhooks",
    body: `
      <section class="panel">
        <h2>Yeni Webhook</h2>
        <p class="settings-hint">Belirtilen olaylar gerçekleştiğinde sisteminize HTTP POST isteği gönderilir.
          Gizli anahtar varsa istek <code>X-KLY-Signature</code> başlığında HMAC-SHA256 imzası taşır.</p>
        <form method="post" action="/admin/webhooks/new" class="form-grid">
          ${csrfInput(req)}
          <label class="wide">Hedef URL
            <input name="url" type="url" required placeholder="https://hooks.example.com/klyapi">
          </label>
          <label class="wide">Gizli Anahtar <small>(opsiyonel)</small>
            <input name="secret" placeholder="Boş bırakılabilir" autocomplete="off">
          </label>
          <fieldset class="wide webhook-events-fieldset">
            <legend>Tetiklenecek Olaylar</legend>
            <div class="webhook-events-list">
              ${WEBHOOK_EVENTS.map((e) => `
                <label class="checkbox-label">
                  <input type="checkbox" name="events" value="${e.key}" checked>
                  <code>${e.key}</code> — ${escapeHtml(e.label)}
                </label>`).join("")}
            </div>
          </fieldset>
          <button type="submit">Webhook Ekle</button>
        </form>
      </section>
      <section class="panel">
        <h2>Kayıtlı Webhooklar</h2>
        ${webhooks.length
          ? `<div class="webhook-list">
              ${webhooks.map((h) => {
                const events = JSON.parse(h.events || "[]");
                return `<div class="webhook-row">
                  <div class="webhook-info">
                    <strong class="webhook-url">${escapeHtml(h.url)}</strong>
                    <div class="webhook-event-badges">
                      ${events.map((e) => `<code class="event-badge">${escapeHtml(e)}</code>`).join("")}
                    </div>
                  </div>
                  <div class="webhook-actions">
                    <span class="pill ${h.active ? "status-in_progress" : "status-waiting"}">${h.active ? "Aktif" : "Pasif"}</span>
                    <form method="post" action="/admin/webhooks/${h.id}/toggle">
                      ${csrfInput(req)}
                      <button type="submit" class="button secondary tiny-btn">${h.active ? "Devre Dışı" : "Etkinleştir"}</button>
                    </form>
                    <form method="post" action="/admin/webhooks/${h.id}/delete">
                      ${csrfInput(req)}
                      <button type="submit" class="button danger-btn tiny-btn" onclick="return confirm('Silinsin mi?')">Sil</button>
                    </form>
                  </div>
                </div>`;
              }).join("")}
            </div>`
          : `<div class="empty">Henüz webhook eklenmemiş.</div>`}
      </section>`
  });
}

function usersPage(req, { users }) {
  const visibleUsers = users.filter((u) => u.email !== "web-form@local.invalid");
  return layout(req, {
    title: "Ekip Yönetimi",
    actions: `<a class="button" href="/admin/users/new">Ekip üyesi ekle</a>`,
    body: `
      <section class="panel">
        <div class="section-title">
          <h2>Ekip üyeleri</h2>
        </div>
        ${
          visibleUsers.length
            ? `<div class="user-list">
                ${visibleUsers
                  .map(
                    (u) => `
                    <div class="user-row">
                      <span>
                        <strong>${escapeHtml(u.name)}</strong>
                        <small>${escapeHtml(u.email)}</small>
                      </span>
                      <span><span class="pill">${ROLE_LABELS[u.role] || u.role}</span></span>
                      <span class="muted-text">${escapeHtml(u.department || "—")}</span>
                      ${
                        u.id !== req.currentUser.id
                          ? `<form method="post" action="/admin/users/${u.id}/delete">
                              ${csrfInput(req)}
                              <button type="submit" class="button danger-btn" onclick="return confirm('${escapeHtml(u.name)} ekipten çıkarılsın mı?')">Çıkar</button>
                            </form>`
                          : `<span class="muted-text">Sen</span>`
                      }
                    </div>`
                  )
                  .join("")}
              </div>`
            : `<div class="empty">Henüz ekip üyesi yok.</div>`
        }
      </section>`
  });
}

function newUserPage(req) {
  return layout(req, {
    title: "Ekip Üyesi Ekle",
    body: `
      <section class="panel narrow">
        <h2>Yeni ekip üyesi</h2>
        <form method="post" action="/admin/users/new" class="form-grid">
          ${csrfInput(req)}
          <label>Ad Soyad
            <input name="name" autocomplete="off" required>
          </label>
          <label>E-posta
            <input name="email" type="email" autocomplete="off" required>
          </label>
          <label>Şifre
            <input name="password" type="password" autocomplete="new-password" minlength="10" required>
          </label>
          <label>Rol
            <select name="role">
              <option value="admin">Yönetici</option>
            </select>
          </label>
          <label>Departman
            <input name="department" value="IT">
          </label>
          <button type="submit">Ekle</button>
        </form>
      </section>`
  });
}

function errorPage(req, { title, message }) {
  return layout(req, {
    title,
    body: `<section class="panel narrow"><p>${escapeHtml(message)}</p><a class="button" href="/dashboard">Panele dön</a></section>`
  });
}

module.exports = {
  categoriesPage,
  chatMessagesFragment,
  dashboardPage,
  errorPage,
  loginPage,
  newTicketPage,
  newUserPage,
  publicTicketChatPage,
  publicTicketPage,
  publicTicketSuccessPage,
  quickRepliesPage,
  reportsPage,
  settingsPage,
  setupPage,
  tagsPage,
  ticketDetailPage,
  ticketSearchPage,
  ticketsPage,
  totpSetupPage,
  totpVerifyPage,
  usersPage,
  webhooksPage
};
