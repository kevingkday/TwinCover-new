import React, { useState, useEffect } from 'react';
import { 
  Users, FileText, CheckCircle2, Shield, Database, RefreshCw, 
  Search, ArrowUpRight, Clock, Building, Mail, Sparkles, Layers,
  HardDrive, BarChart3, AlertCircle
} from 'lucide-react';
import { systemApi } from '../api/systemApi';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('brokers'); // 'brokers' | 'policies' | 'letters' | 'database'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await systemApi.getAdminOverview();
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load admin metrics');
    } finally {
      setLoading(false);
    }
  };

  const filteredBrokers = data?.brokers?.filter(b => 
    b.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.agency_name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredPolicies = data?.recent_policies?.filter(p => 
    p.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.broker_name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredLetters = data?.recent_letters?.filter(l => 
    l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.broker_name?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              Live Platform Engagement
            </span>
            <span style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} /> Local DB Active
            </span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
            Demo & Broker Engagement Overview
          </h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time tracking of broker signups, active client accounts, policy uploads, and generated renewal letters.
          </p>
        </div>

        <button 
          onClick={loadData} 
          disabled={loading}
          className="btn btn-secondary" 
          style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '16px', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 5 Key Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {/* Card 1 */}
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#93c5fd', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Registered Brokers</span>
            <Users size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#f8fafc' }}>
            {loading ? '...' : (data?.metrics?.total_brokers ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Total broker accounts
          </div>
        </div>

        {/* Card 2 */}
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c084fc', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Commercial Clients</span>
            <Building size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#f8fafc' }}>
            {loading ? '...' : (data?.metrics?.total_clients ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Active commercial accounts
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fbbf24', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Policies Ingested</span>
            <FileText size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#f8fafc' }}>
            {loading ? '...' : (data?.metrics?.total_policies ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            PDF declarations processed
          </div>
        </div>

        {/* Card 4 */}
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#34d399', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Verified Schedules</span>
            <CheckCircle2 size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#f8fafc' }}>
            {loading ? '...' : (data?.metrics?.total_verified_policies ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Broker-verified policies
          </div>
        </div>

        {/* Card 5 */}
        <div className="glass-panel" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#f472b6', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Renewal Letters</span>
            <Sparkles size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#f8fafc' }}>
            {loading ? '...' : (data?.metrics?.total_letters_generated ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Drafted & exported letters
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        {/* Navigation Tabs & Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('brokers')}
              className={`btn btn-sm ${activeTab === 'brokers' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 14px' }}
            >
              <Users size={15} /> Brokers ({data?.brokers?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('policies')}
              className={`btn btn-sm ${activeTab === 'policies' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 14px' }}
            >
              <FileText size={15} /> Recent Policies ({data?.recent_policies?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('letters')}
              className={`btn btn-sm ${activeTab === 'letters' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 14px' }}
            >
              <Sparkles size={15} /> Generated Letters ({data?.recent_letters?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`btn btn-sm ${activeTab === 'database' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '6px 14px' }}
            >
              <Database size={15} /> Database Tables
            </button>
          </div>

          {activeTab !== 'database' && (
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filter results..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
              />
            </div>
          )}
        </div>

        {/* Tab 1: Registered Brokers */}
        {activeTab === 'brokers' && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Broker Name</th>
                  <th style={{ padding: '10px 12px' }}>Agency / Firm</th>
                  <th style={{ padding: '10px 12px' }}>Email Address</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Clients</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Policies</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Letters Drafted</th>
                  <th style={{ padding: '10px 12px' }}>Signed Up Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredBrokers.map(b => (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '13.5px' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #2563eb, #6366f1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#fff'
                        }}>
                          {b.full_name?.charAt(0) || 'B'}
                        </div>
                        {b.full_name}
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>
                      {b.agency_name}
                    </td>
                    <td style={{ padding: '12px', color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {b.email}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', padding: '2px 8px' }}>
                        {b.client_count}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d', padding: '2px 8px' }}>
                        {b.policy_count}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', padding: '2px 8px' }}>
                        {b.letter_count}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {formatDate(b.created_at)}
                    </td>
                  </tr>
                ))}
                {filteredBrokers.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No brokers found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Recent Policy Uploads */}
        {activeTab === 'policies' && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Policy File</th>
                  <th style={{ padding: '10px 12px' }}>Client</th>
                  <th style={{ padding: '10px 12px' }}>Uploaded By Broker</th>
                  <th style={{ padding: '10px 12px' }}>Size</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Uploaded At</th>
                </tr>
              </thead>
              <tbody>
                {filteredPolicies.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '13.5px' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#93c5fd' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color="#60a5fa" />
                        <span>{p.filename}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: '#f8fafc' }}>
                      {p.client_name}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ color: '#cbd5e1' }}>{p.broker_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.broker_agency}</div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {formatFileSize(p.file_size)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {p.status === 'verified' ? (
                        <span className="badge badge-success" style={{ fontSize: '11px' }}>
                          Verified
                        </span>
                      ) : p.status === 'processing' ? (
                        <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                          Processing
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontSize: '11px' }}>
                          {p.status}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {formatDate(p.uploaded_at)}
                    </td>
                  </tr>
                ))}
                {filteredPolicies.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No policies uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Generated Letters */}
        {activeTab === 'letters' && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Letter Title</th>
                  <th style={{ padding: '10px 12px' }}>Commercial Client</th>
                  <th style={{ padding: '10px 12px' }}>Drafted By Broker</th>
                  <th style={{ padding: '10px 12px' }}>Drafted Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredLetters.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '13.5px' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={15} color="#c084fc" />
                        <span>{l.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: '#93c5fd' }}>
                      {l.client_name}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ color: '#cbd5e1' }}>{l.broker_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{l.broker_agency}</div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {formatDate(l.created_at)}
                    </td>
                  </tr>
                ))}
                {filteredLetters.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      No letters generated yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Database Tables & Engine Inspector */}
        {activeTab === 'database' && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.6))',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HardDrive size={18} color="#60a5fa" />
                  <span>Storage Engine: {data?.database_stats?.database_engine || 'SQLite / twincover.db'}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>
                  Client data and policy schedules are saved locally on disk with zero cloud data retention.
                </div>
              </div>
              <span className="badge badge-success" style={{ padding: '4px 10px' }}>
                Operational & Synced
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Table: users</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                  {data?.database_stats?.users_table ?? 0} rows
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Broker tenant logins and credentials</div>
              </div>

              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Table: clients</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                  {data?.database_stats?.clients_table ?? 0} rows
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Commercial insured client records</div>
              </div>

              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Table: policies</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                  {data?.database_stats?.policies_table ?? 0} rows
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Commercial policy documents & OCR text</div>
              </div>

              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Table: extracted_fields</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                  {data?.database_stats?.extracted_fields_table ?? 0} rows
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Reconciled limits, terms & coverages</div>
              </div>

              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Table: letter_templates</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                  {data?.database_stats?.letter_templates_table ?? 0} rows
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Standard Markdown & Word (.docx) letterheads</div>
              </div>

              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Table: generated_letters</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
                  {data?.database_stats?.generated_letters_table ?? 0} rows
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Client proposal letters drafted & archived</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
