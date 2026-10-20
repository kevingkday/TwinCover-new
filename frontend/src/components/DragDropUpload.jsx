import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { policiesApi } from '../api/policiesApi';

export default function DragDropUpload({ clientId, onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
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
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload an insurance policy document in .pdf format');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadStep('Extracting structured markdown schedules...');

    try {
      const stepTimer1 = setTimeout(() => {
        setUploadStep('Chunking & embedding sections into client-isolated ChromaDB...');
      }, 1500);

      const stepTimer2 = setTimeout(() => {
        setUploadStep('Running Ollama extraction for commercial schedule fields...');
      }, 3000);

      const policy = await policiesApi.uploadPolicy(clientId, file);

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploadStep('Complete! Loading verification form...');

      setTimeout(() => {
        setUploading(false);
        setUploadStep('');
        if (onUploadSuccess) {
          onUploadSuccess(policy);
        }
      }, 500);

    } catch (err) {
      setError(err.message || 'Failed to ingest policy PDF');
      setUploading(false);
      setUploadStep('');
    }
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf"
        style={{ display: 'none' }}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed #3b82f6' : '2px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px 24px',
          textAlign: 'center',
          background: isDragging ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={38} className="animate-spin" color="#3b82f6" />
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Ingesting Commercial Policy Schedule
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
              background: 'rgba(59, 130, 246, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}>
              <UploadCloud size={28} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Drop Carrier Renewal Policy PDF here or <span style={{ color: '#60a5fa' }}>browse files</span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Multi-page schedules (60+ pages supported). Extracted via microservice, embedded into ChromaDB, and verified.
              </div>
            </div>
          </div>
        )}
      </div>

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
