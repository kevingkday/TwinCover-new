import React, { useState, useEffect } from 'react';
import { FileText, Download, Sparkles, Save, Check, RefreshCw, Eye, Edit3, Printer } from 'lucide-react';
import { lettersApi } from '../api/lettersApi';

export default function LetterGenerator({ client, policy, verifiedFields }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [useLlmPolish, setUseLlmPolish] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'edit'
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await lettersApi.listTemplates();
      setTemplates(data);
      if (data.length > 0) {
        setSelectedTemplateId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId || !policy) return;

    setGenerating(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const result = await lettersApi.generateLetter(
        client.id,
        policy.id,
        selectedTemplateId,
        customInstructions,
        useLlmPolish
      );

      setDraftTitle(result.title);
      setDraftContent(result.content);
      setActiveTab('preview');
    } catch (err) {
      setError(err.message || 'Letter generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToHistory = async () => {
    if (!draftContent) return;
    try {
      await lettersApi.saveLetter({
        client_id: client.id,
        policy_id: policy?.id,
        template_id: selectedTemplateId,
        title: draftTitle,
        content: draftContent,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save letter');
    }
  };

  const handleExportDocx = async () => {
    if (!draftContent) return;
    setExporting(true);
    try {
      await lettersApi.exportDocx(
        draftTitle || 'Commercial Policy Renewal Summary',
        draftContent,
        client.name,
        verifiedFields?.policy_number || ''
      );
    } catch (err) {
      setError('DOCX export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!draftContent) return;
    setExporting(true);
    try {
      await lettersApi.exportPdf(
        draftTitle || 'Commercial Policy Renewal Summary',
        draftContent,
        client.name,
        verifiedFields?.policy_number || ''
      );
    } catch (err) {
      setError('PDF export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Convert basic markdown to HTML for live styled preview
  const renderMarkdownHtml = (md) => {
    if (!md) return '';
    let html = md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br/>');

    // Parse simple Markdown tables
    const tableRegex = /\|(.+)\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+[\|\r\n]+)+)/g;
    html = html.replace(tableRegex, (match, headerLine, bodyLines) => {
      const headers = headerLine.split('|').map(h => h.trim()).filter(Boolean);
      const rows = bodyLines.trim().split('\n').map(row => 
        row.split('|').map(c => c.trim()).filter(Boolean)
      );

      const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<table>${thead}${tbody}</table>`;
    });

    return html;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Template & Generation Toolbar */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Select Renewal Letter Template</label>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="form-select"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Custom Broker Focus or Instructions (Optional)</label>
            <input
              type="text"
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="e.g. Highlight the $50k cyber deductible and fleet vehicle warranties"
              className="form-input"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !policy}
            className="btn btn-primary"
            style={{ padding: '9px 22px', height: '42px' }}
          >
            {generating ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>{generating ? 'Drafting Letter...' : 'Generate Letter'}</span>
          </button>
        </div>

        {error && (
          <div style={{ marginTop: '12px', color: 'var(--status-error-text)', fontSize: '13px' }}>
            {error}
          </div>
        )}
      </div>

      {/* Drafted Letter Workspace */}
      {draftContent ? (
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '14px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                className="form-input"
                style={{ width: '380px', fontWeight: 600, fontSize: '14px' }}
              />

              {/* View Mode Toggle */}
              <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`btn btn-sm ${activeTab === 'preview' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  <Eye size={14} /> Preview
                </button>
                <button
                  onClick={() => setActiveTab('edit')}
                  className={`btn btn-sm ${activeTab === 'edit' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  <Edit3 size={14} /> Edit Raw Markdown
                </button>
              </div>
            </div>

            {/* Export and Save Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleSaveToHistory}
                className="btn btn-secondary btn-sm"
                title="Save draft to client letter history"
              >
                {savedSuccess ? <Check size={14} color="#34d399" /> : <Save size={14} />}
                <span>{savedSuccess ? 'Saved!' : 'Save Draft'}</span>
              </button>

              <button
                onClick={handleExportDocx}
                disabled={exporting}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(59, 130, 246, 0.4)', color: '#60a5fa' }}
              >
                <Download size={14} />
                <span>Export .DOCX</span>
              </button>

              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="btn btn-primary btn-sm"
              >
                <Printer size={14} />
                <span>Download .PDF</span>
              </button>
            </div>
          </div>

          {/* Editor / Preview Body */}
          {activeTab === 'edit' ? (
            <textarea
              value={draftContent}
              onChange={e => setDraftContent(e.target.value)}
              className="form-textarea"
              rows={22}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                lineHeight: 1.6,
                padding: '16px',
                minHeight: '480px'
              }}
            />
          ) : (
            <div
              className="markdown-preview"
              style={{ minHeight: '480px' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(draftContent) }}
            />
          )}
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileText size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            No renewal letter drafted yet
          </div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>
            Select a letter template above and click "Generate Letter" to synthesize the verified policy fields into a client-ready memorandum.
          </div>
        </div>
      )}
    </div>
  );
}
