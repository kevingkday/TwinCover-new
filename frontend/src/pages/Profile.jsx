import React, { useState, useEffect } from 'react';
import {
  User,
  Building,
  Mail,
  Save,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Shield,
  Calendar,
} from 'lucide-react';
import { authApi } from '../api/authApi';

export default function Profile({ onProfileUpdated, onLogout }) {
  const cachedUser = authApi.getCurrentUser();
  const [user, setUser] = useState(cachedUser);
  const [fullName, setFullName] = useState(cachedUser?.full_name || '');
  const [agencyName, setAgencyName] = useState(cachedUser?.agency_name || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const freshUser = await authApi.getMe();
        if (!active) return;
        setUser(freshUser);
        setFullName(freshUser.full_name || '');
        setAgencyName(freshUser.agency_name || '');
        if (onProfileUpdated) {
          onProfileUpdated(freshUser);
        }
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Unable to load latest profile details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await authApi.updateProfile({
        full_name: fullName.trim(),
        agency_name: agencyName.trim(),
      });
      setUser(updated);
      setFullName(updated.full_name || '');
      setAgencyName(updated.agency_name || '');
      if (onProfileUpdated) {
        onProfileUpdated(updated);
      }
      setSuccess('Broker and brokerage details updated.');
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const isDemoAccount = user?.email === 'broker@twincover.com';
  const hasChanges =
    fullName.trim() !== (user?.full_name || '') ||
    agencyName.trim() !== (user?.agency_name || '');

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Broker & Brokerage Profile
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            View your signed-in account email and update the broker and brokerage details used across the workspace and letter templates.
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <LogOut size={14} />
          <span>Sign Out / Switch Account</span>
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '28px' }}>
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
            gap: '8px',
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{
            marginBottom: '18px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: '#ECFDF5',
            color: '#065F46',
            border: '1px solid #A7F3D0',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Signed-In Account Email</label>
              {isDemoAccount && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                }}>
                  Demo Account
                </span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="email"
                readOnly
                value={user?.email || ''}
                className="form-input"
                style={{ paddingLeft: '38px', background: '#F8FAFC', color: '#475569', cursor: 'default' }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              {isDemoAccount
                ? 'You are currently signed into the built-in demo broker account. Sign out above to register or sign in with your own email.'
                : 'Your sign-in email cannot be changed here.'}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Full Name & Title</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                required
                disabled={loading || saving}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setSuccess(null);
                }}
                placeholder="e.g. Morgan Mercer, Senior Principal"
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Brokerage / Agency Name</label>
            <div style={{ position: 'relative' }}>
              <Building size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                required
                disabled={loading || saving}
                value={agencyName}
                onChange={(e) => {
                  setAgencyName(e.target.value);
                  setSuccess(null);
                }}
                placeholder="e.g. Apex Commercial Brokerage Partners"
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              Populates your workspace header and the <code>{'{{agency_name}}'}</code> token in generated letters.
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid #E2E8F0',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#64748B' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Shield size={13} />
                Tenant ID #{user?.id ?? '—'}
              </span>
              {user?.created_at && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Calendar size={13} />
                  Created {new Date(user.created_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || saving || !hasChanges}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Save size={15} />
              <span>{saving ? 'Saving...' : 'Save Brokerage Details'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
