import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Plus, Save, Trash2, Edit3, Eye, Copy, Check, Shield, 
  Upload, Download, FileCode, Sparkles, AlertCircle, X, HelpCircle 
} from 'lucide-react';
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
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFormData, setUploadFormData] = useState({
    name: '',
    category: 'Broker Letterhead',
    description: '',
    file: null
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const availableTokens = [
    { token: '{{insured_name}}', desc: 'Named Insured Client' },
    { token: '{{policy_number}}', desc: 'Policy Number' },
    { token: '{{insurer}}', desc: 'Underwriting Carrier' },
    { token: '{{effective_date}}', desc: 'Inception Date' },
    { token: '{{expiry_date}}', desc: 'Expiration Date' },
    { token: '{{total_premium}}', desc: 'Total Annual Premium' },
    { token: '{{coverages_table}}', desc: 'Full Coverages, Limits & Deductibles Schedule' },
    { token: '{{cgl_limit}}', desc: 'General Liability Limit' },
    { token: '{{property_limit}}', desc: 'Property / Building Limit' },
    { token: '{{cyber_limit}}', desc: 'Cyber Liability Limit' },
    { token: '{{cyber_deductible}}', desc: 'Cyber Retention / Deductible' },
    { token: '{{broker_name}}', desc: 'Broker Full Name' },
    { token: '{{agency_name}}', desc: 'Brokerage Firm Name' },
    { token: '{{broker_email}}', desc: 'Broker Direct Email' },
    { token: '{{current_date}}', desc: "Today's Formatted Date" },
  ];

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async (preferredId = null) => {
    try {
      const data = await lettersApi.listTemplates();
      setTemplates(data);
      if (data.length > 0) {
        if (preferredId) {
          const matched = data.find(t => t.id === preferredId);
          if (matched) {
            selectTemplate(matched);
            return;
          }
        }
        if (!selectedTemplate || !data.some(t => t.id === selectedTemplate.id)) {
          selectTemplate(data[0]);
        }
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

  const handleStartNewMarkdown = () => {
    setSelectedTemplate(null);
    setIsEditing(true);
    setFormData({
      name: 'Custom Client Summary Template',
      category: 'Commercial Renewal',
      description: 'Customized broker letter with verified coverage schedules.',
      content: `# COMMERCIAL POLICY RENEWAL SUMMARY\n\n**Date:** {{current_date}}\n**Insured:** {{insured_name}}\n**Policy #:** {{policy_number}}\n\nDear Management,\n\nWe have completed the annual review of your policy issued by **{{insurer}}** for the term **{{effective_date}}** to **{{expiry_date}}**.\n\n### 1. Schedule of Coverages\n{{coverages_table}}\n\n**Total Annual Renewal Premium:** {{total_premium}}\n\nSincerely,\n**{{broker_name}}**\n{{agency_name}}`
    });
  };

  const handleSaveMarkdown = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (selectedTemplate && !selectedTemplate.is_system && selectedTemplate.template_type === 'markdown') {
        const updated = await lettersApi.updateTemplate(selectedTemplate.id, formData);
        await loadTemplates(updated.id);
      } else {
        const created = await lettersApi.createTemplate(formData);
        await loadTemplates(created.id);
      }
      setIsEditing(false);
    } catch (err) {
      alert('Failed to save template: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await lettersApi.deleteTemplate(templateId);
      setSelectedTemplate(null);
      await loadTemplates();
    } catch (err) {
      alert('Failed to delete template: ' + err.message);
    }
  };

  const handleUploadDocx = async (e) => {
    e.preventDefault();
    if (!uploadFormData.file) {
      setUploadError('Please select a .docx Word document');
      return;
    }

    setUploading(true);
    setUploadError(null);

    const data = new FormData();
    data.append('file', uploadFormData.file);
    data.append('name', uploadFormData.name || uploadFormData.file.name.replace(/\.[^/.]+$/, ''));
    data.append('category', uploadFormData.category || 'Broker Letterhead');
    if (uploadFormData.description) {
      data.append('description', uploadFormData.description);
    }

    try {
      const created = await lettersApi.uploadDocxTemplate(data);
      setShowUploadModal(false);
      setUploadFormData({
        name: '',
        category: 'Broker Letterhead',
        description: '',
        file: null
      });
      await loadTemplates(created.id);
    } catch (err) {
      setUploadError(err.message || 'Failed to upload Word template');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocx = (template) => {
    if (!template) return;
    lettersApi.downloadDocxTemplate(template.id, template.original_filename || `${template.name}.docx`);
  };

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const insertTokenIntoContent = (token) => {
    if (selectedTemplate?.template_type === 'docx') {
      handleCopyToken(token);
      return;
    }
    setFormData(prev => ({
      ...prev,
      content: prev.content + ` ${token} `
    }));
  };

  const isDocx = selectedTemplate?.template_type === 'docx';

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '32px 24px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Renewal Letter Templates</h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage standardized letterhead templates in Microsoft Word (.docx) or Markdown with dynamic coverage schedule tokens.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => setShowUploadModal(true)} 
            className="btn btn-secondary" 
            style={{ padding: '8px 16px', borderColor: 'rgba(59, 130, 246, 0.4)', color: '#93c5fd' }}
          >
            <Upload size={16} /> Upload Word (.docx)
          </button>
          <button onClick={handleStartNewMarkdown} className="btn btn-primary" style={{ padding: '8px 18px' }}>
            <Plus size={16} /> New Markdown Template
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>
        {/* Left Sidebar: Template List */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Available Templates ({templates.length})
          </div>

          {templates.map(tmpl => {
            const isSelected = selectedTemplate?.id === tmpl.id;
            const isTmplDocx = tmpl.template_type === 'docx';
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: isSelected ? '#93c5fd' : '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tmpl.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {isTmplDocx ? (
                      <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', padding: '1px 5px', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                        DOCX
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', fontSize: '10px', padding: '1px 5px' }}>
                        MD
                      </span>
                    )}
                    {tmpl.is_system && (
                      <span className="badge badge-purple" style={{ fontSize: '10px', padding: '1px 5px' }}>
                        System
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tmpl.category}</span>
                  {tmpl.original_filename && (
                    <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                      {tmpl.original_filename.length > 20 ? tmpl.original_filename.slice(0, 18) + '...' : tmpl.original_filename}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Editor Area */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Token Pills Cheat Sheet */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {isDocx ? 'Available Merge Fields in Word Templates (Click to copy token):' : 'Available Verified Policy Tokens (Click to insert):'}
              </div>
              {copiedToken && (
                <span style={{ fontSize: '12px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={13} /> Copied {copiedToken} to clipboard!
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {availableTokens.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => insertTokenIntoContent(t.token)}
                  className="badge"
                  style={{
                    background: t.token === '{{coverages_table}}' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                    border: t.token === '{{coverages_table}}' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.25)',
                    color: t.token === '{{coverages_table}}' ? '#6ee7b7' : '#93c5fd',
                    cursor: 'pointer',
                    padding: '3px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={isDocx ? `Click to copy ${t.token} (${t.desc})` : `Insert ${t.desc}`}
                >
                  <Copy size={11} style={{ opacity: 0.6 }} />
                  {t.token}
                </button>
              ))}
            </div>
          </div>

          {/* DOCX Template Info & Actions Banner */}
          {isDocx && selectedTemplate && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.2), rgba(15, 23, 42, 0.4))',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <FileText size={18} color="#60a5fa" />
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                    {selectedTemplate.name}
                  </span>
                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                    Word .docx Letterhead
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                  This Word template uses your firm's official corporate letterhead, logo banners, footers, and typography.
                  Variables like <code>&#123;&#123;coverages_table&#125;&#125;</code> and <code>&#123;&#123;insured_name&#125;&#125;</code> are rendered directly into the file upon export.
                </p>
                {selectedTemplate.original_filename && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                    Source file: <strong>{selectedTemplate.original_filename}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleDownloadDocx(selectedTemplate)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa' }}
                >
                  <Download size={15} /> Download .docx Template
                </button>
                {!selectedTemplate.is_system && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(selectedTemplate.id)}
                    className="btn btn-ghost"
                    style={{ padding: '8px', color: '#f87171' }}
                    title="Delete template"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Editor Form */}
          <form onSubmit={handleSaveMarkdown}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Template Name</label>
                <input
                  type="text"
                  required
                  disabled={isDocx}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Category</label>
                <input
                  type="text"
                  disabled={isDocx}
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
                disabled={isDocx}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label className="form-label">
                  {isDocx ? 'Extracted Text & Placeholder Content' : 'Markdown Template Content'}
                </label>
                {selectedTemplate?.is_system && !isDocx && (
                  <span style={{ fontSize: '12px', color: '#c084fc' }}>
                    Note: System templates will save as a new custom template
                  </span>
                )}
                {isDocx && (
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    To edit letterhead, logos, or layout, download the .docx file above, edit in Microsoft Word, and upload as a new template.
                  </span>
                )}
              </div>
              <textarea
                rows={18}
                required
                readOnly={isDocx}
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                className="form-textarea"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  opacity: isDocx ? 0.8 : 1,
                  background: isDocx ? 'rgba(15, 23, 42, 0.5)' : undefined
                }}
              />
            </div>

            {!isDocx && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {selectedTemplate && !selectedTemplate.is_system && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(selectedTemplate.id)}
                      className="btn btn-ghost"
                      style={{ color: '#f87171', padding: '8px 12px' }}
                    >
                      <Trash2 size={16} /> Delete Template
                    </button>
                  )}
                </div>
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
            )}
          </form>
        </div>
      </div>

      {/* Modal: Upload Custom Word (.docx) Letterhead */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '620px',
            width: '100%',
            padding: '28px',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowUploadModal(false)}
              className="btn btn-ghost"
              style={{ position: 'absolute', top: '16px', right: '16px', padding: '6px' }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '8px', borderRadius: 'var(--radius-md)' }}>
                <Upload size={22} color="#60a5fa" />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                Upload Word (.docx) Letterhead Template
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Upload your brokerage's official letterhead template containing your corporate logo, custom headers, footers, and typography.
            </p>

            {/* Merge Fields Tip Banner */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              fontSize: '12.5px',
              color: '#cbd5e1',
              marginBottom: '18px'
            }}>
              <strong style={{ color: '#93c5fd' }}>How to prepare your Word template:</strong>
              <div style={{ marginTop: '4px', lineHeight: 1.5 }}>
                Insert Jinja tokens directly into your Word paragraphs or table cells, such as <code>&#123;&#123;insured_name&#125;&#125;</code>, <code>&#123;&#123;policy_number&#125;&#125;</code>, <code>&#123;&#123;coverages_table&#125;&#125;</code>, and <code>&#123;&#123;total_premium&#125;&#125;</code>. All logos and styles are 100% preserved!
              </div>
            </div>

            <form onSubmit={handleUploadDocx}>
              <div className="form-group">
                <label className="form-label">Template Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Brokerage Standard Executive Letterhead"
                  value={uploadFormData.name}
                  onChange={e => setUploadFormData({ ...uploadFormData, name: e.target.value })}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    value={uploadFormData.category}
                    onChange={e => setUploadFormData({ ...uploadFormData, category: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Formal client renewal letterhead"
                    value={uploadFormData.description}
                    onChange={e => setUploadFormData({ ...uploadFormData, description: e.target.value })}
                    className="form-input"
                  />
                </div>
              </div>

              {/* File Upload Box */}
              <div className="form-group">
                <label className="form-label">Select Word (.docx) File</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: uploadFormData.file ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                    borderColor: uploadFormData.file ? '#3b82f6' : 'var(--border-subtle)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file) {
                        setUploadFormData(prev => ({
                          ...prev,
                          file,
                          name: prev.name || file.name.replace(/\.[^/.]+$/, '')
                        }));
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <FileText size={32} style={{ margin: '0 auto 8px', color: uploadFormData.file ? '#60a5fa' : '#64748b' }} />
                  {uploadFormData.file ? (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                        {uploadFormData.file.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {(uploadFormData.file.size / 1024).toFixed(1)} KB — Click to change file
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        Click to select Word document (.docx)
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Supports Word files with custom logos, headers, tables, and footers
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div style={{ color: 'var(--status-error-text)', fontSize: '13px', marginBottom: '14px' }}>
                  {uploadError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFormData.file}
                  className="btn btn-primary"
                  style={{ padding: '8px 22px' }}
                >
                  {uploading ? 'Uploading...' : 'Save & Register Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
