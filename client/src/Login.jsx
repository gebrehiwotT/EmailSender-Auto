import React, { useState } from 'react';
import { apiFetch } from './api';

function Login({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const response = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                onLogin(data.user, data.token);
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
    };

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: '100vh', backgroundColor: '#f0f2f5'
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#006400' }}>Email Sender Login</h2>
                {error && <div className="status-error" style={{ padding: '10px', marginBottom: '15px', borderRadius: '4px' }}>{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px' }}
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px' }}
                        />
                    </div>
                    <button type="submit" className="btn" style={{ width: '100%', marginTop: '10px' }}>Login</button>
                </form>
            </div>
        </div>
    );
}

export default Login;
