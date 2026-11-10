import React, { useState, useEffect } from 'react';
import {
  Shield,
  FileText,
  Users,
  Activity,
  LogOut,
  BarChart3,
  Home,
  Zap,
  LogIn,
} from 'lucide-react';
import { authApi } from '../api/authApi';
import { systemApi } from '../api/systemApi';

export default function Navbar({
  activePage,
  setActivePage,
  onOpenHealthModal,
  isAuthenticated,
  onDemoLoginSuccess,
}) {
  const user = authApi.getCurrentUser();
  const [health, setHealth] = useState(null);
  const [launchingDemo, setLaunchingDemo] = useState(false);

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

  const handleQuickDemo = async () => {
    setLaunchingDemo(true);
    try {
      await authApi.login('broker@twincover.com', 'TwinCover2026!');
      if (onDemoLoginSuccess) {
        onDemoLoginSuccess();
      }
    } catch (e) {
      setActivePage('login');
    } finally {
      setLaunchingDemo(false);
    }
  };

  const navItemStyle = (isActive) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 13px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: isActive ? 700 : 500,
    background: isActive ? '#FFFFFF' : 'transparent',
    color: isActive ? '#0F172A' : '#475569',
    border: 'none',
    boxShadow: isActive ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 24px',
      background: 'rgba(255, 255, 255, 0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #E2E8F0',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      flexWrap: 'wrap',
      gap: '12px',
    }}>
      {/* Left: Brand + TwinFlow-Style Segmented Nav Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap' }}>
        <div
          onClick={() => setActivePage('home')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
          }}>
            <Shield size={20} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A' }}>
              Twin<span style={{ color: '#2563EB' }}>Cover</span>
            </div>
            <div style={{ fontSize: '10px', color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700 }}>
              Sovereign Risk Suite
            </div>
          </div>
        </div>

        {/* Segmented Pill Navigation (TwinFlow Style) */}
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: '#F1F5F9',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
        }}>
          <button
            type="button"
            onClick={() => setActivePage('home')}
            style={navItemStyle(activePage === 'home')}
          >
            <Home size={14} />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage(isAuthenticated ? 'clients' : 'login')}
            style={navItemStyle(activePage === 'clients' || activePage === 'workspace')}
          >
            <Users size={14} />
            <span>Clients & Intake</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage(isAuthenticated ? 'templates' : 'login')}
            style={navItemStyle(activePage === 'templates')}
          >
            <FileText size={14} />
            <span>Letter Templates</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage(isAuthenticated ? 'admin' : 'login')}
            style={navItemStyle(activePage === 'admin')}
          >
            <BarChart3 size={14} />
            <span>Demo Analytics</span>
          </button>
        </nav>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* System Health Pill */}
        <button
          type="button"
          onClick={onOpenHealthModal}
          className="btn btn-secondary btn-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: health?.all_operational ? '#ECFDF5' : '#FFFBEB',
            borderColor: health?.all_operational ? '#A7F3D0' : '#FDE68A',
            color: health?.all_operational ? '#047857' : '#B45309',
            borderRadius: '999px',
            padding: '5px 12px',
          }}
          title="Click to inspect Local Sovereign AI Node & Microservice Connectivity"
        >
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: health?.all_operational ? '#10B981' : '#F59E0B',
          }} />
          <span style={{ fontSize: '12px', fontWeight: 600 }}>
            Sovereign Node: {health?.all_operational ? 'Online' : 'Checking...'}
          </span>
          <Activity size={13} />
        </button>

        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '8px', borderLeft: '1px solid #E2E8F0' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                {user?.full_name || 'Commercial Broker'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                {user?.agency_name || 'Apex Advisors'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-ghost btn-sm"
              style={{ padding: '7px', color: '#64748B' }}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActivePage('login')}
              className="btn btn-secondary btn-sm"
            >
              <LogIn size={14} />
              <span>Sign In</span>
            </button>

            <button
              type="button"
              onClick={handleQuickDemo}
              disabled={launchingDemo}
              className="btn btn-primary btn-sm"
            >
              <Zap size={14} />
              <span>{launchingDemo ? 'Loading...' : 'Launch Demo'}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
