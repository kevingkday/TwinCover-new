import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  AlertTriangle,
  Loader2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Cpu
} from 'lucide-react';
import { policiesApi } from '../api/policiesApi';

export const DOCUMENT_TYPE_OPTIONS = [
  { key: 'policy', label: 'Insurance Policy', badgeColor: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { key: 'binder', label: 'Binder / Cover Note', badgeColor: '#7E22CE', bg: '#FAF5FF', border: '#E9D5FF' },
  { key: 'certificate', label: 'Certificate (COI)', badgeColor: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  { key: 'endorsement', label: 'Endorsement', badgeColor: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  { key: 'quote', label: 'Quote / Proposal', badgeColor: '#BE185D', bg: '#FDF2F8', border: '#FBCFE8' },
];

export function getDocTypeMeta(typeKey) {
  const normalized = (typeKey || 'policy').toLowerCase();
  return (
    DOCUMENT_TYPE_OPTIONS.find(o => o.key === normalized) || {
      key: normalized,
      label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
      badgeColor: '#475569',
      bg: '#F1F5F9',
      border: '#CBD5E1',
    }
  );
}

export default function DragDropUpload({ clientId, onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [classification, setClassification] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('policy');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      classifySelectedFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      classifySelectedFile(e.target.files[0]);
    }
  };

  const resetSelection = () => {
    setSelectedFile(null);
    setClassification(null);
    setSelectedDocType('policy');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step 1: Determine document type locally on Sovereign Node
  const classifySelectedFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a commercial insurance document in .pdf format');
      return;
    }

    setError(null);
    setSelectedFile(file);
    setClassification(null);
    setClassifying(true);

    try {
      const result = await policiesApi.classifyDocument(file);
      setClassification(result);
      setSelectedDocType(result.document_type || 'policy');
    } catch (err) {
      setError(err.message || 'Failed to determine document type');
      setSelectedFile(null);
    } finally {
      setClassifying(false);
    }
  };

  // Step 2: Confirm document type & run full ingestion pipeline
  const handleConfirmAndIngest = async () => {
    if (!selectedFile) return;

    setError(null);
    setUploading(true);
    const docMeta = getDocTypeMeta(selectedDocType);
    setUploadStep(`Extracting structured markdown for ${docMeta.label}...`);

    try {
      const stepTimer1 = setTimeout(() => {
        setUploadStep('Chunking & embedding sections into client-isolated ChromaDB...');
      }, 1500);

      const stepTimer2 = setTimeout(() => {
        setUploadStep(`Running Ollama schedule extraction for ${docMeta.label}...`);
      }, 3000);

      const policy = await policiesApi.uploadPolicy(clientId, selectedFile, selectedDocType);

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploadStep('Complete! Loading verification form...');

      setTimeout(() => {
        setUploading(false);
        setUploadStep('');
        resetSelection();
        if (onUploadSuccess) {
          onUploadSuccess(policy);
        }
      }, 450);
    } catch (err) {
      setError(err.message || 'Failed to ingest insurance document PDF');
      setUploading(false);
      setUploadStep('');
    }
  };

  const activeDocMeta = getDocTypeMeta(selectedDocType);

  return (
    <div style={{ marginBottom: '24px' }}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf"
        style={{ display: 'none' }}
      />

      {/* State A: Classification Result Ready — Broker Confirmation & Probability Breakdown */}
      {classification && !uploading ? (
        <div
          className="glass-panel"
          style={{
            padding: '24px',
            border: `1.5px solid ${activeDocMeta.border}`,
            background: '#FFFFFF',
          }}
        >
          {/* Top row: Sovereign System-1 Header & Detected Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '18px',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: activeDocMeta.bg,
                border: `1px solid ${activeDocMeta.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeDocMeta.badgeColor,
              }}>
                <Cpu size={24} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#1D4ED8',
                    background: '#EFF6FF',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid #BFDBFE',
                  }}>
                    Step 1 • Sovereign Local Document Determination
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {classification.engine} • Zero Offsite Data
                  </span>
                </div>

                <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span>{selectedFile?.name}</span>
                  <span style={{
                    fontSize: '12px',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: activeDocMeta.bg,
                    color: activeDocMeta.badgeColor,
                    border: `1px solid ${activeDocMeta.border}`,
                    fontWeight: 700,
                  }}>
                    {activeDocMeta.label} • {Math.round((classification.confidence || 0.9) * 100)}% Confidence
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={resetSelection}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
            >
              <RotateCcw size={14} />
              <span>Choose Another PDF</span>
            </button>
          </div>

          {/* Summary Reason */}
          <div style={{
            fontSize: '13px',
            color: '#334155',
            background: '#F8FAFC',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="#2563EB" />
              <span>{classification.summary_reason}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>
                Valid Insurance Doc: <strong style={{ color: '#047857' }}>{Math.round((classification.is_insurance_document || 0.95) * 100)}%</strong>
              </span>
              <span>
                Schedule Present: <strong style={{ color: '#1D4ED8' }}>{Math.round((classification.has_coverage_schedule || 0.85) * 100)}%</strong>
              </span>
              <span>
                Pages: <strong style={{ color: '#0F172A' }}>{classification.total_pages || 1}</strong>
              </span>
            </div>
          </div>

          {/* Interactive Document Type Selector Pills with Calibrated Probabilities */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
              Confirm or Override Document Type (Local System-1 Probabilities):
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px' }}>
              {DOCUMENT_TYPE_OPTIONS.map(opt => {
                const prob = classification.probabilities?.[opt.key] ?? 0;
                const probPct = Math.round(prob * 100);
                const isSelected = selectedDocType === opt.key;
                const isTopPick = classification.document_type === opt.key;

                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedDocType(opt.key)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? `2px solid ${opt.badgeColor}` : '1px solid #CBD5E1',
                      background: isSelected ? opt.bg : '#F8FAFC',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? opt.badgeColor : '#334155' }}>
                        {opt.label}
                      </span>
                      {isTopPick && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '999px',
                          background: '#FFFFFF',
                          color: opt.badgeColor,
                          border: `1px solid ${opt.border}`,
                        }}>
                          Top Match
                        </span>
                      )}
                    </div>

                    {/* Probability bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.max(4, probPct)}%`,
                          height: '100%',
                          background: opt.badgeColor,
                          borderRadius: '999px',
                        }} />
                      </div>
                      <span style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono)', color: isSelected ? opt.badgeColor : '#64748B', fontWeight: 700 }}>
                        {probPct}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Bar: Proceed to Step 2 Extraction */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={resetSelection}
              className="btn btn-secondary"
              style={{ padding: '10px 18px', fontSize: '13.5px' }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmAndIngest}
              className="btn btn-primary"
              style={{ padding: '10px 22px', fontSize: '13.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <ShieldCheck size={17} />
              <span>Confirm {activeDocMeta.label} & Ingest Schedule</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* State B: Initial Dropzone / Classifying / Ingesting */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !classifying && !uploading && fileInputRef.current?.click()}
          style={{
            border: isDragging ? '2px dashed #2563EB' : '2px dashed #CBD5E1',
            borderRadius: 'var(--radius-lg)',
            padding: '38px 24px',
            textAlign: 'center',
            background: isDragging ? '#EFF6FF' : '#FFFFFF',
            cursor: classifying || uploading ? 'wait' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {classifying ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Loader2 size={38} className="animate-spin" color="#2563EB" />
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Step 1: Determining Document Type Locally (Sovereign System-1)...
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Evaluating opening pages locally for Policy, Binder, Certificate (COI), Endorsement, or Quote classification
              </div>
            </div>
          ) : uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Loader2 size={38} className="animate-spin" color="#2563EB" />
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Step 2: Ingesting {activeDocMeta.label}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {uploadStep}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB'
              }}>
                <UploadCloud size={28} />
              </div>
              <div>
                <div style={{ fontSize: '15.5px', fontWeight: 700, color: '#0F172A' }}>
                  Drop Commercial Insurance Document PDF to Determine Type or <span style={{ color: '#2563EB' }}>browse files</span>
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                  Step 1: Instant local type determination (<strong>Zero Offsite Data</strong>) — Policy, Binder, Certificate (COI), Endorsement, or Quote • Step 2: Schedule extraction & RAG indexing
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--status-error-bg)',
          border: '1px solid var(--status-error-border)',
          color: 'var(--status-error-text)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
    </div>
  );
}
