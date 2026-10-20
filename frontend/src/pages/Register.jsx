import React, { useState } from 'react';
import { Shield, Lock, Mail, Building, User, ArrowRight, AlertCircle } from 'lucide-react';
import { authApi } from '../api/authApi';

export default function Register({ onRegisterSuccess, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [agencyName, setAgencyName] = useState('TwinCover Commercial Advisors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.register(email, password, fullName, agencyName);
      onRegisterSuccess();
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '36px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb, #6366f1)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
            marginBottom: '10px'
          }}>
            <Shield size={24} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc' }}>
            Register Broker Account
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Set up tenant-isolated commercial workspace
          </p>
        </div>

        {error && (
          <div style={{
            marginBottom: '18px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-error-bg)',
            color: 'var(--status-error-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name & Title</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Marcus Vance, Account Executive"
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Brokerage / Agency Name</label>
            <div style={{ position: 'relative' }}>
              <Building size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                required
                value={agencyName}
                onChange={e => setAgencyName(e.target.value)}
                placeholder="Apex Commercial Insurance Partners"
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Work Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="broker@agency.com"
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '22px' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px', fontSize: '14.5px' }}
          >
            <span>{loading ? 'Registering...' : 'Create Broker Account'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Already registered?{' '}
          <span
            onClick={onSwitchToLogin}
            style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign In
          </span>
        </div>
      </div>
    </div>
  );
}
