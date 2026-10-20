import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, User, ArrowRight, CheckCircle2, Clock, FileText, AlertCircle, X } from 'lucide-react';
import { clientsApi } from '../api/clientsApi';

export default function ClientsList({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    account_number: '',
    primary_contact: '',
    email: '',
    phone: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadClients();
  }, [search]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await clientsApi.listClients(search);
      setClients(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await clientsApi.createClient(newClient);
      setIsModalOpen(false);
      setNewClient({
        name: '',
        account_number: '',
        primary_contact: '',
        email: '',
        phone: '',
        notes: ''
      });
      loadClients();
      if (onSelectClient) {
        onSelectClient(created.id);
      }
    } catch (err) {
      setError(err.message || 'Failed to create client');
    } finally {
      setSubmitting(false);
    }
  };

  const totalClients = clients.length;
  const totalPolicies = clients.reduce((acc, c) => acc + (c.policy_count || 0), 0);
  const totalVerified = clients.reduce((acc, c) => acc + (c.verified_policy_count || 0), 0);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%', padding: '32px 24px' }}>
      {/* Header and Stats */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Commercial Accounts & Policy Ingestion
          </h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Select a commercial client to upload policies, verify schedules, generate renewal letters, and run RAG intelligence.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
          style={{ padding: '9px 18px' }}
        >
          <Plus size={16} />
          <span>Add Commercial Client</span>
        </button>
      </div>

      {/* KPI Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="glass-panel" style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Accounts
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
            {totalClients}
          </div>
          <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '4px' }}>
            Commercial Policyholders
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Policies Ingested
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
            {totalPolicies}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Parsed & Vector Indexed
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Verified Schedules
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#34d399', marginTop: '6px' }}>
            {totalVerified}
          </div>
          <div style={{ fontSize: '12px', color: '#34d399', marginTop: '4px' }}>
            Audited & Confirmed by Broker
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts by business name, account number, or primary contact..."
            className="form-input"
            style={{ paddingLeft: '42px', fontSize: '14px' }}
          />
        </div>
      </div>

      {/* Client Accounts Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading commercial clients...
          </div>
        ) : clients.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Building2 size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              No commercial accounts found
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
              Create your first client account to begin dropping policy schedules.
            </div>
            <button onClick={() => setIsModalOpen(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Add Commercial Client
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Commercial Account</th>
                <th>Account #</th>
                <th>Primary Contact</th>
                <th>Policies Ingested</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14.5px' }}>
                      {c.name}
                    </div>
                    {c.notes && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '320px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {c.notes}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#93c5fd' }}>
                      {c.account_number}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: '13.5px' }}>{c.primary_contact || '—'}</div>
                    {c.email && (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {c.email}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{c.policy_count || 0}</span>
                      {c.verified_policy_count > 0 ? (
                        <span className="badge badge-verified" style={{ fontSize: '11px' }}>
                          <CheckCircle2 size={12} /> {c.verified_policy_count} verified
                        </span>
                      ) : (
                        <span className="badge badge-pending" style={{ fontSize: '11px' }}>
                          <Clock size={12} /> Pending audit
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-blue">
                      {c.status || 'Active'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => onSelectClient(c.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ gap: '6px' }}
                    >
                      <span>Open Workspace</span>
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="#3b82f6" />
                <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Add Commercial Account</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div style={{
                marginBottom: '14px',
                padding: '10px',
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

            <form onSubmit={handleCreateClient}>
              <div className="form-group">
                <label className="form-label">Client / Insured Business Name *</label>
                <input
                  type="text"
                  required
                  value={newClient.name}
                  onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="e.g. Apex Logistics Ltd"
                  className="form-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Account Number (Optional)</label>
                  <input
                    type="text"
                    value={newClient.account_number}
                    onChange={e => setNewClient({ ...newClient, account_number: e.target.value })}
                    placeholder="e.g. APX-84920"
                    className="form-input mono"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Primary Contact & Title</label>
                  <input
                    type="text"
                    value={newClient.primary_contact}
                    onChange={e => setNewClient({ ...newClient, primary_contact: e.target.value })}
                    placeholder="e.g. Marcus Vance, CFO"
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Contact Email</label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                    placeholder="mvance@apexlogistics.demo"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Phone</label>
                  <input
                    type="text"
                    value={newClient.phone}
                    onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                    placeholder="(415) 890-4412"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '22px' }}>
                <label className="form-label">Account Risk Profile & Operational Notes</label>
                <textarea
                  rows={3}
                  value={newClient.notes}
                  onChange={e => setNewClient({ ...newClient, notes: e.target.value })}
                  placeholder="e.g. 45 freight tractors, cold-chain distribution, high-value cyber retention risk."
                  className="form-textarea"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
