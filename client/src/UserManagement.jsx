import React, { useState, useEffect } from 'react';
import { apiFetch } from './api';

function UserManagement({ token, onClose }) {
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
    const [msg, setMsg] = useState('');

    const fetchUsers = async () => {
        try {
            const response = await apiFetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.users) setUsers(data.users);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const response = await apiFetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newUser)
            });
            const result = await response.json();
            if (response.ok) {
                setMsg('User created successfully');
                setNewUser({ username: '', password: '', role: 'user' });
                fetchUsers();
            } else {
                setMsg(`Error: ${result.error}`);
            }
        } catch (error) {
            setMsg('Network error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            const response = await apiFetch(`/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                fetchUsers();
            }
        } catch (error) {
            console.error('Error deleting user:', error);
        }
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1100,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div className="modal-content" style={{
                backgroundColor: 'white', padding: '30px', borderRadius: '8px',
                maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
                position: 'relative', color: '#333'
            }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '15px', right: '15px',
                        background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer'
                    }}
                >
                    &times;
                </button>

                <h2>User Management</h2>

                <div style={{ marginBottom: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '4px' }}>
                    <h3>Add New User</h3>
                    {msg && <p style={{ color: msg.includes('Error') ? 'red' : 'green' }}>{msg}</p>}
                    <form onSubmit={handleCreate} style={{ display: 'grid', gap: '10px' }}>
                        <input
                            type="text" placeholder="Username" required
                            value={newUser.username}
                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                            style={{ padding: '8px' }}
                        />
                        <input
                            type="password" placeholder="Password" required
                            value={newUser.password}
                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            style={{ padding: '8px' }}
                        />
                        <select
                            value={newUser.role}
                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                            style={{ padding: '8px' }}
                        >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button type="submit" className="btn">Create User</button>
                    </form>
                </div>

                <h3>Existing Users</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                            <th style={{ padding: '8px' }}>Username</th>
                            <th style={{ padding: '8px' }}>Role</th>
                            <th style={{ padding: '8px' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '8px' }}>{u.username}</td>
                                <td style={{ padding: '8px' }}>{u.role}</td>
                                <td style={{ padding: '8px' }}>
                                    {u.username !== 'admin' && (
                                        <button
                                            onClick={() => handleDelete(u.id)}
                                            style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}
                                        >
                                            Delete
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default UserManagement;
