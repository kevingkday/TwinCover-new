import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, Clock, Save, FileText, Search, ArrowRight, 
  ShieldCheck, Plus, Trash2, Layers, Shield, Sparkles 
} from 'lucide-react';
import { policiesApi } from '../api/policiesApi';

export default function SideBySideReview({ policy, onFieldsSaved, onNavigateToLetters }) {
  const [fields, setFields] = useState({
    insured_name: '',
    policy_number: '',
    insurer: '',
    effective_date: '',
    expiry_date: '',
    cgl_limit: '',
    property_limit: '',
    cyber_limit: '',
    cyber_deductible: '',
    total_premium: '',
    coverages: [],
  });

  const [isVerified, setIsVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (policy) {
      const ef = policy.extracted_fields || {};
      let covs = [];
      if (Array.isArray(ef.coverages)) {
        covs = ef.coverages;
      } else if (typeof ef.coverages === 'string') {
        try {
          covs = JSON.parse(ef.coverages);
        } catch (e) {
          covs = [];
        }
      }

      // If no dynamic coverages exist but legacy fields exist, provide default coverage items
      if (!covs || covs.length === 0) {
        covs = [];
        if (ef.cgl_limit) covs.push({ name: 'Commercial General Liability (CGL)', limit: ef.cgl_limit, deductible: '$1,000' });
        if (ef.property_limit) covs.push({ name: 'Commercial Property & Building', limit: ef.property_limit, deductible: 'Standard' });
        if (ef.cyber_limit || ef.cyber_deductible) covs.push({ name: 'Cyber & Privacy Breach', limit: ef.cyber_limit || 'Included', deductible: ef.cyber_deductible || '$5,000' });
      }

      setFields({
        insured_name: ef.insured_name || '',
        policy_number: ef.policy_number || '',
        insurer: ef.insurer || '',
        effective_date: ef.effective_date || '',
        expiry_date: ef.expiry_date || '',
        cgl_limit: ef.cgl_limit || '',
        property_limit: ef.property_limit || '',
        cyber_limit: ef.cyber_limit || '',
        cyber_deductible: ef.cyber_deductible || '',
        total_premium: ef.total_premium || '',
        coverages: covs,
      });
      setIsVerified(ef.verified || false);
      setVerifiedAt(ef.verified_at || null);
    }
  }, [policy]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
  };

  const handleCoverageChange = (index, fieldName, value) => {
    setFields(prev => {
      const updated = [...(prev.coverages || [])];
      updated[index] = { ...updated[index], [fieldName]: value };
      return { ...prev, coverages: updated };
    });
  };

  const handleAddCoverage = () => {
    setFields(prev => ({
      ...prev,
      coverages: [
        ...(prev.coverages || []),
        { name: '', limit: '', deductible: '' }
      ]
    }));
  };

  const handleRemoveCoverage = (index) => {
    setFields(prev => ({
      ...prev,
      coverages: (prev.coverages || []).filter((_, i) => i !== index)
    }));
  };

  const handleSaveAndConfirm = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await policiesApi.verifyFields(policy.id, fields);
      setIsVerified(true);
      setVerifiedAt(updated.verified_at);
      setFeedback({ type: 'success', message: 'Policy schedule fields confirmed & verified!' });
      if (onFieldsSaved) {
        onFieldsSaved(updated);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to verify fields' });
    } finally {
      setSaving(false);
    }
  };

  const filteredRawText = policy?.raw_text ? policy.raw_text.split('\n').filter(line => 
    !docSearch || line.toLowerCase().includes(docSearch.toLowerCase())
  ).join('\n') : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner with Status Badge */}
      <div className="glass-panel" style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileText size={22} color="#60a5fa" />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>
              {policy?.filename || 'Commercial Policy Document'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Source PDF Ingested • {policy?.raw_text ? `${policy.raw_text.length.toLocaleString()} characters extracted` : 'Pending'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {isVerified ? (
            <div className="badge badge-verified" style={{ padding: '6px 12px', fontSize: '13px' }}>
              <CheckCircle2 size={15} />
              <span>Verified & Audited</span>
            </div>
          ) : (
            <div className="badge badge-pending" style={{ padding: '6px 12px', fontSize: '13px' }}>
              <Clock size={15} />
              <span>Pending Broker Verification</span>
            </div>
          )}

          <button
            onClick={handleSaveAndConfirm}
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: '8px 18px', fontSize: '13.5px' }}
          >
            <ShieldCheck size={16} />
            {saving ? 'Confirming...' : 'Save & Confirm Fields'}
          </button>

          {isVerified && onNavigateToLetters && (
            <button
              onClick={onNavigateToLetters}
              className="btn btn-success"
              style={{ padding: '8px 18px', fontSize: '13.5px' }}
            >
              <span>Draft Client Letter</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: feedback.type === 'success' ? 'var(--status-verified-bg)' : 'var(--status-error-bg)',
          border: `1px solid ${feedback.type === 'success' ? 'var(--status-verified-border)' : 'var(--status-error-border)'}`,
          color: feedback.type === 'success' ? 'var(--status-verified-text)' : 'var(--status-error-text)',
          fontSize: '13.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
          {feedback.message}
        </div>
      )}

      {/* Side-by-Side Split View */}
      <div className="split-pane">
        {/* Left Pane: Extracted Policy Text / Schedule Viewer */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Extracted Policy Text & Schedules</div>
            
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
                placeholder="Search schedule terms..."
                className="form-input"
                style={{ paddingLeft: '30px', paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12.5px' }}
              />
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12.5px',
            lineHeight: 1.6,
            color: '#cbd5e1',
            background: 'rgba(10, 15, 26, 0.6)',
            whiteSpace: 'pre-wrap',
            userSelect: 'text'
          }}>
            {filteredRawText || 'No text matching search filter.'}
          </div>
        </div>

        {/* Right Pane: Structured Key-Value Confirmation Form */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>
              Extracted Schedule Verification Form
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Editable fields for letter synthesis
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            
            {/* Section 1: Standardized Policy Headers */}
            <div>
              <div style={{
                fontSize: '12.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#60a5fa',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <FileText size={14} />
                <span>Standardized Policy Information</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Named Insured</label>
                  <input
                    type="text"
                    name="insured_name"
                    value={fields.insured_name}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. Apex Logistics Ltd"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Policy Number</label>
                  <input
                    type="text"
                    name="policy_number"
                    value={fields.policy_number}
                    onChange={handleChange}
                    className="form-input mono"
                    placeholder="e.g. APX-2026-COMM-7789"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Insurer / Carrier</label>
                  <input
                    type="text"
                    name="insurer"
                    value={fields.insurer}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. Chubb Commercial Casualty"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Effective Date</label>
                  <input
                    type="text"
                    name="effective_date"
                    value={fields.effective_date}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. October 05, 2026"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expiry Date</label>
                  <input
                    type="text"
                    name="expiry_date"
                    value={fields.expiry_date}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. October 05, 2027"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Total Annual Policy Premium</label>
                  <input
                    type="text"
                    name="total_premium"
                    value={fields.total_premium}
                    onChange={handleChange}
                    className="form-input mono"
                    style={{ fontSize: '15px', fontWeight: 600, color: '#34d399' }}
                    placeholder="e.g. $42,850.00"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Policy-Specific Dynamic Coverages & Limits */}
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={15} color="#38bdf8" />
                  <span style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#38bdf8'
                  }}>
                    Policy Coverages & Limits
                  </span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(56, 189, 248, 0.12)',
                    color: '#38bdf8',
                    fontWeight: 600
                  }}>
                    {fields.coverages?.length || 0} Lines Identified
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleAddCoverage}
                  className="btn btn-secondary btn-sm"
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: '#60a5fa',
                    borderColor: 'rgba(96, 165, 250, 0.3)'
                  }}
                >
                  <Plus size={13} />
                  <span>Add Coverage Line</span>
                </button>
              </div>

              {/* Dynamic Coverages List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {fields.coverages && fields.coverages.length > 0 ? (
                  fields.coverages.map((cov, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(255, 255, 255, 0.025)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                          <Shield size={14} color="#60a5fa" />
                          <input
                            type="text"
                            value={cov.name || ''}
                            onChange={e => handleCoverageChange(idx, 'name', e.target.value)}
                            className="form-input"
                            placeholder="Coverage Name (e.g. Commercial General Liability, Errors & Omissions, Cyber)"
                            style={{ fontWeight: 600, fontSize: '13px', padding: '6px 10px' }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCoverage(idx)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: '6px 8px',
                            color: '#f87171',
                            borderColor: 'rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.06)'
                          }}
                          title="Remove this coverage line"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', display: 'block' }}>
                            Limit / Sum Insured
                          </label>
                          <input
                            type="text"
                            value={cov.limit || ''}
                            onChange={e => handleCoverageChange(idx, 'limit', e.target.value)}
                            className="form-input mono"
                            placeholder="e.g. $2,000,000"
                            style={{ fontSize: '12.5px', padding: '6px 10px' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', display: 'block' }}>
                            Deductible / Retention
                          </label>
                          <input
                            type="text"
                            value={cov.deductible || ''}
                            onChange={e => handleCoverageChange(idx, 'deductible', e.target.value)}
                            className="form-input mono"
                            placeholder="e.g. $1,000 or Nil"
                            style={{ fontSize: '12.5px', padding: '6px 10px' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-muted)',
                    fontSize: '13px'
                  }}>
                    <Layers size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <div>No coverage lines currently listed for this policy.</div>
                    <button
                      type="button"
                      onClick={handleAddCoverage}
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '10px', fontSize: '12px' }}
                    >
                      <Plus size={13} />
                      <span>Add First Coverage</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Save & Confirm Button */}
            <div style={{ paddingTop: '8px' }}>
              <button
                onClick={handleSaveAndConfirm}
                disabled={saving}
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px', fontSize: '14px', fontWeight: 600 }}
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save & Confirm Fields'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
