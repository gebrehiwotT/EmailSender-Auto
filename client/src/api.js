/**
 * api.js — Centralized API Client
 *
 * All HTTP calls go through this module so that:
 *  - The base URL is read from the environment (empty in production = same-origin)
 *  - Auth headers are attached automatically
 *  - 401/403 responses trigger a global logout event
 *
 * Usage:
 *   import { apiFetch } from './api';
 *   const res = await apiFetch('/api/users', { headers: { ... } });
 */

// In production the React build is served by Express on the same origin,
// so the base URL is empty and all /api/* calls go to the same host:port.
// In development, Vite proxies /api/* to VITE_API_BASE_URL (see vite.config.js).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Drop-in wrapper around fetch() that:
 *  - Prepends the base URL
 *  - Automatically adds Authorization header from localStorage
 *  - Dispatches a 'api:unauthorized' event on 401/403 so App.jsx can log out
 *
 * @param {string} path   - API path, e.g. '/api/users'
 * @param {RequestInit} options - Standard fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('token');

    const headers = {
        ...(options.headers || {}),
    };

    // Attach bearer token if available (skip for FormData — let browser set multipart boundary)
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    // Dispatch a global event so App.jsx can handle session expiry centrally
    if (response.status === 401 || response.status === 403) {
        window.dispatchEvent(new CustomEvent('api:unauthorized'));
    }

    return response;
}

/**
 * Fetches the server-side configuration (SMTP defaults from .env).
 * Called once on app load so credentials are never baked into the bundle.
 *
 * @returns {Promise<{ smtp: { host, port, user, pass, secure } }>}
 */
export async function fetchServerConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('[api] Could not load server config:', err.message);
        return { smtp: { host: '', port: 587, user: '', pass: '', secure: false } };
    }
}
