// Load environment variables from .env file (must be first)
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const os = require('os');

// Override nodemailer's network interface caching to resolve startup network detection issues under Windows Services
try {
    const nodemailerShared = require('nodemailer/lib/shared');
    nodemailerShared.networkInterfaces = os.networkInterfaces();
    setInterval(() => {
        try {
            nodemailerShared.networkInterfaces = os.networkInterfaces();
        } catch (e) {
            console.error('Failed to update networkInterfaces:', e);
        }
    }, 10000);
} catch (e) {
    console.error('Failed to patch nodemailer network interfaces:', e);
}

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const port = parseInt(process.env.PORT, 10) || 8085;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// JWT Secret — must be set via environment variable in production
const SECRET_KEY = process.env.JWT_SECRET || (() => {
    if (IS_PRODUCTION) {
        console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start in production.');
        process.exit(1);
    }
    console.warn('[WARN] JWT_SECRET not set — using insecure dev fallback. Set JWT_SECRET in .env!');
    return 'insecure-dev-fallback-secret';
})();

// CORS — allow configured origin or dynamic origin matching any IP/hostname
const allowedOriginEnv = process.env.ALLOWED_ORIGIN;
const corsOptions = {
    origin: (allowedOriginEnv && allowedOriginEnv !== '*') ? allowedOriginEnv : true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized: Session token missing. Please log in again.' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired. Please log in again.' });
        req.user = user;
        next();
    });
};

// --- Configuration Endpoint ---
// Returns SMTP defaults from server environment variables.
// This lets the UI pre-fill the SMTP form without any credentials in the client bundle.
app.get('/api/config', (req, res) => {
    res.json({
        smtp: {
            host: process.env.SMTP_HOST || 'mail.ethiopianairlines.com',
            port: parseInt(process.env.SMTP_PORT, 10) || 587,
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
            secure: process.env.SMTP_SECURE === 'true',
        }
    });
});

// --- Auth Routes ---

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const passwordIsValid = bcrypt.compareSync(password, user.password_hash);
        if (!passwordIsValid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, {
            expiresIn: 86400 // 24 hours
        });

        res.json({ auth: true, token: token, user: { username: user.username, role: user.role } });
    });
});

// --- User Management Routes (Admin Only) ---

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    next();
};

app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT id, username, role FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ users: rows });
    });
});

app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
    const { username, password, role } = req.body;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, hash, role || 'user'], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, username, role });
    });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User deleted', changes: this.changes });
    });
});

// --- Protected Application Routes ---

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API to upload and parse Excel file
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet);

        // Helper to find key ignoring case and spaces
        const findKey = (row, candidates) => {
            const rowKeys = Object.keys(row);
            for (const candidate of candidates) {
                const found = rowKeys.find(k => k.trim().toLowerCase() === candidate.toLowerCase());
                if (found) return found;
            }
            return null;
        };

        const data = rawData.map(row => {
            const newRow = { ...row }; // Copy original data

            // Normalize 'Full Name'
            const nameKey = findKey(row, ['Full Name', 'FullName', 'Name']);
            if (nameKey) newRow['Full Name'] = row[nameKey];

            // Normalize 'email Address'
            const emailKey = findKey(row, ['email Address', 'EmailAddress', 'Email', 'E-mail']);
            if (emailKey) newRow['email Address'] = row[emailKey];

            // Normalize 'Use ID'
            const userIdKey = findKey(row, ['Use ID', 'UserID', 'User ID']);
            if (userIdKey) newRow['Use ID'] = row[userIdKey];

            // Normalize 'Password'
            const passKey = findKey(row, ['Password', 'Pass', 'PW', 'Pwd']);
            if (passKey) newRow['Password'] = row[passKey];

            // Normalize 'ID #'
            const idKey = findKey(row, ['ID #', 'ID', 'No.', 'ID No', 'ID Number']);
            if (idKey) newRow['ID #'] = row[idKey];

            return newRow;
        });

        // Log the keys of the first row to help debug
        if (data.length > 0) {
            console.log('Normalized keys of first row:', Object.keys(data[0]));
        }

        res.json({ message: 'File uploaded and parsed successfully', data });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Failed to process file' });
    }
});

// API to verify SMTP connection
app.post('/api/verify', authenticateToken, async (req, res) => {
    const { smtpConfig } = req.body;
    console.log('Verifying SMTP config:', { ...smtpConfig, pass: '****' });

    let transporter;
    try {
        transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: parseInt(smtpConfig.port),
            secure: smtpConfig.secure || false,
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.pass,
            },
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1'
            }
        });

        await transporter.verify();
        console.log('SMTP Connection Successful');
        res.json({ success: true });
    } catch (error) {
        console.error('SMTP Connection Failed:', error);
        res.status(400).json({ success: false, error: error.message });
    } finally {
        if (transporter) {
            try {
                transporter.close();
            } catch (e) {
                console.error('Error closing transporter:', e);
            }
        }
    }
});

// Only correct typos around ethiopianairlines.com — no other domain is blocked
const CORRECT_DOMAIN = 'ethiopianairlines.com';

// Levenshtein distance — counts minimum edits between two strings
const levenshtein = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[a.length][b.length];
};

// Auto-correct typo variants of ethiopianairlines.com (within 4 edits)
const correctDomain = (email) => {
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) return { email, corrected: false };
    const localPart = email.substring(0, atIndex);
    const domain = email.substring(atIndex + 1).toLowerCase().trim();
    if (domain === CORRECT_DOMAIN) return { email, corrected: false };
    const dist = levenshtein(domain, CORRECT_DOMAIN);
    if (dist > 0 && dist <= 4) {
        return { email: `${localPart}@${CORRECT_DOMAIN}`, corrected: true, originalDomain: domain };
    }
    return { email, corrected: false };
};

// API to send email
app.post('/api/send', authenticateToken, async (req, res) => {
    const { rowData, smtpConfig, template, fontFamily, fontSize } = req.body;

    if (!rowData || !smtpConfig) {
        return res.status(400).json({ error: 'Missing data or SMTP config' });
    }

    // Normalize keys to handle case/trimming issues
    const normalizeKey = (obj, key) => {
        if (!obj) return undefined;
        const foundKey = Object.keys(obj).find(k => k.trim().toLowerCase() === key.toLowerCase());
        return foundKey ? obj[foundKey] : undefined;
    };

    // Email Template Construction
    const emailAddress = normalizeKey(rowData, 'email address') || normalizeKey(rowData, 'email');
    const fullName = normalizeKey(rowData, 'full name') || 'Valued User';
    const userId = normalizeKey(rowData, 'use id') || normalizeKey(rowData, 'user id');
    const password = normalizeKey(rowData, 'password');
    const idNum = normalizeKey(rowData, 'id #') || normalizeKey(rowData, 'no.');

    if (!emailAddress) {
        console.error('Missing email for row:', rowData);
        return res.status(400).json({ error: 'Recipient email missing in row data' });
    }

    // Process Template
    let content = template || '';

    // Replace placeholders
    // Fix: Handle 0 as a valid password
    const passwordValue = (password !== undefined && password !== null) ? password : '';

    // Warn if password is missing/empty
    if (!passwordValue) {
        console.warn(`[WARN] Password is empty/missing for user: ${fullName} (${emailAddress})`);
    }

    content = content.replace(/\[Full Name\]/gi, fullName);
    content = content.replace(/\[User ID\]/gi, userId || '');
    content = content.replace(/\[Password\]/gi, passwordValue.toString());
    content = content.replace(/\[Email\]/gi, emailAddress);
    content = content.replace(/\[ID\]/gi, idNum || '');

    // Convert newlines to <br/>
    content = content.replace(/\n/g, '<br/>');

    // Wrap in professional email template
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Asset Declaration User Credentials</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f0f2f5; font-family: ${fontFamily || 'Arial, sans-serif'};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 30px 0;">
        <tr>
          <td align="center">
            <!-- Main Container -->
            <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width: 640px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #006B3F 0%, #00833E 50%, #009A44 100%); padding: 28px 40px; text-align: center;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; font-family: ${fontFamily || 'Arial, sans-serif'};">
                          ✈ Ethiopian Airlines Group
                        </h1>
                        <p style="margin: 6px 0 0 0; color: #c8e6c9; font-size: 13px; letter-spacing: 0.3px;">
                          Ethics & Anti-Corruption Compliance
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Accent Line -->
              <tr>
                <td style="background: linear-gradient(90deg, #F5A623, #D4920B, #F5A623); height: 4px; font-size: 0; line-height: 0;">&nbsp;</td>
              </tr>

              <!-- Body Content -->
              <tr>
                <td style="padding: 36px 40px 30px 40px;">
                  <div style="font-family: ${fontFamily || 'Arial, sans-serif'}; font-size: ${fontSize || '14px'}; color: #2d3748; line-height: 1.7;">
                    ${content}
                  </div>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="padding: 0 40px;">
                  <hr style="border: none; border-top: 1px solid #e8e8e8; margin: 0;">
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 24px 40px 28px 40px; background-color: #fafbfc;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <p style="margin: 0 0 6px 0; color: #718096; font-size: 12px; font-family: ${fontFamily || 'Arial, sans-serif'};">
                          This is an automated message from the Ethiopian Airlines Asset Declaration System.
                        </p>
                        <p style="margin: 0 0 6px 0; color: #718096; font-size: 12px; font-family: ${fontFamily || 'Arial, sans-serif'};">
                          For technical support, please contact your department administrator.
                        </p>
                        <p style="margin: 8px 0 0 0; color: #a0aec0; font-size: 11px; font-family: ${fontFamily || 'Arial, sans-serif'};">
                          &copy; ${new Date().getFullYear()} Ethiopian Airlines Group. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
            <!-- End Main Container -->
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    console.log(`Attempting to send to ${emailAddress} via ${smtpConfig.host}:${smtpConfig.port}`);

    // Auto-correct Ethiopian Airlines domain typos (e.g. ethiiopianairlines.com → ethiopianairlines.com)
    const { email: correctedAddress, corrected: domainWasCorrected, originalDomain: origDomain } = correctDomain(emailAddress);
    if (domainWasCorrected) {
        console.log(`[DOMAIN CORRECTED] ${emailAddress} → ${correctedAddress} (typo: ${origDomain})`);
    }
    const finalEmailAddress = correctedAddress;

    // Proceed with sending — all domains allowed, DSN requested for delivery failure alerts
    let transporter;
    try {
        transporter = nodemailer.createTransport({
            host: smtpConfig.host || 'mail.ethiopianairlines.com',
            port: parseInt(smtpConfig.port) || 587,
            secure: smtpConfig.secure || false,
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.pass,
            },
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1'
            }
        });

        const info = await transporter.sendMail({
            from: smtpConfig.user,
            to: finalEmailAddress,
            subject: 'Asset Declaration User Credentials',
            html: htmlContent,
            // Request Delivery Status Notification — sender gets a bounce email if delivery fails
            dsn: {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                return: 'headers',
                notify: ['failure', 'delay'],
                recipient: smtpConfig.user
            }
        });

        // Save successfully sent email to database
        db.run(
            `INSERT INTO sent_emails (recipient_name, recipient_email, user_id, subject, status, sent_by, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [fullName, finalEmailAddress, userId || '', 'Asset Declaration User Credentials', 'sent', req.user.username, info.messageId],
            (err) => {
                if (err) console.error('Error saving sent email to DB:', err.message);
            }
        );

        res.json({
            success: true,
            messageId: info.messageId,
            domainCorrected: domainWasCorrected,
            originalEmail: domainWasCorrected ? emailAddress : undefined
        });
    } catch (error) {
        console.error('Error sending email:', error);
        // Save SMTP-level failures to database
        db.run(
            `INSERT INTO sent_emails (recipient_name, recipient_email, user_id, subject, status, sent_by, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [fullName, finalEmailAddress, userId || '', 'Asset Declaration User Credentials', 'failed', req.user.username, ''],
            (err) => {
                if (err) console.error('Error saving failed email to DB:', err.message);
            }
        );
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (transporter) {
            try {
                transporter.close();
            } catch (e) {
                console.error('Error closing transporter:', e);
            }
        }
    }
});

// --- Sent Email History Routes ---

// Get sent email history
app.get('/api/sent-emails', authenticateToken, (req, res) => {
    db.all("SELECT * FROM sent_emails ORDER BY sent_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ emails: rows });
    });
});

// Clear sent email history
app.delete('/api/sent-emails', authenticateToken, isAdmin, (req, res) => {
    db.run("DELETE FROM sent_emails", function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Sent email history cleared', changes: this.changes });
    });
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Listen on all network interfaces so the app is reachable by hostname or IP
app.listen(port, '0.0.0.0', () => {
    const env = IS_PRODUCTION ? 'production' : 'development';
    console.log(`[${env}] Server running on http://0.0.0.0:${port}`);
    console.log(`  Local:    http://localhost:${port}`);
    console.log(`  Hostname: http://PCHQBT01:${port}`);
    
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`  IP (${name}): http://${net.address}:${port}`);
                }
            }
        }
    } catch (e) {
        console.error('Error reading network interfaces:', e);
    }
});
