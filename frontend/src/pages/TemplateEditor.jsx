import React, { useState, useEffect } from 'react';
import { FileText, Plus, Save, Trash2, Edit3, Eye, Copy, Check, Shield } from 'lucide-react';
import { lettersApi } from '../api/lettersApi';

export default function TemplateEditor() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Renewal',
    description: '',
    content: ''
  });
  const [copiedToken, setCopiedToken] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'preview'

  const availableTokens = [
    { token: '{{insured_name}}', desc: 'Named Insured Client' },
    { token: '{{policy_number}}', desc: 'Policy Number' },
    { token: '{{insurer}}', desc: 'Insurance Carrier' },
    { token: '{{effective_date}}', desc: 'Effective Date' },
    { token: '{{expiry_date}}', desc: 'Expiration Date' },
    { token: '{{cgl_limit}}', desc: 'General Liability Limit' },
    { token: '{{property_limit}}', desc: 'Property / Building Limit' },
    { token: '{{cyber_limit}}', desc: 'Cyber Liability Limit' },
    { token: '{{cyber_deductible}}', desc: 'Cyber Retention / Deductible' },
    { token: '{{total_premium}}', desc: 'Total Annual Premium' },
    { token: '{{broker_name}}', desc: 'Broker Full Name' },
    { token: '{{agency_name}}', desc: 'Brokerage Firm Name' },
    { token: '{{current_date}}', desc: "Today's Formatted Date" },
  ];

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await lettersApi.listTemplates();
      setTemplates(data);
      if (data.length > 0 && !selectedTemplate) {
        selectTemplate(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectTemplate = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      description: template.description || '',
      content: template.content
    });
    setIsEditing(false);
  };

  const handleStartNew = () => {
    setSelectedTemplate(null);
    setIsEditing(true);
    setFormData({
      name: 'Custom Client Summary Template',
      category: 'Commercial Renewal',
      description: 'Customized broker letter with verified coverage schedules.',
      content: `# COMMERCIAL POLICY RENEWAL SUMMARY\n\n**Date:** {{current_date}}\n**Insured:** {{insured_name}}\n**Policy #:** {{policy_number}}\n\nDear Management,\n\nWe have completed the annual review of your policy issued by **{{insurer}}** for the term **{{effective_date}}** to **{{expiry_date}}**.\n\n### Coverage Summary\n- **General Liability Limit:** {{cgl_limit}}\n- **Cyber Deductible:** {{cyber_deductible}}\n- **Total Premium:** {{total_premium}}\n\nSincerely,\n**{{broker_name}}**\n{{agency_name}}`
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedTemplate && !selectedTemplate.is_system) {
        const updated = await lettersApi.updateTemplate(selectedTemplate.id, formData);
        loadTemplates();
        selectTemplate(updated);
      } else {
        const created = await lettersApi.createTemplate(formData);
        loadTemplates();
        selectTemplate(created);
      }
      setIsEditing(false);
    } catch (err) {
      alert('Failed to save template: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const insertTokenIntoContent = (token) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content + ` ${token} `
    }));
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Renewal Letter Templates</h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage standardized Markdown letter templates with verified token injection.
          </p>
        </div>

        <button onClick={handleStartNew} className="btn btn-primary" style={{ padding: '8px 18px' }}>
          <Plus size={16} /> New Template
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
        {/* Left Sidebar: Template List */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Standard Templates ({templates.length})
          </div>

          {templates.map(tmpl => {
            const isSelected = selectedTemplate?.id === tmpl.id;
            return (
              <div
                key={tmpl.id}
                onClick={() => selectTemplate(tmpl)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: isSelected ? '#93c5fd' : '#f8fafc' }}>
                    {tmpl.name}
                  </span>
                  {tmpl.is_system && (
                    <span className="badge badge-purple" style={{ fontSize: '10px', padding: '1px 5px' }}>
                      System
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Category: {tmpl.category}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Editor Area */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Token Pills Cheat Sheet */}
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Available Verified Policy Tokens (click to insert):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {availableTokens.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => insertTokenIntoContent(t.token)}
                  className="badge"
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    color: '#93c5fd',
                    cursor: 'pointer',
                    padding: '3px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px'
                  }}
                  title={`Insert ${t.desc}`}
                >
                  {t.token}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Template Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Template Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label className="form-label">Markdown Template Content</label>
                {selectedTemplate?.is_system && (
                  <span style={{ fontSize: '12px', color: '#c084fc' }}>
                    Note: System templates will save as a new custom template
                  </span>
                )}
              </div>
              <textarea
                rows={18}
                required
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                className="form-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ padding: '9px 24px' }}
              >
                <Save size={16} />
                <span>{saving ? 'Saving...' : 'Save Template'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
