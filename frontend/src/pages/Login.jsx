import React, { useState } from 'react';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, KeyRound, Sparkles } from 'lucide-react';
import { authApi } from '../api/authApi';

export default function Login({ onLoginSuccess, onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.login(email, password);
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleUseDemo = () => {
    setEmail('broker@twincover.com');
    setPassword('TwinCover2026!');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '36px 32px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #2563eb, #6366f1)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
            marginBottom: '12px'
          }}>
            <Shield size={26} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Twin<span style={{ color: '#60a5fa' }}>Cover</span>
          </h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Commercial Insurance Broker Policy Verification Suite
          </p>
        </div>

        {error && (
          <div style={{
            marginBottom: '18px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
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
            <label className="form-label">Broker Email</label>
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
            <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Credentials Quick Button */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleUseDemo}
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', gap: '6px', fontSize: '12.5px', background: 'rgba(59, 130, 246, 0.08)', color: '#93c5fd' }}
          >
            <KeyRound size={14} />
            Fill Demo Principal Account (broker@twincover.com)
          </button>
        </div>

        {/* Register Link */}
        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Need an account?{' '}
          <span
            onClick={onSwitchToRegister}
            style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}
          >
            Create Broker Account
          </span>
        </div>
      </div>
    </div>
  );
}
