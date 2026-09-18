import React, { useState, useEffect } from 'react';
import Login from './Login';
import UserManagement from './UserManagement';
import { apiFetch, fetchServerConfig } from './api';

const isGroupEmail = (email) => {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  const prefix = cleanEmail.split('@')[0];
  
  // 1. Direct sub-string checks for concatenated lowercase/concatenated group patterns
  const concats = [
    prefix === 'dl' || /^dl[^a-z]/.test(prefix), // dl as a standalone word or followed by non-letters (e.g. dl-finance, dl12)
    prefix.startsWith('group'),
    prefix.startsWith('team'),
    prefix.endsWith('team'),
    prefix.endsWith('group'),
    prefix.endsWith('grp'),
    prefix.endsWith('list'),
    prefix.endsWith('staff'),
    prefix === 'all' || /[^a-z]all$/.test(prefix) // all as a standalone word or preceded by non-letters (avoiding names like randall)
  ];
  if (concats.some(val => val)) return true;

  // 2. Tokenize prefix by case transitions (CamelCase) and non-alphanumeric separators
  // Splitting by CamelCase boundary (capital letters) or hyphens, dots, underscores, numbers
  const words = cleanEmail.split('@')[0]
    .split(/(?=[A-Z])|[-._\s0-9]+/)
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length > 0);

  const groupKeywords = [
    'all', 'everyone', 'group', 'grp', 'team', 'staff', 'dept', 'department', 
    'dl', 'list', 'info', 'support', 'broadcast', 'distribution', 'admin', 
    'noreply', 'no-reply', 'marketing', 'sales', 'office', 'help', 'service'
  ];

  return words.some(word => groupKeywords.includes(word));
};

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

// Auto-correct domain typos: if within 4 edits of ethiopianairlines.com, fix it
// Catches: double letters, swapped chars, missing chars, extra chars, etc.
const correctEmailDomain = (email) => {
  if (!email) return { email, wasFixed: false };
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return { email, wasFixed: false };
  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1).toLowerCase().trim();
  if (domain === CORRECT_DOMAIN) return { email, wasFixed: false };
  const dist = levenshtein(domain, CORRECT_DOMAIN);
  if (dist > 0 && dist <= 4) {
    return { email: `${localPart}@${CORRECT_DOMAIN}`, wasFixed: true, originalDomain: domain };
  }
  return { email, wasFixed: false };
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [showUserMgmt, setShowUserMgmt] = useState(false);

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: 587,
    user: '',
    pass: '',     // Never hardcode credentials here — loaded from server .env via /api/config
    secure: false
  });
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, total: 0, failed: 0 });
  const [logs, setLogs] = useState([]);

  const [selectedRows, setSelectedRows] = useState(new Set());

  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const [popupMessage, setPopupMessage] = useState(null);

  // Rich Text Editor State
  const [emailTemplate, setEmailTemplate] = useState(
    `<div>Dear <strong>[Full Name]</strong>,</div><div><br></div><div>Greetings,</div><div><br></div><div>After receiving your personal profile for asset declaration and registration, User ID and Password is being created. By using this link <a href="https://feaccears.gov.et/EARS" style="color: #006B3F; font-weight: bold;">https://feaccears.gov.et/EARS</a> you can declare and register your assets by following user guideline below.</div><div><br></div><div><a href="https://portal.ethiopianairlines.com/default/Corp/IAC/ELUH/Shared%20Documents/Documents/Disclosure%20and%20Registration%20of%20Asset%20documents/New%20Asset%20Disclosure%20and%20Registration%20(EARS)%20%20system%20guidelines..pdf" style="color: #006B3F; font-weight: bold; text-decoration: underline;">📋 User Guideline</a></div><div><br></div><div style="background-color: #FFF8E1; border-left: 4px solid #F5A623; padding: 12px 16px; border-radius: 4px; margin: 8px 0;"><strong>NB:</strong> Since the password provided is system generated, please use <strong>copy and paste</strong> to avoid error.</div><div><br></div><div style="background-color: #E8F5E9; border-left: 4px solid #006B3F; padding: 12px 16px; border-radius: 4px; margin: 8px 0;">After finalizing your registration and obtaining certification, please send your certificate to <a href="mailto:EARSCertificate@ethiopianairlines.com" style="color: #006B3F; font-weight: bold;">EARSCertificate@ethiopianairlines.com</a></div><div><br></div><div style="background-color: #f7f8fa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px 20px; margin: 12px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding: 6px 0;"><strong style="color: #4a5568;">🔑 User ID:</strong></td><td style="padding: 6px 0; text-align: right;"><span style="background-color: #EDF2F7; padding: 4px 12px; border-radius: 4px; font-family: monospace; font-size: 14px; letter-spacing: 0.5px;">[User ID]</span></td></tr><tr><td style="border-top: 1px solid #e2e8f0; padding: 6px 0;"><strong style="color: #4a5568;">🔒 Password:</strong></td><td style="border-top: 1px solid #e2e8f0; padding: 6px 0; text-align: right;"><span style="background-color: #EDF2F7; padding: 4px 12px; border-radius: 4px; font-family: monospace; font-size: 14px; letter-spacing: 0.5px;">[Password]</span></td></tr></table></div><div><br></div><div>With Best Regards,</div>`
  );

  // Load SMTP defaults from server environment on mount (credentials stay in .env, not in source)
  useEffect(() => {
    fetchServerConfig().then(config => {
      if (config && config.smtp) {
        setSmtpConfig(prev => ({
          ...prev,
          host:   config.smtp.host   || prev.host,
          port:   config.smtp.port   || prev.port,
          user:   config.smtp.user   || prev.user,
          pass:   config.smtp.pass   || prev.pass,
          secure: config.smtp.secure ?? prev.secure,
        }));
      }
    });
  }, []);

  // Handle global session expiry (401/403 from any API call)
  useEffect(() => {
    const handler = () => handleLogout();
    window.addEventListener('api:unauthorized', handler);
    return () => window.removeEventListener('api:unauthorized', handler);
  }, []);

  const [showGuide, setShowGuide] = useState(false);

  // Sent Email History State
  const [sentEmailHistory, setSentEmailHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetchSentHistory = async () => {
    try {
      const response = await apiFetch('/api/sent-emails');
      if (!response.ok) return;
      const result = await response.json();
      setSentEmailHistory(result.emails || []);
      setShowHistory(true);
    } catch (error) {
      console.error('Error fetching history:', error);
      setLogs(prev => [...prev, `Error fetching sent history: ${error.message}`]);
    }
  };

  const clearSentHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all sent email history?')) return;
    try {
      const response = await apiFetch('/api/sent-emails', {
        method: 'DELETE',
      });
      if (response.ok) {
        setSentEmailHistory([]);
        setLogs(prev => [...prev, 'Sent email history cleared.']);
      }
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  };

  const exportToCSV = () => {
    if (sentEmailHistory.length === 0) return;
    
    const headers = ['Recipient Name', 'Recipient Email', 'User ID', 'Status'];
    
    const formatValue = (val) => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      return `"${stringVal.replace(/"/g, '""')}"`;
    };

    const csvRows = [
      headers.join(','),
      ...sentEmailHistory.map(email => [
        formatValue(email.recipient_name),
        formatValue(email.recipient_email),
        formatValue(email.user_id),
        formatValue(email.status)
      ].join(','))
    ];
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sent_emails_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setLogs(prev => [...prev, 'Sent email history successfully exported to CSV file.']);
  };

  const handleLogin = (userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('token', tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // Helper for Rich Text Commands
  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setFile(files[0]); // Just show the first file name or count

    for (const selectedFile of files) {
      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        const response = await apiFetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          if (response.status !== 401 && response.status !== 403) {
            throw new Error(`Upload failed: ${response.status}`);
          }
          return; // api:unauthorized event already fired
        }

        const result = await response.json();
        if (result.data) {
          // Add status field to each row and check for group emails
          const processedData = result.data.map(row => {
            const rawEmail = (row['email Address'] || row['email'] || '').toString().trim();
            const emailLower = rawEmail.toLowerCase();

            if (isGroupEmail(emailLower)) {
              return { ...row, status: 'error', error: 'Group email not allowed' };
            }

            // Auto-correct Ethiopian Airlines domain typos only
            const { email: correctedEmail, wasFixed } = correctEmailDomain(rawEmail);
            if (wasFixed) {
              return {
                ...row,
                'email Address': correctedEmail,
                status: 'pending',
                domainCorrected: true,
                originalEmail: rawEmail,
                correctionNote: `Typo error corrected on domain name`
              };
            }

            return { ...row, status: 'pending' };
          });

          setData(prevData => {
            // Helper to generate a unique key based on Email and User ID
            const generateKey = (row) => {
              const email = (row['email Address'] || '').toLowerCase().trim();
              const userId = (row['Use ID'] || '').toString().toLowerCase().trim();
              return `${email}|${userId}`;
            };

            const existingKeys = new Set(prevData.map(r => generateKey(r)));
            const uniqueNewRows = [];
            let duplicatesCount = 0;

            for (const row of processedData) {
              const key = generateKey(row);

              // Only consider it a duplicate if we have enough data to form a key
              // If both email and user ID are empty, we might skip or allow? 
              // Usually we want at least one identifier. 
              // Assuming if key is just "|", it's invalid data but let's treat it as unique enough to be shown/deleted manually
              // or let's assume we require at least an email or user ID.

              const hasData = (row['email Address'] || row['Use ID']);

              if (hasData && existingKeys.has(key)) {
                duplicatesCount++;
              } else {
                if (hasData) existingKeys.add(key);
                uniqueNewRows.push(row);
              }
            }

            // Note: If both email and user ID are missing, the key is "|", which is unique initially but duplicates will be caught.
            // This is acceptable behavior.

            if (duplicatesCount > 0) {
              // Use setTimeout to avoid state update during render (though we are inside setData, better safe)
              setTimeout(() => {
                setLogs(prev => [...prev, `Skipped ${duplicatesCount} duplicate(s) (checking Email + User ID) from ${selectedFile.name}`]);
              }, 0);
            }

            // Append new data to existing data
            return [...prevData, ...uniqueNewRows];
          });

          // We can't easily know the exact number added here for progress update without duplicating logic, 
          // but we can update total based on uniqueNewRows length if we could access it.
          // Instead, we'll update progress based on the state change in a useEffect or just approximate here.
          // For simplicity, we'll just update progress with the full count and let the user see the skipped log.
          // Actually, let's just update progress with the filtered count if possible.
          // Since we can't access the return value of setData, we'll just update progress conservatively.
          // A better way is to calculate unique rows BEFORE setData, but we need prevData.
          // We'll stick to updating progress with processedData.length for now, or we can move the logic outside setData if we use a ref for data.
          // Given the constraints, let's just update progress.total. It might be slightly off if duplicates are skipped, 
          // but 'total' usually implies total tasks attempted. 
          // Wait, if we skip them, they aren't in the table, so they shouldn't be in 'total'.
          // Let's try to calculate it correctly.

          // To do it correctly, we need the current data. 
          // Since we are inside an async function, 'data' variable from closure is stale.
          // We will use the functional update for setProgress as well, but we can't correlate easily.

          // Alternative: Move duplicate logic to a helper that takes prevData, returns { newData, duplicates }.
          // But we can't call that helper inside setData and get the value out.

          // Let's just update progress.total with processedData.length. 
          // If duplicates are removed, the table will show fewer rows than 'total', which might be confusing.
          // But since we log "Skipped X duplicates", it explains the discrepancy.

          setProgress(prev => ({
            ...prev,
            total: prev.total + processedData.length
          }));

          setLogs(prev => [...prev, `Loaded rows from ${selectedFile.name}`]);
        }
      } catch (error) {
        console.error('Upload error:', error);
        setLogs(prev => [...prev, `Error uploading ${selectedFile.name}: ${error.message}`]);
      }
    }

    // Reset the input so the same file can be selected again if needed
    e.target.value = '';
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setSmtpConfig(prev => ({ ...prev, [name]: value }));
  };

  const testConnection = async () => {
    setLogs(prev => [...prev, 'Testing SMTP connection...']);
    try {
      const response = await apiFetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpConfig }),
      });

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
      }

      if (result.success) {
        setLogs(prev => [...prev, '✅ Connection Successful!']);
        setPopupMessage('✅ Connection Successful!');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setLogs(prev => [...prev, `❌ Connection Failed: ${error.message}`]);
      setPopupMessage(`❌ Connection Failed: ${error.message}`);
    }
  };

  const deleteRow = (index) => {
    const newData = [...data];
    newData.splice(index, 1);
    setData(newData);

    // Update selection
    const newSelection = new Set();
    selectedRows.forEach(i => {
      if (i < index) newSelection.add(i);
      if (i > index) newSelection.add(i - 1);
    });
    setSelectedRows(newSelection);

    setLogs(prev => [...prev, `Deleted row ${index + 1}`]);

    if (newData.length === 0) {
      setFile(null);
      setLogs(prev => [...prev, 'All rows deleted. Resetting upload state.']);
    }
  };

  const startEdit = (index, row) => {
    setEditingId(index);
    setEditFormData({ ...row });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const saveEdit = (index) => {
    const newData = [...data];
    const email = (editFormData['email Address'] || editFormData['email'] || '').toString().toLowerCase().trim();
    if (isGroupEmail(email)) {
      newData[index] = { ...editFormData, status: 'error', error: 'Group email not allowed' };
    } else {
      const prevError = newData[index].error;
      const status = (prevError === 'Group email not allowed') ? 'pending' : (editFormData.status || 'pending');
      const error = (prevError === 'Group email not allowed') ? undefined : editFormData.error;
      newData[index] = { ...editFormData, status, error };
    }
    setData(newData);
    setEditingId(null);
    setEditFormData({});
    setLogs(prev => [...prev, `Updated row ${index + 1}`]);
  };

  const handleEditChange = (e, field) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
    } else {
      const allIndices = new Set(data.map((_, i) => i));
      setSelectedRows(allIndices);
    }
  };

  const toggleSelectRow = (index) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedRows(newSelection);
  };

  const sendEmails = async () => {
    if (!smtpConfig.pass) {
      alert('Please enter the email password.');
      return;
    }

    setSending(true);
    let sentCount = 0;
    let failedCount = 0;

    // Determine which rows to process
    // If selection exists, use it. Otherwise, use all rows.
    const indicesToProcess = selectedRows.size > 0
      ? Array.from(selectedRows).sort((a, b) => a - b)
      : data.map((_, i) => i);

    const totalToProcess = indicesToProcess.length;
    let processedSoFar = 0;

    for (const i of indicesToProcess) {
      const row = data[i];
      if (row.status === 'success') {
        processedSoFar++;
        continue; // Skip already sent
      }

      // Auto-correct domain typos at send time (safety net if row wasn't corrected at upload)
      const rawEmailAddress = (row['email Address'] || row['email'] || '').toString().trim();
      const { email: correctedRaw, wasFixed: domainWasFixed, originalDomain: origDomain } = correctEmailDomain(rawEmailAddress);
      if (domainWasFixed) {
        setData(prev => {
          const newData = [...prev];
          newData[i] = { ...newData[i], 'email Address': correctedRaw, domainCorrected: true, originalEmail: rawEmailAddress, correctionNote: 'Typo error corrected on domain name' };
          return newData;
        });
        setLogs(prev => [...prev, `⚠️ Typo corrected: ${rawEmailAddress} → ${correctedRaw}`]);
      }
      const emailAddress = correctedRaw.toLowerCase().trim();

      if (isGroupEmail(emailAddress)) {
        setData(prev => {
          const newData = [...prev];
          newData[i] = { ...newData[i], status: 'error', error: 'Group email not allowed' };
          return newData;
        });
        failedCount++;
        setLogs(prev => [...prev, `❌ Skip sending to ${row['Full Name']} (${emailAddress}): Group email not allowed`]);
        processedSoFar++;
        setProgress({ sent: sentCount, total: totalToProcess, failed: failedCount });
        continue;
      }



      try {
        setLogs(prev => [...prev, `Sending to ${row['Full Name']}...`]);

        const response = await apiFetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowData: row,
            smtpConfig,
            template: emailTemplate,
            // We pass font settings, but the rich text editor might override them inline
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px'
          }),
        });

        if (!response.ok && (response.status === 401 || response.status === 403)) {
          return; // api:unauthorized event already fired by apiFetch
        }

        const result = await response.json();

        if (response.ok && result.success) {
          setData(prev => {
            const newData = [...prev];
            newData[i] = { ...newData[i], status: 'success' };
            return newData;
          });
          sentCount++;
          setLogs(prev => [...prev, `✅ Sent to ${row['Full Name']}`]);
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      } catch (error) {
        console.error('Send error:', error);
        setData(prev => {
          const newData = [...prev];
          newData[i] = { ...newData[i], status: 'error', error: error.message };
          return newData;
        });
        failedCount++;
        setLogs(prev => [...prev, `❌ Failed to ${row['Full Name']}: ${error.message}`]);
      }

      processedSoFar++;
      setProgress({ sent: sentCount, total: totalToProcess, failed: failedCount });

      // Rate limiting: wait 2 seconds between emails to avoid SMTP errors
      if (i !== indicesToProcess[indicesToProcess.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setSending(false);
    setLogs(prev => [...prev, `Finished. Sent: ${sentCount}, Failed: ${failedCount}`]);
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Email Sender App</h1>
          <p className="subtitle">Securely send personalized emails from Excel lists</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {user && user.role === 'admin' && (
            <button className="btn btn-secondary" onClick={() => setShowUserMgmt(true)}>👥 Users</button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowGuide(true)}>📖 User Guide</button>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ backgroundColor: '#dc3545', borderColor: '#dc3545', color: 'white' }}>Logout</button>
        </div>
      </header>

      {popupMessage && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', padding: '20px 30px', borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', textAlign: 'center', minWidth: '300px',
            color: '#333'
          }}>
            <h3 style={{ marginTop: 0 }}>Connection Status</h3>
            <p style={{ fontSize: '16px', margin: '20px 0' }}>{popupMessage}</p>
            <button className="btn" onClick={() => setPopupMessage(null)}>OK</button>
          </div>
        </div>
      )}

      {showUserMgmt && <UserManagement token={token} onClose={() => setShowUserMgmt(false)} />}

      {showGuide && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', padding: '30px', borderRadius: '8px',
            maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
            position: 'relative', color: '#333'
          }}>
            <button
              onClick={() => setShowGuide(false)}
              style={{
                position: 'absolute', top: '15px', right: '15px',
                background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer'
              }}
            >
              &times;
            </button>

            <h2>Email Sender App - User Guide</h2>
            <hr style={{ margin: '15px 0', border: 'none', borderTop: '1px solid #eee' }} />

            <h3>1. SMTP Configuration</h3>
            <p>Configure the email server you want to use for sending.</p>
            <ul>
              <li><strong>Host</strong>: The SMTP server address (e.g., <code>mail.ethiopianairlines.com</code>).</li>
              <li><strong>Port</strong>: Usually <code>587</code> (TLS) or <code>465</code> (SSL).</li>
              <li><strong>Email Address</strong>: Your sender email.</li>
              <li><strong>Password</strong>: Your email password.</li>
              <li><strong>Secure Connection</strong>: Check this box if you are using Port 465 (SSL).</li>
              <li><strong>Test Connection</strong>: Click this to verify your settings before sending.</li>
            </ul>

            <h3>2. Upload Excel File</h3>
            <ul>
              <li><strong>Drag & Drop</strong> or <strong>Click</strong> to select Excel files (<code>.xlsx</code>, <code>.xls</code>).</li>
              <li><strong>Multiple Files</strong>: You can select multiple files at once; they will be combined.</li>
              <li><strong>Duplicate Removal</strong>: The app automatically checks for duplicate email addresses and skips them.</li>
              <li><strong>Reset</strong>: If you delete all rows from the preview, the upload button resets.</li>
            </ul>
            <p><strong>Supported Columns:</strong> Full Name, Email Address, User ID, Password, ID #.</p>

            <h3>3. Email Template (Rich Text)</h3>
            <p>Customize your email message.</p>
            <ul>
              <li><strong>Rich Text Editor</strong>: Use the toolbar to <strong>Bold</strong>, <em>Italicize</em>, or Underline text.</li>
              <li><strong>Fonts</strong>: Change the Font Family and Size for specific text selections.</li>
              <li><strong>Placeholders</strong>: <code>[Full Name]</code>, <code>[User ID]</code>, <code>[Password]</code>, <code>[Email]</code>, <code>[ID]</code>.</li>
            </ul>

            <h3>4. Preview & Send</h3>
            <ul>
              <li><strong>Edit/Delete</strong>: Manage recipients directly in the table.</li>
              <li><strong>Select Recipients</strong>: Check boxes to send to specific people. If NONE are checked, it sends to ALL.</li>
              <li><strong>Send</strong>: Click "Send Emails" to start.</li>
            </ul>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn" onClick={() => setShowGuide(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>1. SMTP Configuration</h2>
          <button className="btn btn-secondary" onClick={testConnection}>Test Connection</button>
        </div>
        <div className="config-grid">
          <div className="form-group">
            <label>Host</label>
            <input
              type="text"
              name="host"
              value={smtpConfig.host}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Port</label>
            <input
              type="number"
              name="port"
              value={smtpConfig.port}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              name="user"
              value={smtpConfig.user}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              name="pass"
              value={smtpConfig.pass}
              readOnly
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onPaste={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}
              placeholder="Enter email password"
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'default' }}>
              <input
                type="checkbox"
                name="secure"
                checked={smtpConfig.secure || false}
                disabled
                style={{ width: 'auto' }}
              />
              Use Secure Connection (SSL/TLS) - Check this for Port 465
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>2. Upload Excel File</h2>
        <div className="upload-area">
          <input
            type="file"
            accept=".xlsx, .xls"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="file-upload"
          />
          <label htmlFor="file-upload" className="btn">
            {file ? file.name : 'Choose Excel File'}
          </label>
          <p style={{ marginTop: '10px', color: '#666' }}>
            Supported formats: .xlsx, .xls
          </p>
        </div>
      </div>

      <div className="card">
        <h2>3. Email Template (Rich Text)</h2>
        <div className="toolbar" style={{ display: 'flex', gap: '10px', marginBottom: '10px', padding: '5px', background: '#f5f5f5', borderRadius: '4px' }}>
          <button className="btn-small" onClick={() => execCommand('bold')} style={{ fontWeight: 'bold' }}>B</button>
          <button className="btn-small" onClick={() => execCommand('italic')} style={{ fontStyle: 'italic' }}>I</button>
          <button className="btn-small" onClick={() => execCommand('underline')} style={{ textDecoration: 'underline' }}>U</button>

          <select onChange={(e) => execCommand('fontName', e.target.value)} style={{ padding: '5px' }}>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Verdana">Verdana</option>
            <option value="Courier New">Courier New</option>
          </select>

          <select onChange={(e) => execCommand('fontSize', e.target.value)} style={{ padding: '5px' }}>
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">Huge</option>
          </select>
        </div>

        <div
          className="rich-editor"
          contentEditable
          onInput={(e) => setEmailTemplate(e.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: emailTemplate }}
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: 'white',
            overflowY: 'auto'
          }}
        />
        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
          Use [Full Name], [User ID], [Password], [Email] as placeholders.
        </p>
      </div>

      {data.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>4. Preview & Send</h2>
            <button
              className="btn"
              onClick={sendEmails}
              disabled={sending || !smtpConfig.pass}
            >
              {sending ? 'Sending...' : `Send ${selectedRows.size > 0 ? selectedRows.size : 'ALL'} Emails`}
            </button>
          </div>

          {sending && (
            <div className="form-group">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${((progress.sent + progress.failed) / progress.total) * 100}%` }}
                ></div>
              </div>
              <p style={{ textAlign: 'center', marginTop: '5px' }}>
                {progress.sent} Sent, {progress.failed} Failed of {progress.total}
              </p>
            </div>
          )}

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedRows.size === data.length && data.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Email Address</th>
                  <th>User ID</th>
                  <th>Password</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={index} className={selectedRows.has(index) ? 'selected-row' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(index)}
                        onChange={() => toggleSelectRow(index)}
                      />
                    </td>
                    {editingId === index ? (
                      <>
                        <th>ID</th>
                        <td>{row['ID #'] || row['No.']}</td>
                        <td><input type="text" value={editFormData['Full Name'] || ''} onChange={(e) => handleEditChange(e, 'Full Name')} /></td>
                        <td><input type="text" value={editFormData['email Address'] || ''} onChange={(e) => handleEditChange(e, 'email Address')} /></td>
                        <td><input type="text" value={editFormData['Use ID'] || ''} onChange={(e) => handleEditChange(e, 'Use ID')} /></td>
                        <td><input type="text" value={editFormData['Password'] || ''} onChange={(e) => handleEditChange(e, 'Password')} placeholder="Password" /></td>
                        <td>{row.status}</td>
                        <td>
                          <button className="btn status-success" style={{ marginRight: '5px', padding: '5px 10px' }} onClick={() => saveEdit(index)}>Save</button>
                          <button className="btn status-error" style={{ padding: '5px 10px' }} onClick={cancelEdit}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{row['ID #'] || row['No.']}</td>
                        <td>{row['Full Name']}</td>
                        <td>
                          {row['email Address']}
                          {row.domainCorrected && (
                            <div style={{ fontSize: '0.72rem', color: '#856404', background: '#fff3cd', border: '1px solid #ffc107', padding: '2px 7px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}
                              title={`Original: ${row.originalEmail}`}>
                              ⚠️ Typo error corrected on domain name
                            </div>
                          )}
                        </td>
                        <td>{row['Use ID']}</td>
                        <td>
                          {row['Password'] ? (
                            <span title="Password present">******</span>
                          ) : (
                            <span className="status-badge status-error">Empty</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge status-${row.status}`} title={row.error || ''}>
                            {row.status}
                          </span>
                          {row.error && (
                            <div style={{ fontSize: '0.75rem', color: '#d93025', marginTop: '4px' }}>
                              {row.error}
                            </div>
                          )}
                        </td>
                        <td>
                          <button className="btn status-pending" style={{ marginRight: '5px', padding: '5px 10px', fontSize: '0.8rem' }} onClick={() => startEdit(index, row)}>Edit</button>
                          <button className="btn status-error" style={{ padding: '5px 10px', fontSize: '0.8rem' }} onClick={() => deleteRow(index)}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>📬 Sent Email History</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={fetchSentHistory}>
              {showHistory ? '🔄 Refresh' : '📋 View History'}
            </button>
            {showHistory && sentEmailHistory.length > 0 && (
              <button className="btn" onClick={exportToCSV} style={{ backgroundColor: '#28a745', borderColor: '#28a745', color: 'white' }}>
                📥 Export CSV
              </button>
            )}
            {showHistory && user && user.role === 'admin' && (
              <button className="btn" onClick={clearSentHistory} style={{ backgroundColor: '#dc3545', borderColor: '#dc3545', color: 'white' }}>
                🗑️ Clear History
              </button>
            )}
          </div>
        </div>

        {showHistory && (
          sentEmailHistory.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No sent emails recorded yet.</p>
          ) : (
            <div className="table-container">
              <p style={{ marginBottom: '10px', color: '#666' }}>Total: {sentEmailHistory.length} email(s) sent</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Recipient</th>
                    <th>Email</th>
                    <th>User ID</th>
                    <th>Sent By</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sentEmailHistory.map((email, index) => (
                    <tr key={email.id}>
                      <td>{index + 1}</td>
                      <td>{email.recipient_name}</td>
                      <td>{email.recipient_email}</td>
                      <td>{email.user_id}</td>
                      <td>{email.sent_by}</td>
                      <td>{new Date(email.sent_at).toLocaleString()}</td>
                      <td>
                        <span className={`status-badge status-${email.status === 'sent' ? 'success' : 'error'}`}>
                          {email.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div className="card">
        <h2>Activity Log</h2>
        <div className="log-area">
          {logs.length === 0 ? <p style={{ color: '#999' }}>No activity yet.</p> : (
            logs.map((log, i) => (
              <div key={i} className="log-item">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
