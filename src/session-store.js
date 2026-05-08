"use strict";
const path = require("path");
const Database = require("better-sqlite3");

module.exports = function(session) {
  const Store = session.Store;

  class SQLiteStore extends Store {
    constructor(options = {}) {
      super(options);
      const dbPath = path.join(__dirname, "..", "data", "helpdesk.sqlite");
      this.db = new Database(dbPath);
      this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires INTEGER
      )`);
      setInterval(() => {
        this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
      }, 60 * 60 * 1000);
    }

    get(sid, cb) {
      try {
        const row = this.db.prepare("SELECT * FROM sessions WHERE sid=?").get(sid);
        if (!row) return cb(null, null);
        if (row.expires && row.expires < Date.now()) {
          this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
          return cb(null, null);
        }
        cb(null, JSON.parse(row.data));
      } catch (e) { cb(e); }
    }

    set(sid, session, cb) {
      try {
        const expires = session.cookie?.expires ? new Date(session.cookie.expires).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000;
        this.db.prepare("INSERT OR REPLACE INTO sessions(sid,data,expires) VALUES(?,?,?)").run(sid, JSON.stringify(session), expires);
        cb(null);
      } catch (e) { cb(e); }
    }

    destroy(sid, cb) {
      try {
        this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
        cb(null);
      } catch (e) { cb(e); }
    }
  }

  return SQLiteStore;
};
