"use strict";
const nodemailer = require("nodemailer");
const { getSetting } = require("./db");

async function sendMail({ to, subject, text, html }) {
  const host = getSetting("smtp_host");
  if (!host) return;
  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(getSetting("smtp_port") || "587"),
    secure: false,
    auth: { user: getSetting("smtp_user"), pass: getSetting("smtp_pass") },
    tls: { rejectUnauthorized: false },
  });
  await transporter.sendMail({
    from: getSetting("smtp_from") || getSetting("smtp_user"),
    to, subject, text, html,
  });
}

module.exports = { sendMail };
