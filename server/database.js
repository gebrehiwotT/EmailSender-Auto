const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

class SQLite3Wrapper {
    constructor(dbPath) {
        this.internalDb = new DatabaseSync(dbPath);
    }

    serialize(callback) {
        if (callback) callback();
    }

    run(sql, params, callback) {
        let actualParams = params;
        let actualCallback = callback;
        if (typeof params === 'function') {
            actualCallback = params;
            actualParams = [];
        }
        if (!actualParams) actualParams = [];
        try {
            const stmt = this.internalDb.prepare(sql);
            const result = stmt.run(...actualParams);
            if (actualCallback) {
                const context = {
                    lastID: result.lastInsertRowid,
                    changes: result.changes
                };
                process.nextTick(() => actualCallback.call(context, null));
            }
        } catch (err) {
            if (actualCallback) {
                process.nextTick(() => actualCallback(err));
            } else {
                console.error(err);
            }
        }
    }

    get(sql, params, callback) {
        let actualParams = params;
        let actualCallback = callback;
        if (typeof params === 'function') {
            actualCallback = params;
            actualParams = [];
        }
        if (!actualParams) actualParams = [];
        try {
            const stmt = this.internalDb.prepare(sql);
            const row = stmt.get(...actualParams);
            if (actualCallback) {
                process.nextTick(() => actualCallback(null, row || undefined));
            }
        } catch (err) {
            if (actualCallback) {
                process.nextTick(() => actualCallback(err));
            } else {
                console.error(err);
            }
        }
    }

    all(sql, params, callback) {
        let actualParams = params;
        let actualCallback = callback;
        if (typeof params === 'function') {
            actualCallback = params;
            actualParams = [];
        }
        if (!actualParams) actualParams = [];
        try {
            const stmt = this.internalDb.prepare(sql);
            const rows = stmt.all(...actualParams);
            if (actualCallback) {
                process.nextTick(() => actualCallback(null, rows));
            }
        } catch (err) {
            if (actualCallback) {
                process.nextTick(() => actualCallback(err));
            } else {
                console.error(err);
            }
        }
    }

    prepare(sql) {
        const stmt = this.internalDb.prepare(sql);
        return new StatementWrapper(stmt);
    }
}

class StatementWrapper {
    constructor(stmt) {
        this.stmt = stmt;
    }

    get(...args) {
        const callback = args[args.length - 1];
        const params = args.slice(0, -1);
        try {
            const row = this.stmt.get(...params);
            if (typeof callback === 'function') {
                process.nextTick(() => callback(null, row || undefined));
            }
        } catch (err) {
            if (typeof callback === 'function') {
                process.nextTick(() => callback(err));
            } else {
                console.error(err);
            }
        }
    }

    run(...args) {
        const callback = args[args.length - 1];
        const params = args.slice(0, -1);
        try {
            const result = this.stmt.run(...params);
            if (typeof callback === 'function') {
                const context = {
                    lastID: result.lastInsertRowid,
                    changes: result.changes
                };
                process.nextTick(() => callback.call(context, null));
            }
        } catch (err) {
            if (typeof callback === 'function') {
                process.nextTick(() => callback(err));
            } else {
                console.error(err);
            }
        }
    }

    finalize() {
        // no-op
    }
}

const dbPath = path.resolve(__dirname, 'users.db');
const db = new SQLite3Wrapper(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sent_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_name TEXT,
        recipient_email TEXT,
        user_id TEXT,
        subject TEXT,
        status TEXT DEFAULT 'sent',
        sent_by TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_id TEXT
    )`);

    // Seed default admin user
    const stmt = db.prepare("SELECT count(*) as count FROM users WHERE username = ?");
    stmt.get("admin", (err, row) => {
        if (err) {
            console.error(err.message);
            return;
        }
        if (row.count === 0) {
            const password = 'admin123';
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(password, salt);
            const insert = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
            insert.run("admin", hash, "admin");
            insert.finalize();
            console.log("Default admin user created.");
        }
    });
    stmt.finalize();
});

module.exports = db;

