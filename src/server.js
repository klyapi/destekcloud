"use strict";
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { db, getSetting, setSetting, getAllSettings, genTicketNo, genToken } = require("./db");
const { sendMail } = require("./mailer");
const views = require("./views");

const app = express();
const PORT = process.env.PORT || 3000;

// ── UPLOADS ──────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── MIDDLEWARE ────────────────────────────────────────────────
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const SQLiteStore = require("./session-store")(session);
app.use(session({
  store: new SQLiteStore(),
  secret: process.env.SESSION_SECRET || "kl-yapi-destek-secret-2026",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── APP LOCALS ────────────────────────────────────────────────
app.use((req, res, next) => {
  app.locals.appName = getSetting("app_name") || "KL Yapı IT Destek";
  next();
});

// ── CSRF ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  next();
});

// ── RATE LIMIT ────────────────────────────────────────────────
function rateLimit(key, max, windowMs) {
  const now = new Date();
  const row = db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
  if (row) {
    const windowStart = new Date(row.window_start);
    if (now - windowStart > windowMs) {
      db.prepare("UPDATE rate_limits SET count=1, window_start=? WHERE key=?").run(now.toISOString(), key);
      return false;
    }
    if (row.count >= max) return true;
    db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").run(key);
    return false;
  }
  db.prepare("INSERT INTO rate_limits(key,count,window_start) VALUES(?,1,?)").run(key, now.toISOString());
  return false;
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect("/login");
  const user = db.prepare("SELECT * FROM users WHERE id=? AND is_active=1").get(req.session.userId);
  if (!user) { req.session.destroy(); return res.redirect("/login"); }
  req.currentUser = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.currentUser.role !== "admin") return res.status(403).send("Yetkisiz");
    next();
  });
}

// ── FLASH ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.flash = (type, msg) => { req.session.flash = { type, msg }; };
  req.getFlash = () => { const f = req.session.flash || null; req.session.flash = null; return f; };
  next();
});

// ── ROUTES: AUTH ──────────────────────────────────────────────
app.get("/", (req, res) => res.redirect(req.session.userId ? "/dashboard" : "/talep"));

app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/dashboard");
  res.send(views.loginPage(req));
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip;
  if (rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    req.flash("error", "Çok fazla deneme. Lütfen bekleyin.");
    return res.redirect("/login");
  }
  const user = db.prepare("SELECT * FROM users WHERE email=? AND is_active=1").get(email?.trim());
  const bcrypt = require("bcryptjs");
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.flash("error", "E-posta veya şifre hatalı.");
    return res.redirect("/login");
  }
  req.session.userId = user.id;
  req.session.regenerate((err) => {
    if (err) return res.redirect("/login");
    req.session.userId = user.id;
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
    res.redirect("/dashboard");
  });
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ── ROUTES: SETUP ─────────────────────────────────────────────
app.get("/setup", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c;
  if (count > 0) return res.redirect("/login");
  res.send(views.setupPage(req));
});

app.post("/setup", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c;
  if (count > 0) return res.redirect("/login");
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    req.flash("error", "Tüm alanları doldurun. Şifre en az 8 karakter olmalı.");
    return res.redirect("/setup");
  }
  const bcrypt = require("bcryptjs");
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run(name, email, hash);
  req.flash("success", "Hesap oluşturuldu. Giriş yapın.");
  res.redirect("/login");
});

// ── ROUTES: DASHBOARD ─────────────────────────────────────────
app.get("/dashboard", requireAuth, (req, res) => {
  const stats = {
    total: db.prepare("SELECT COUNT(*) as c FROM tickets").get().c,
    active: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status NOT IN ('resolved','closed')").get().c,
    urgent: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority='urgent' AND status NOT IN ('resolved','closed')").get().c,
    done: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('resolved','closed')").get().c,
  };
  const tickets = db.prepare("SELECT t.*, c.name as cat_name, c.color as cat_color, u.name as assignee_name FROM tickets t LEFT JOIN categories c ON t.category_id=c.id LEFT JOIN users u ON t.assigned_to=u.id ORDER BY t.created_at DESC LIMIT 15").all();
  const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status").all();
  const byDay = db.prepare("SELECT DATE(created_at) as day, COUNT(*) as count FROM tickets WHERE created_at >= datetime('now', '-7 days') GROUP BY day ORDER BY day").all();
  const avgHours = db.prepare("SELECT AVG((julianday(resolved_at)-julianday(created_at))*24) as h FROM tickets WHERE resolved_at IS NOT NULL").get().h;
  const avgRating = db.prepare("SELECT AVG(rating) as r FROM tickets WHERE rating IS NOT NULL").get().r;
  const chartStats = { byStatus, byDay, avgHours, avgRating };
  const systemStatus = {
    email: getSetting("smtp_host") ? "ok" : "warn",
    storage: "ok",
    db: "ok",
  };
  res.send(views.dashboardPage(req, { stats, tickets, chartStats, systemStatus }));
});

// ── ROUTES: TICKETS ───────────────────────────────────────────
app.get("/tickets", requireAuth, (req, res) => {
  const { status, priority, category, q, assignee, page = 1 } = req.query;
  const PER_PAGE = 25;
  const offset = (parseInt(page) - 1) * PER_PAGE;
  let where = "1=1";
  const params = [];
  if (status) { where += " AND t.status=?"; params.push(status); }
  if (priority) { where += " AND t.priority=?"; params.push(priority); }
  if (category) { where += " AND t.category_id=?"; params.push(category); }
  if (assignee) { where += " AND t.assigned_to=?"; params.push(assignee); }
  if (q) { where += " AND (t.title LIKE ? OR t.ticket_no LIKE ? OR t.requester_name LIKE ? OR t.requester_email LIKE ?)"; params.push(...Array(4).fill(`%${q}%`)); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM tickets t WHERE ${where}`).get(...params).c;
  const tickets = db.prepare(`SELECT t.*, c.name as cat_name, c.color as cat_color, u.name as assignee_name FROM tickets t LEFT JOIN categories c ON t.category_id=c.id LEFT JOIN users u ON t.assigned_to=u.id WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).all(...params, PER_PAGE, offset);
  const categories = db.prepare("SELECT * FROM categories ORDER BY rank,name").all();
  const agents = db.prepare("SELECT * FROM users WHERE is_active=1 ORDER BY name").all();
  const statuses = ["open", "in_progress", "waiting", "resolved", "closed"];
  const months = db.prepare("SELECT DISTINCT strftime('%Y-%m', created_at) as month FROM tickets ORDER BY month DESC LIMIT 12").all().map(r => r.month);
  res.send(views.ticketsPage(req, { tickets, total, page: parseInt(page), perPage: PER_PAGE, categories, agents, statuses, months, filters: { status, priority, category, q, assignee } }));
});

app.get("/tickets/new", requireAuth, (req, res) => {
  const categories = db.prepare("SELECT * FROM categories ORDER BY rank,name").all();
  const agents = db.prepare("SELECT * FROM users WHERE is_active=1 ORDER BY name").all();
  const priorities = ["low", "normal", "high", "urgent"];
  res.send(views.newTicketPage(req, { categories, agents, priorities }));
});

app.post("/tickets/new", requireAuth, upload.array("files", 5), (req, res) => {
  const { title, description, priority, category_id, assigned_to, requester_name, requester_email, requester_phone, department, location } = req.body;
  if (!title) { req.flash("error", "Konu zorunludur."); return res.redirect("/tickets/new"); }
  const ticket_no = genTicketNo();
  const public_token = genToken();
  const ins = db.prepare("INSERT INTO tickets(ticket_no,title,description,priority,category_id,assigned_to,requester_name,requester_email,requester_phone,department,location,public_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  const result = ins.run(ticket_no, title, description || "", priority || "normal", category_id || null, assigned_to || null, requester_name || "", requester_email || "", requester_phone || "", department || "", location || "");
  const ticketId = result.lastInsertRowid;
  if (req.files?.length) {
    const insFile = db.prepare("INSERT INTO attachments(ticket_id,original_name,stored_name,mime_type,size) VALUES(?,?,?,?,?)");
    req.files.forEach(f => insFile.run(ticketId, f.originalname, f.filename, f.mimetype, f.size));
  }
  db.prepare("INSERT INTO audit_logs(ticket_id,user_id,action,detail) VALUES(?,?,?,?)").run(ticketId, req.currentUser.id, "created", `Talep oluşturuldu: ${ticket_no}`);
  req.flash("success", `Talep ${ticket_no} oluşturuldu.`);
  res.redirect(`/tickets/${ticketId}`);
});

app.get("/tickets/:id", requireAuth, (req, res) => {
  const ticket = db.prepare("SELECT t.*, c.name as cat_name, c.color as cat_color, u.name as assignee_name FROM tickets t LEFT JOIN categories c ON t.category_id=c.id LEFT JOIN users u ON t.assigned_to=u.id WHERE t.id=?").get(req.params.id);
  if (!ticket) return res.status(404).send(views.errorPage(req, { title: "Bulunamadı", message: "Talep bulunamadı" }));
  const comments = db.prepare("SELECT c.*, u.name as user_name, u.role as user_role FROM comments c LEFT JOIN users u ON c.user_id=u.id WHERE c.ticket_id=? ORDER BY c.created_at").all(ticket.id);
  const attachments = db.prepare("SELECT * FROM attachments WHERE ticket_id=?").all(ticket.id);
  const tags = db.prepare("SELECT t.* FROM tags t JOIN ticket_tags tt ON t.id=tt.tag_id WHERE tt.ticket_id=?").all(ticket.id);
  const allTags = db.prepare("SELECT * FROM tags ORDER BY rank,name").all();
  const categories = db.prepare("SELECT * FROM categories ORDER BY rank,name").all();
  const agents = db.prepare("SELECT * FROM users WHERE is_active=1 ORDER BY name").all();
  const quickReplies = db.prepare("SELECT * FROM quick_replies ORDER BY title").all();
  const auditLogs = db.prepare("SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id WHERE a.ticket_id=? ORDER BY a.created_at DESC LIMIT 20").all(ticket.id);
  const statuses = ["open", "in_progress", "waiting", "resolved", "closed"];
  const priorities = ["low", "normal", "high", "urgent"];
  res.send(views.ticketDetailPage(req, { ticket, comments, attachments, tags, allTags, categories, agents, quickReplies, auditLogs, statuses, priorities }));
});

app.post("/tickets/:id/comment", requireAuth, upload.array("files", 5), (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(req.params.id);
  if (!ticket) return res.status(404).send("Bulunamadı");
  const { body, is_internal } = req.body;
  if (!body?.trim()) { req.flash("error", "Yorum boş olamaz."); return res.redirect(`/tickets/${ticket.id}`); }
  const ins = db.prepare("INSERT INTO comments(ticket_id,user_id,body,is_internal,user_role) VALUES(?,?,?,?,?)");
  const result = ins.run(ticket.id, req.currentUser.id, body.trim(), is_internal ? 1 : 0, req.currentUser.role);
  const commentId = result.lastInsertRowid;
  if (req.files?.length) {
    const insFile = db.prepare("INSERT INTO attachments(ticket_id,comment_id,original_name,stored_name,mime_type,size) VALUES(?,?,?,?,?,?)");
    req.files.forEach(f => insFile.run(ticket.id, commentId, f.originalname, f.filename, f.mimetype, f.size));
  }
  db.prepare("UPDATE tickets SET updated_at=datetime('now') WHERE id=?").run(ticket.id);
  db.prepare("INSERT INTO audit_logs(ticket_id,user_id,action) VALUES(?,?,?)").run(ticket.id, req.currentUser.id, is_internal ? "internal_note" : "comment");
  res.redirect(`/tickets/${ticket.id}`);
});

app.post("/tickets/:id/update", requireAuth, (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(req.params.id);
  if (!ticket) return res.status(404).send("Bulunamadı");
  const { status, priority, assigned_to, category_id, solution_note } = req.body;
  const updates = [];
  const changes = [];
  if (status && status !== ticket.status) {
    updates.push(`status='${status}'`);
    changes.push(`Durum: ${ticket.status} → ${status}`);
    if (["resolved", "closed"].includes(status)) updates.push("resolved_at=datetime('now')");
  }
  if (priority && priority !== ticket.priority) { updates.push(`priority='${priority}'`); changes.push(`Öncelik: ${ticket.priority} → ${priority}`); }
  if (assigned_to !== undefined) { updates.push(`assigned_to=${assigned_to || "NULL"}`); }
  if (category_id !== undefined) { updates.push(`category_id=${category_id || "NULL"}`); }
  if (solution_note !== undefined) updates.push(`solution_note='${solution_note.replace(/'/g, "''")}'`);
  if (updates.length) {
    db.prepare(`UPDATE tickets SET ${updates.join(",")}, updated_at=datetime('now') WHERE id=?`).run(ticket.id);
    if (changes.length) db.prepare("INSERT INTO audit_logs(ticket_id,user_id,action,detail) VALUES(?,?,?,?)").run(ticket.id, req.currentUser.id, "updated", changes.join("; "));
  }
  req.flash("success", "Talep güncellendi.");
  res.redirect(`/tickets/${ticket.id}`);
});

app.post("/tickets/:id/tags", requireAuth, (req, res) => {
  const ticketId = req.params.id;
  const tagIds = [].concat(req.body.tag_ids || []).map(Number).filter(Boolean);
  db.prepare("DELETE FROM ticket_tags WHERE ticket_id=?").run(ticketId);
  const ins = db.prepare("INSERT OR IGNORE INTO ticket_tags(ticket_id,tag_id) VALUES(?,?)");
  tagIds.forEach(tid => ins.run(ticketId, tid));
  res.redirect(`/tickets/${ticketId}`);
});

app.post("/tickets/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM tickets WHERE id=?").run(req.params.id);
  req.flash("success", "Talep silindi.");
  res.redirect("/tickets");
});

// ── ROUTES: PUBLIC PORTAL ─────────────────────────────────────
app.get("/talep", (req, res) => {
  const lastToken = req.session.lastSubmittedToken;
  const lastTicket = lastToken ? db.prepare("SELECT * FROM tickets WHERE public_token=?").get(lastToken) : null;
  const categories = db.prepare("SELECT * FROM categories ORDER BY rank,name").all();
  const priorities = ["low", "normal", "high", "urgent"];
  res.send(views.publicTicketPage(req, { categories, lastTicket, priorities }));
});

app.post("/talep", upload.array("files", 5), (req, res) => {
  const ip = req.ip;
  const dailyLimit = parseInt(getSetting("daily_limit") || "10");
  if (rateLimit(`pub:${ip}`, dailyLimit, 24 * 60 * 60 * 1000)) {
    req.flash("error", "Günlük talep limitinize ulaştınız.");
    return res.redirect("/talep");
  }
  const { title, description, requester_name, requester_email, requester_phone, department, location, category_id, priority } = req.body;
  if (!title || !requester_name || !requester_email) {
    req.flash("error", "Konu, ad soyad ve e-posta zorunludur.");
    return res.redirect("/talep");
  }
  const ticket_no = genTicketNo();
  const public_token = genToken();
  const result = db.prepare("INSERT INTO tickets(ticket_no,title,description,priority,category_id,requester_name,requester_email,requester_phone,department,location,public_token) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(ticket_no, title, description || "", priority || "normal", category_id || null, requester_name, requester_email, requester_phone || "", department || "", location || "", public_token);
  const ticketId = result.lastInsertRowid;
  if (req.files?.length) {
    const insFile = db.prepare("INSERT INTO attachments(ticket_id,original_name,stored_name,mime_type,size) VALUES(?,?,?,?,?)");
    req.files.forEach(f => insFile.run(ticketId, f.originalname, f.filename, f.mimetype, f.size));
  }
  req.session.lastSubmittedToken = public_token;
  sendMail({ to: requester_email, subject: `Talebiniz alındı: ${ticket_no}`, text: `Sayın ${requester_name},\n\nTalebiniz alındı. Takip numaranız: ${ticket_no}\n\nTakip linki: ${getSetting("app_url")}/talep/${public_token}` }).catch(() => {});
  res.redirect(`/talep/tesekkurler?token=${public_token}`);
});

app.get("/talep/tesekkurler", (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE public_token=?").get(req.query.token);
  if (!ticket) return res.redirect("/talep");
  const followPath = `/talep/${ticket.public_token}`;
  res.send(views.publicTicketSuccessPage(req, { ticket, ticketNo: ticket.ticket_no, ticketId: ticket.id, followPath, attachments: [], comments: [], canReply: true }));
});

app.get("/talep/ara", (req, res) => {
  const { q, contact } = req.query;
  let tickets = [];
  const searched = !!(q || contact);
  if (searched) {
    tickets = db.prepare("SELECT * FROM tickets WHERE (ticket_no=? OR requester_email=?) ORDER BY created_at DESC LIMIT 10").all(q || "", contact || "");
  }
  res.send(views.ticketSearchPage(req, { q: q || "", contact: contact || "", searched, rateLimited: false }));
});

app.get("/talep/:token", (req, res) => {
  const ticket = db.prepare("SELECT t.*, c.name as cat_name FROM tickets t LEFT JOIN categories c ON t.category_id=c.id WHERE t.public_token=?").get(req.params.token);
  if (!ticket) return res.status(404).send(views.errorPage(req, { title: "Bulunamadı", message: "Talep bulunamadı" }));
  const comments = db.prepare("SELECT c.*, u.name as user_name FROM comments c LEFT JOIN users u ON c.user_id=u.id WHERE c.ticket_id=? AND c.is_internal=0 ORDER BY c.created_at").all(ticket.id);
  const attachments = db.prepare("SELECT * FROM attachments WHERE ticket_id=?").all(ticket.id);
  const canReply = !["resolved", "closed"].includes(ticket.status);
  const followPath = `/talep/${ticket.public_token}`;
  res.send(views.publicTicketChatPage(req, { ticket, comments, attachments, canReply, followPath }));
});

app.post("/talep/:token/reply", upload.array("files", 3), (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE public_token=?").get(req.params.token);
  if (!ticket || ["resolved", "closed"].includes(ticket.status)) return res.redirect(`/talep/${req.params.token}`);
  const { body } = req.body;
  if (!body?.trim()) return res.redirect(`/talep/${req.params.token}`);
  const result = db.prepare("INSERT INTO comments(ticket_id,body,is_internal,user_role) VALUES(?,?,0,'public')").run(ticket.id, body.trim());
  if (req.files?.length) {
    const insFile = db.prepare("INSERT INTO attachments(ticket_id,comment_id,original_name,stored_name,mime_type,size) VALUES(?,?,?,?,?,?)");
    req.files.forEach(f => insFile.run(ticket.id, result.lastInsertRowid, f.originalname, f.filename, f.mimetype, f.size));
  }
  db.prepare("UPDATE tickets SET updated_at=datetime('now'),status='waiting' WHERE id=? AND status='open'").run(ticket.id);
  res.redirect(`/talep/${req.params.token}`);
});

app.post("/talep/:token/close", (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE public_token=?").get(req.params.token);
  if (!ticket) return res.redirect("/talep");
  const { rating, rating_note } = req.body;
  db.prepare("UPDATE tickets SET status='closed',resolved_at=datetime('now'),rating=?,rating_note=?,updated_at=datetime('now') WHERE id=?").run(rating || null, rating_note || null, ticket.id);
  res.redirect(`/talep/${req.params.token}`);
});

// ── ROUTES: ADMIN ─────────────────────────────────────────────
app.get("/admin/reports", requireAuth, (req, res) => {
  const monthlyStats = db.prepare("SELECT strftime('%Y-%m',created_at) as month, COUNT(*) as total, SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved, AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at)-julianday(created_at))*24 END) as avg_hours FROM tickets GROUP BY month ORDER BY month DESC LIMIT 12").all();
  const categoryStats = db.prepare("SELECT c.name as category, COUNT(*) as total, SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved FROM tickets t LEFT JOIN categories c ON t.category_id=c.id GROUP BY t.category_id ORDER BY total DESC").all();
  const resolutionByPriority = db.prepare("SELECT priority, COUNT(*) as total, SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved, AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at)-julianday(created_at))*24 END) as avg_hours FROM tickets GROUP BY priority").all();
  const categories = db.prepare("SELECT * FROM categories ORDER BY rank,name").all();
  const agents = db.prepare("SELECT * FROM users WHERE is_active=1 ORDER BY name").all();
  const statuses = ["open", "in_progress", "waiting", "resolved", "closed"];
  res.send(views.reportsPage(req, { monthlyStats, categoryStats, resolutionByPriority, categories, agents, statuses }));
});

app.get("/admin/quick-replies", requireAuth, (req, res) => {
  const quickReplies = db.prepare("SELECT * FROM quick_replies ORDER BY title").all();
  res.send(views.quickRepliesPage(req, { quickReplies }));
});

app.post("/admin/quick-replies", requireAuth, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) { req.flash("error", "Başlık ve metin zorunlu."); return res.redirect("/admin/quick-replies"); }
  db.prepare("INSERT INTO quick_replies(title,body) VALUES(?,?)").run(title, body);
  req.flash("success", "Hazır yanıt eklendi.");
  res.redirect("/admin/quick-replies");
});

app.post("/admin/quick-replies/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM quick_replies WHERE id=?").run(req.params.id);
  req.flash("success", "Silindi.");
  res.redirect("/admin/quick-replies");
});

app.get("/admin/categories", requireAdmin, (req, res) => {
  const categories = db.prepare("SELECT c.*, COUNT(t.id) as ticket_count FROM categories c LEFT JOIN tickets t ON t.category_id=c.id GROUP BY c.id ORDER BY c.rank,c.name").all();
  res.send(views.categoriesPage(req, { categories }));
});

app.post("/admin/categories", requireAdmin, (req, res) => {
  const { name, color, rank } = req.body;
  if (!name) { req.flash("error", "Ad zorunlu."); return res.redirect("/admin/categories"); }
  db.prepare("INSERT INTO categories(name,color,rank) VALUES(?,?,?)").run(name, color || "#3b82f6", parseInt(rank) || 0);
  req.flash("success", "Kategori eklendi.");
  res.redirect("/admin/categories");
});

app.post("/admin/categories/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);
  req.flash("success", "Silindi.");
  res.redirect("/admin/categories");
});

app.get("/admin/tags", requireAdmin, (req, res) => {
  const tags = db.prepare("SELECT t.*, COUNT(tt.ticket_id) as ticket_count FROM tags t LEFT JOIN ticket_tags tt ON t.id=tt.tag_id GROUP BY t.id ORDER BY t.rank,t.name").all();
  res.send(views.tagsPage(req, { tags }));
});

app.post("/admin/tags", requireAdmin, (req, res) => {
  const { name, color } = req.body;
  if (!name) { req.flash("error", "Ad zorunlu."); return res.redirect("/admin/tags"); }
  db.prepare("INSERT INTO tags(name,color) VALUES(?,?)").run(name, color || "#64748b");
  req.flash("success", "Etiket eklendi.");
  res.redirect("/admin/tags");
});

app.post("/admin/tags/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM tags WHERE id=?").run(req.params.id);
  req.flash("success", "Silindi.");
  res.redirect("/admin/tags");
});

app.get("/admin/webhooks", requireAdmin, (req, res) => {
  const webhooks = db.prepare("SELECT * FROM webhooks ORDER BY created_at DESC").all();
  res.send(views.webhooksPage(req, { webhooks }));
});

app.post("/admin/webhooks", requireAdmin, (req, res) => {
  const { url, secret, events } = req.body;
  if (!url) { req.flash("error", "URL zorunlu."); return res.redirect("/admin/webhooks"); }
  const evArr = [].concat(events || []);
  db.prepare("INSERT INTO webhooks(url,secret,events) VALUES(?,?,?)").run(url, secret || null, JSON.stringify(evArr));
  req.flash("success", "Webhook eklendi.");
  res.redirect("/admin/webhooks");
});

app.post("/admin/webhooks/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM webhooks WHERE id=?").run(req.params.id);
  req.flash("success", "Silindi.");
  res.redirect("/admin/webhooks");
});

app.get("/admin/settings", requireAdmin, (req, res) => {
  const settings = getAllSettings();
  const users = db.prepare("SELECT * FROM users ORDER BY name").all();
  res.send(views.settingsPage(req, { settings, users }));
});

app.post("/admin/settings", requireAdmin, (req, res) => {
  const keys = ["app_name","app_url","support_email","support_phone","smtp_host","smtp_port","smtp_user","smtp_from","sla_urgent","sla_high","sla_normal","sla_low","daily_limit","work_start","work_end","notify_sound"];
  keys.forEach(k => { if (req.body[k] !== undefined) setSetting(k, req.body[k]); });
  if (req.body.smtp_pass) setSetting("smtp_pass", req.body.smtp_pass);
  app.locals.appName = getSetting("app_name");
  req.flash("success", "Ayarlar kaydedildi.");
  res.redirect("/admin/settings");
});

app.post("/admin/users/new", requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) { req.flash("error", "Tüm alanlar zorunlu."); return res.redirect("/admin/settings"); }
  const bcrypt = require("bcryptjs");
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name, email, hash, role || "agent");
    req.flash("success", "Kullanıcı eklendi.");
  } catch { req.flash("error", "Bu e-posta zaten kayıtlı."); }
  res.redirect("/admin/settings");
});

app.post("/admin/users/:id/delete", requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.currentUser.id) { req.flash("error", "Kendinizi silemezsiniz."); return res.redirect("/admin/settings"); }
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  req.flash("success", "Kullanıcı silindi.");
  res.redirect("/admin/settings");
});

// ── API ───────────────────────────────────────────────────────
app.get("/api/notifications", requireAuth, (req, res) => {
  const tickets = db.prepare("SELECT id,ticket_no,title,status,updated_at FROM tickets WHERE status NOT IN ('resolved','closed') ORDER BY updated_at DESC LIMIT 10").all();
  res.json(tickets);
});

app.get("/api/tickets/:id/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write("data: connected\n\n");
  const interval = setInterval(() => res.write("data: ping\n\n"), 30000);
  req.on("close", () => clearInterval(interval));
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).send(views.errorPage(req, { title: "Sayfa Bulunamadı", message: "Aradığınız sayfa mevcut değil." })));

// ── ERROR ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(views.errorPage(req, { title: "Sunucu Hatası", message: "Beklenmedik bir hata oluştu." }));
});

// ── START ─────────────────────────────────────────────────────
const addr = process.env.HOST || "127.0.0.1";
app.listen(PORT, addr, () => {
  console.log(`${getSetting("app_name")} http://${addr}:${PORT} adresinde çalışıyor.`);
});
