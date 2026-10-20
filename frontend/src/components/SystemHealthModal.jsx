import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, RefreshCw, Cpu, Database, FileText, Server } from 'lucide-react';
import { systemApi } from '../api/systemApi';

export default function SystemHealthModal({ isOpen, onClose }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHealth();
    }
  }, [isOpen]);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const data = await systemApi.getSystemHealth();
      setHealth(data);
    } catch (e) {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={22} color="#3b82f6" />
            <div>
              <h2 style={{ fontSize: '18px' }}>Local Architecture & AI Engine Status</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                TwinCover Externalized Inference & Local Storage Diagnostics
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px' }}>
            <RefreshCw size={24} className="animate-spin" color="#3b82f6" />
            <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Probing microservices & vector storage...
            </div>
          </div>
        ) : health ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* DB Card */}
            <div className="glass-panel" style={{ padding: '14px 18px', background: 'rgba(255, 255, 255, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Database size={18} color="#60a5fa" />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{health.database.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {health.database.url}
                    </div>
                  </div>
                </div>
                <span className={`badge ${health.database.is_online ? 'badge-verified' : 'badge-pending'}`}>
                  {health.database.is_online ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Document Extractor Microservice Card */}
            <div className="glass-panel" style={{ padding: '14px 18px', background: 'rgba(255, 255, 255, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={18} color="#a855f7" />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{health.extractor_microservice.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {health.extractor_microservice.url}
                    </div>
                  </div>
                </div>
                <span className={`badge ${health.extractor_microservice.is_online ? 'badge-verified' : 'badge-pending'}`}>
                  {health.extractor_microservice.is_online ? 'Online' : 'Fallback Active'}
                </span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {health.extractor_microservice.status_message}
              </div>
            </div>

            {/* Ollama LLM Card */}
            <div className="glass-panel" style={{ padding: '14px 18px', background: 'rgba(255, 255, 255, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cpu size={18} color="#34d399" />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{health.ollama_llm.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {health.ollama_llm.url}
                    </div>
                  </div>
                </div>
                <span className={`badge ${health.ollama_llm.is_online ? 'badge-verified' : 'badge-pending'}`}>
                  {health.ollama_llm.is_online ? 'Online' : 'Fallback Active'}
                </span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {health.ollama_llm.status_message}
              </div>
            </div>

            {/* ChromaDB Card */}
            <div className="glass-panel" style={{ padding: '14px 18px', background: 'rgba(255, 255, 255, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Database size={18} color="#f59e0b" />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{health.chroma_vector_db.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {health.chroma_vector_db.url}
                    </div>
                  </div>
                </div>
                <span className={`badge ${health.chroma_vector_db.is_online ? 'badge-verified' : 'badge-pending'}`}>
                  {health.chroma_vector_db.is_online ? 'Ready' : 'Error'}
                </span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Client Isolation: <code>client_&#123;client_id&#125;</code> strict partition mode enabled.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--status-error-text)', fontSize: '13px' }}>
            Unable to connect to TwinCover backend API.
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={loadHealth} className="btn btn-secondary btn-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Diagnostics
          </button>
          <button onClick={onClose} className="btn btn-primary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
