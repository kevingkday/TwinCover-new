import React, { useState } from 'react';
import { Search, Sparkles, BookOpen, ChevronDown, ChevronUp, Shield, HelpCircle, FileCheck, AlertCircle, Loader2 } from 'lucide-react';
import { ragApi } from '../api/ragApi';

export default function ClientRagDrawer({ client }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expandedChunk, setExpandedChunk] = useState(null);

  const sampleQuestions = [
    'What is the cyber deductible and retention amount?',
    'Are war and military action exclusions applied?',
    'What are the commercial property and real estate limits?',
    'What is the policy cancellation notice requirement?',
  ];

  const handleQuery = async (questionToAsk) => {
    const q = questionToAsk || query;
    if (!q.trim()) return;

    setLoading(true);
    setError(null);
    setQuery(q);

    try {
      const resp = await ragApi.queryPolicyRag(client.id, q);
      setResult(resp);
    } catch (err) {
      setError(err.message || 'Error querying client policy documents');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Isolation Notice Banner */}
      <div className="glass-panel" style={{
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(37, 99, 235, 0.05)',
        borderColor: 'rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={18} color="#60a5fa" />
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
              Client-Isolated Policy Intelligence
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Queries strictly query <code>client_{client.id}</code> Chroma collection. Zero cross-client data leakage.
            </div>
          </div>
        </div>

        <span className="badge badge-blue">
          Strict Isolation Active
        </span>
      </div>

      {/* Query Bar */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleQuery(); }} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask an ad-hoc coverage question (e.g. 'What is the cyber deductible?', 'Are war exclusions applied?')..."
              className="form-input"
              style={{ paddingLeft: '42px', height: '44px', fontSize: '14px' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn btn-primary"
            style={{ padding: '0 24px', height: '44px' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>{loading ? 'Analyzing...' : 'Search Policy'}</span>
          </button>
        </form>

        {/* Quick Suggestion Pills */}
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Suggested queries:</span>
          {sampleQuestions.map((sq, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleQuery(sq)}
              className="badge"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                padding: '4px 10px',
                fontSize: '12px'
              }}
            >
              {sq}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: '14px',
            padding: '10px 14px',
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
      </div>

      {/* Answer & Citations Card */}
      {result && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Answer Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '8px'
            }}>
              <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#60a5fa" />
                Coverage Analysis & Policy Response
              </div>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                Model: {result.model_used}
              </span>
            </div>

            <div style={{
              fontSize: '14.5px',
              lineHeight: 1.65,
              color: '#e2e8f0',
              padding: '14px 18px',
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: 'var(--radius-md)',
              borderLeft: '4px solid #3b82f6',
              whiteSpace: 'pre-wrap'
            }}>
              {result.answer}
            </div>
          </div>

          {/* Sources and Citations */}
          {result.sources && result.sources.length > 0 && (
            <div>
              <div style={{
                fontSize: '13.5px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <BookOpen size={16} />
                Cited Policy Sections & Schedule Passages ({result.sources.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {result.sources.map((src, idx) => {
                  const isExpanded = expandedChunk === idx;
                  return (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        onClick={() => setExpandedChunk(isExpanded ? null : idx)}
                        style={{
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(255, 255, 255, 0.04)' : 'transparent'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FileCheck size={16} color="#60a5fa" />
                          <div>
                            <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {src.section_title || 'Policy Section'}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                              ({src.filename})
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {src.score !== undefined && (
                            <span className="badge badge-blue" style={{ fontSize: '11px' }}>
                              {Math.round(src.score * 100)}% Match
                            </span>
                          )}
                          {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{
                          padding: '14px 18px',
                          borderTop: '1px solid var(--border-subtle)',
                          background: 'rgba(10, 15, 26, 0.8)',
                          fontSize: '12.5px',
                          fontFamily: 'var(--font-mono)',
                          color: '#cbd5e1',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap'
                        }}>
                          {src.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
