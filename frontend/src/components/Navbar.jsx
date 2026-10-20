import React, { useState, useEffect } from 'react';
import { Shield, FileText, Users, Activity, LogOut, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { authApi } from '../api/authApi';
import { systemApi } from '../api/systemApi';

export default function Navbar({ activePage, setActivePage, onOpenHealthModal }) {
  const user = authApi.getCurrentUser();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    try {
      const data = await systemApi.getSystemHealth();
      setHealth(data);
    } catch (e) {
      setHealth(null);
    }
  };

  const handleLogout = () => {
    authApi.logout();
    window.location.reload();
  };

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 28px',
      background: 'rgba(17, 24, 39, 0.85)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <div 
          onClick={() => setActivePage('clients')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563eb, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(37, 99, 235, 0.4)'
          }}>
            <Shield size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
              Twin<span style={{ color: '#60a5fa' }}>Cover</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
              Commercial Risk Suite
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setActivePage('clients')}
            className={`btn ${activePage === 'clients' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '13.5px', padding: '6px 14px' }}
          >
            <Users size={16} />
            Clients
          </button>
          <button
            onClick={() => setActivePage('templates')}
            className={`btn ${activePage === 'templates' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '13.5px', padding: '6px 14px' }}
          >
            <FileText size={16} />
            Letter Templates
          </button>
        </nav>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* System Health Pill */}
        <button
          onClick={onOpenHealthModal}
          className="btn btn-secondary btn-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(30, 41, 59, 0.6)',
            borderColor: health ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
          }}
          title="Click to view Local AI & Microservice Connectivity"
        >
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: health?.all_operational ? '#10b981' : '#f59e0b',
            boxShadow: health?.all_operational ? '0 0 6px #10b981' : '0 0 6px #f59e0b'
          }} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            System Core: {health?.all_operational ? 'Active' : 'Checking...'}
          </span>
          <Activity size={13} color="var(--text-muted)" />
        </button>

        {/* User Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.full_name || 'Commercial Broker'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {user?.agency_name || 'Apex Advisors'}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-ghost btn-sm"
            style={{ padding: '7px', color: 'var(--text-muted)' }}
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
