import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Building2, FileText, CheckCircle2, Clock, 
  Sparkles, Download, Trash2, Shield, HelpCircle, History, 
  ExternalLink, UploadCloud, RefreshCw 
} from 'lucide-react';
import { clientsApi } from '../api/clientsApi';
import { policiesApi } from '../api/policiesApi';
import { lettersApi } from '../api/lettersApi';
import DragDropUpload from '../components/DragDropUpload';
import SideBySideReview from '../components/SideBySideReview';
import LetterGenerator from '../components/LetterGenerator';
import ClientRagDrawer from '../components/ClientRagDrawer';

export default function ClientWorkspace({ clientId, onBack }) {
  const [client, setClient] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [activeTab, setActiveTab] = useState('intake'); // 'intake' | 'review' | 'letters' | 'rag' | 'history'
  const [loading, setLoading] = useState(true);
  const [lettersHistory, setLettersHistory] = useState([]);

  useEffect(() => {
    loadWorkspace();
  }, [clientId]);

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      const clientData = await clientsApi.getClient(clientId);
      setClient(clientData);

      const pols = await policiesApi.getClientPolicies(clientId);
      setPolicies(pols);

      if (pols.length > 0) {
        // Fetch full policy detail for the first policy (including raw_text)
        const detailed = await policiesApi.getPolicy(pols[0].id);
        setSelectedPolicy(detailed);
      }

      loadLettersHistory();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLettersHistory = async () => {
    try {
      const hist = await lettersApi.getLetterHistory(clientId);
      setLettersHistory(hist);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPolicy = async (policyId) => {
    try {
      const detailed = await policiesApi.getPolicy(policyId);
      setSelectedPolicy(detailed);
      setActiveTab('review');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadSuccess = async (newPolicy) => {
    const pols = await policiesApi.getClientPolicies(clientId);
    setPolicies(pols);
    const detailed = await policiesApi.getPolicy(newPolicy.id);
    setSelectedPolicy(detailed);
    setActiveTab('review');
  };

  const handleDeletePolicy = async (policyId) => {
    if (!window.confirm('Are you sure you want to delete this policy schedule?')) return;
    try {
      await policiesApi.deletePolicy(policyId);
      const pols = await policiesApi.getClientPolicies(clientId);
      setPolicies(pols);
      if (selectedPolicy?.id === policyId) {
        if (pols.length > 0) {
          const detailed = await policiesApi.getPolicy(pols[0].id);
          setSelectedPolicy(detailed);
        } else {
          setSelectedPolicy(null);
        }
      }
    } catch (err) {
      alert('Failed to delete policy: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="animate-spin" color="#3b82f6" />
        <div style={{ marginTop: '12px', fontSize: '14px' }}>Loading client workspace...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div>Client record not found</div>
        <button onClick={onBack} className="btn btn-secondary" style={{ marginTop: '12px' }}>
          Back to Clients
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '24px 28px' }}>
      {/* Top Header Card */}
      <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={onBack}
              className="btn btn-secondary btn-sm"
              style={{ padding: '8px' }}
              title="Return to Clients List"
            >
              <ArrowLeft size={16} />
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                  {client.name}
                </h1>
                <span className="badge badge-blue">
                  {client.account_number}
                </span>
                <span className="badge badge-verified">
                  {client.status}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginTop: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                {client.primary_contact && <span>👤 Contact: <strong style={{ color: 'var(--text-secondary)' }}>{client.primary_contact}</strong></span>}
                {client.email && <span>✉️ {client.email}</span>}
                {client.phone && <span>📞 {client.phone}</span>}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Policies Ingested
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                {policies.length} Document{policies.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Vector Space
              </div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>
                client_{client.id}
              </div>
            </div>
          </div>
        </div>

        {client.notes && (
          <div style={{
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '12.5px',
            color: 'var(--text-secondary)'
          }}>
            <strong>Account Notes:</strong> {client.notes}
          </div>
        )}
      </div>

      {/* Workspace Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '20px',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveTab('intake')}
          className={`btn ${activeTab === 'intake' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '13.5px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
        >
          <UploadCloud size={16} />
          <span>1. Policy Intake & Ingestion</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>({policies.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('review')}
          className={`btn ${activeTab === 'review' ? 'btn-primary' : 'btn-ghost'}`}
          disabled={!selectedPolicy}
          style={{ fontSize: '13.5px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
        >
          <CheckCircle2 size={16} />
          <span>2. Side-by-Side Review & Verification</span>
          {selectedPolicy?.extracted_fields?.verified ? (
            <span className="badge badge-verified" style={{ fontSize: '10px', padding: '1px 5px' }}>Verified</span>
          ) : (
            <span className="badge badge-pending" style={{ fontSize: '10px', padding: '1px 5px' }}>Pending</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('letters')}
          className={`btn ${activeTab === 'letters' ? 'btn-primary' : 'btn-ghost'}`}
          disabled={!selectedPolicy}
          style={{ fontSize: '13.5px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
        >
          <FileText size={16} />
          <span>3. Renewal Letter Generator</span>
        </button>

        <button
          onClick={() => setActiveTab('rag')}
          className={`btn ${activeTab === 'rag' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '13.5px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
        >
          <Sparkles size={16} />
          <span>4. Client-Scoped Q&A (RAG)</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '13.5px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
        >
          <History size={16} />
          <span>Drafted Letters Archive</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>({lettersHistory.length})</span>
        </button>
      </div>

      {/* Tab 1: Intake & Upload */}
      {activeTab === 'intake' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <DragDropUpload clientId={client.id} onUploadSuccess={handleUploadSuccess} />

          {/* Ingested Policies List */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
              Ingested Policy Schedules for {client.name}
            </div>

            {policies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                No policies uploaded yet. Drop a carrier renewal policy PDF above to begin.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document Filename</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Uploaded At</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="#60a5fa" />
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{p.filename}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {(p.file_size / 1024).toFixed(1)} KB
                      </td>
                      <td>
                        {p.extracted_fields?.verified ? (
                          <span className="badge badge-verified">
                            <CheckCircle2 size={12} /> Verified Schedule
                          </span>
                        ) : (
                          <span className="badge badge-pending">
                            <Clock size={12} /> Pending Verification
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {new Date(p.uploaded_at).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => handleSelectPolicy(p.id)}
                            className="btn btn-primary btn-sm"
                          >
                            Review & Verify
                          </button>
                          <button
                            onClick={() => policiesApi.downloadPolicyPdf(p.id, p.filename)}
                            className="btn btn-secondary btn-sm"
                            title="Download original PDF"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePolicy(p.id)}
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--status-error-text)' }}
                            title="Delete policy"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Side-by-Side Review & Verification */}
      {activeTab === 'review' && selectedPolicy && (
        <div>
          {/* Policy selector dropdown if multiple policies */}
          {policies.length > 1 && (
            <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Viewing Policy:</span>
              <select
                value={selectedPolicy.id}
                onChange={e => handleSelectPolicy(parseInt(e.target.value))}
                className="form-select"
                style={{ width: 'auto', display: 'inline-block' }}
              >
                {policies.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.filename} ({p.extracted_fields?.verified ? 'Verified' : 'Pending'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <SideBySideReview
            policy={selectedPolicy}
            onFieldsSaved={(updatedFields) => {
              setSelectedPolicy(prev => ({
                ...prev,
                status: 'verified',
                extracted_fields: updatedFields
              }));
              // Refresh client policy counts
              clientsApi.getClient(clientId).then(setClient);
            }}
            onNavigateToLetters={() => setActiveTab('letters')}
          />
        </div>
      )}

      {/* Tab 3: Letter Generation */}
      {activeTab === 'letters' && selectedPolicy && (
        <LetterGenerator
          client={client}
          policy={selectedPolicy}
          verifiedFields={selectedPolicy.extracted_fields}
        />
      )}

      {/* Tab 4: Client-Scoped RAG Intelligence */}
      {activeTab === 'rag' && (
        <ClientRagDrawer client={client} />
      )}

      {/* Tab 5: Drafted Letter History */}
      {activeTab === 'history' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            Generated Renewal Letters for {client.name}
          </div>

          {lettersHistory.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No letters generated yet. Go to the Letter Generator tab to draft and save your first renewal summary.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Created At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lettersHistory.map(letItem => (
                  <tr key={letItem.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{letItem.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {letItem.content.slice(0, 100)}...
                      </div>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(letItem.created_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => lettersApi.exportDocx(letItem.title, letItem.content, client.name)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Download size={14} /> .DOCX
                        </button>
                        <button
                          onClick={() => lettersApi.exportPdf(letItem.title, letItem.content, client.name)}
                          className="btn btn-primary btn-sm"
                        >
                          <Download size={14} /> .PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
