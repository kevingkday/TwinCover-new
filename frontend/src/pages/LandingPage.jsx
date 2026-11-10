import React, { useState } from 'react';
import {
  Shield,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  FileText,
  Cpu,
  Lock,
  Layers,
  Search,
  Download,
  ChevronDown,
  Zap,
  Clock,
  Building2,
  Check,
  Database,
  Server,
} from 'lucide-react';
import { authApi } from '../api/authApi';

const INTERACTIVE_DOC_PREVIEWS = {
  policy: {
    label: 'Commercial Insurance Policy',
    filename: 'Apex_Logistics_Renewal_Policy_2026.pdf',
    pages: 62,
    confidence: 99,
    badgeBg: '#EFF6FF',
    badgeColor: '#1D4ED8',
    badgeBorder: '#BFDBFE',
    probabilities: { policy: 99, binder: 1, certificate: 0, endorsement: 0, quote: 0 },
    reason: 'Detected # COVERAGE DECLARATIONS SCHEDULE header, 62-page policy wording, scheduled limits, and exclusions.',
    extractedPreview: [
      { label: 'Named Insured', value: 'Apex Logistics Ltd' },
      { label: 'Policy Number', value: 'APX-2026-COMM-7789' },
      { label: 'Underwriting Carrier', value: 'Chubb Commercial Casualty' },
      { label: 'CGL / Property / Cyber', value: '$5M / $10M / $2M ($5k Ded.)' },
      { label: 'Total Annual Premium', value: '$42,850.00' },
    ],
    nextAction: 'Routes to Declarations Schedule Verification & Renewal Summary Letterhead (.DOCX)',
  },
  binder: {
    label: 'Insurance Binder / Cover Note',
    filename: 'Chubb_Confirmation_Of_Binder_2026.pdf',
    pages: 4,
    confidence: 95,
    badgeBg: '#FAF5FF',
    badgeColor: '#7E22CE',
    badgeBorder: '#E9D5FF',
    probabilities: { policy: 3, binder: 95, certificate: 0, endorsement: 1, quote: 1 },
    reason: 'Detected Temporary Insurance Binder header, 30-day binder validity window, and binding subjectivities list.',
    extractedPreview: [
      { label: 'Named Insured', value: 'Pacific Cold-Chain Warehousing Inc.' },
      { label: 'Binder Reference #', value: 'BND-2026-88412' },
      { label: 'Binder Validity Period', value: 'Nov 01, 2026 – Dec 01, 2026 (30 Days)' },
      { label: 'Binding Subjectivities', value: 'Signed Sovereign Application & Loss Runs within 15 days' },
      { label: 'Bound Deposit Premium', value: '$38,400.00' },
    ],
    nextAction: 'Routes to Binder Subjectivity Audit & Client Confirmation of Bound Coverage Letter',
  },
  certificate: {
    label: 'Certificate of Insurance (COI / ACORD 25)',
    filename: 'ACORD_25_Pacific_Port_Authority_COI.pdf',
    pages: 1,
    confidence: 98,
    badgeBg: '#ECFDF5',
    badgeColor: '#047857',
    badgeBorder: '#A7F3D0',
    probabilities: { policy: 1, binder: 0, certificate: 98, endorsement: 1, quote: 0 },
    reason: 'Detected ACORD 25 Certificate of Liability Insurance header, Producer block, and Certificate Holder box.',
    extractedPreview: [
      { label: 'Insured', value: 'Apex Logistics Ltd' },
      { label: 'Certificate Holder', value: 'Pacific Port Authority & Terminal Operators' },
      { label: 'Additional Insured / WOS', value: 'Yes — Blanket AI & Waiver of Subrogation Confirmed' },
      { label: 'Evidenced CGL & Auto Limits', value: '$5,000,000 Each Occurrence / $2,000,000 Auto' },
      { label: 'Certificate Issue Date', value: 'November 09, 2026' },
    ],
    nextAction: 'Routes to Third-Party Lease/Contract Compliance Check & COI Cover Note',
  },
  endorsement: {
    label: 'Policy Endorsement / Amendment',
    filename: 'Endorsement_04_Equipment_Floater_Add.pdf',
    pages: 2,
    confidence: 94,
    badgeBg: '#FFFBEB',
    badgeColor: '#B45309',
    badgeBorder: '#FDE68A',
    probabilities: { policy: 4, binder: 1, certificate: 0, endorsement: 94, quote: 1 },
    reason: 'Detected "THIS ENDORSEMENT CHANGES THE POLICY" statutory banner and mid-term schedule amendment.',
    extractedPreview: [
      { label: 'Amended Policy #', value: 'APX-2026-COMM-7789 (Endorsement #4)' },
      { label: 'Effective Date of Change', value: 'November 15, 2026' },
      { label: 'Schedule Modification', value: 'Added Hub #4 Cold-Storage Facility ($3,500,000 Limit)' },
      { label: 'Pro-Rata Additional Premium', value: '+$2,410.00' },
      { label: 'Underwriting Carrier', value: 'Chubb Commercial Casualty' },
    ],
    nextAction: 'Routes to Endorsement Verification & Client Mid-Term Change Advisory',
  },
};

const FAQ_ITEMS = [
  {
    q: 'Does any client policy data or PII ever leave our local brokerage node?',
    a: 'No. TwinCover is engineered for 100% local data sovereignty. Step-1 document type classification, PDF vision extraction, LLM schedule parsing (via local Ollama qwen2.5), and ChromaDB vector indexing all run on your local GPU workstation or private sovereign node. Zero bytes are sent to external AI training clouds.',
  },
  {
    q: 'How does the Step-1 Document Type Determination work?',
    a: 'When a broker drops a PDF into the intake zone, TwinCover immediately evaluates the opening 1–2 pages using a calibrated System-1 probability classifier ensembled with your local LLM. In under 300ms, it classifies the file as a Policy, Binder, Certificate (COI), Endorsement, or Quote and lets the broker confirm or override before running deep extraction.',
  },
  {
    q: 'Can we use our brokerage’s existing Microsoft Word (.docx) letterhead?',
    a: 'Yes. You can upload your official corporate .docx letterhead containing your logos, headers, footers, and typography. TwinCover merges verified policy fields ({{insured_name}}, {{policy_number}}, {{total_premium}}) and dynamically builds the {{coverages_table}} directly inside your Word document.',
  },
  {
    q: 'What stage of development is TwinCover currently in?',
    a: 'TwinCover is an active work-in-progress vertical suite. The core 4-step pipeline—Sovereign Document Type Determination, Declarations Schedule Extraction, Side-by-Side Broker Verification, Word/PDF Renewal Letter Synthesis, and Client-Isolated RAG Q&A—is live and testable today in the demo workspace.',
  },
];

export default function LandingPage({
  isAuthenticated,
  onLaunchWorkspace,
  onOpenAuth,
  onDemoLoginSuccess,
}) {
  const [selectedPreviewType, setSelectedPreviewType] = useState('policy');
  const [launchingDemo, setLaunchingDemo] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const activePreview = INTERACTIVE_DOC_PREVIEWS[selectedPreviewType];

  const handleTryLiveDemo = async () => {
    if (isAuthenticated) {
      onLaunchWorkspace();
      return;
    }
    setLaunchingDemo(true);
    try {
      await authApi.login('broker@twincover.com', 'TwinCover2026!');
      if (onDemoLoginSuccess) {
        onDemoLoginSuccess();
      }
    } catch (e) {
      if (onOpenAuth) onOpenAuth('login');
    } finally {
      setLaunchingDemo(false);
    }
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', display: 'flex', flexDirection: 'column' }}>
      {/* =========================================================================
          HERO SECTION (TwinFlow Executive Style)
         ========================================================================= */}
      <section style={{
        padding: '64px 24px 56px',
        maxWidth: '1240px',
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Eyebrow Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '999px',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          color: '#1D4ED8',
          fontSize: '12px',
          fontWeight: 600,
          marginBottom: '22px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB' }} />
          <span>Sovereign Commercial Insurance AI</span>
          <span style={{ color: '#94A3B8' }}>•</span>
          <span style={{ color: '#047857', fontWeight: 700 }}>100% Local Zero-Offsite Data</span>
          <span style={{ color: '#94A3B8' }}>•</span>
          <span style={{ color: '#475569', fontWeight: 500 }}>Active Build Preview</span>
        </div>

        {/* Main Headline */}
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 54px)',
          fontWeight: 800,
          color: '#0F172A',
          letterSpacing: '-0.03em',
          lineHeight: 1.12,
          maxWidth: '900px',
          marginBottom: '20px',
        }}>
          Turn Carrier Policies, Binders & COIs into{' '}
          <span style={{ color: '#2563EB' }}>Verified Client Deliverables</span>{' '}
          in Seconds.
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '17px',
          color: '#475569',
          maxWidth: '720px',
          lineHeight: 1.6,
          marginBottom: '32px',
        }}>
          Commercial insurance brokers spend hours manually checking 60-page renewal declarations and re-typing coverage schedules into client letters. TwinCover classifies incoming documents, extracts structured limits on your local sovereign GPU node, provides side-by-side verification, and exports polished Word (<code>.docx</code>) client advisories.
        </p>

        {/* Primary CTA Buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '48px',
        }}>
          <button
            type="button"
            onClick={handleTryLiveDemo}
            disabled={launchingDemo}
            className="btn btn-primary"
            style={{
              padding: '13px 26px',
              fontSize: '14.5px',
              fontWeight: 700,
              borderRadius: '12px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Zap size={17} />
            <span>
              {launchingDemo
                ? 'Launching Demo Workspace...'
                : isAuthenticated
                  ? 'Open Broker Workspace'
                  : 'Launch Live Demo Workspace (1-Click)'}
            </span>
            <ArrowRight size={17} />
          </button>

          <button
            type="button"
            onClick={() => scrollToSection('pipeline-demo')}
            className="btn btn-secondary"
            style={{
              padding: '13px 22px',
              fontSize: '14.5px',
              fontWeight: 600,
              borderRadius: '12px',
            }}
          >
            <Cpu size={17} color="#2563EB" />
            <span>See How It Works</span>
          </button>

          {!isAuthenticated && (
            <button
              type="button"
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="btn btn-ghost"
              style={{
                padding: '13px 18px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '12px',
              }}
            >
              <span>Broker Sign In</span>
            </button>
          )}
        </div>

        {/* 4 Trust Pillars Grid (TwinFlow Card Style) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          width: '100%',
          maxWidth: '1100px',
          textAlign: 'left',
        }}>
          <div className="pro-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1D4ED8', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              <Cpu size={16} />
              <span>1. Instant Document Triage</span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.55 }}>
              Determines whether an upload is a Policy, Binder, Certificate (COI), Endorsement, or Quote in under 300ms with calibrated probabilities.
            </p>
          </div>

          <div className="pro-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              <Lock size={16} />
              <span>2. 100% Local Sovereignty</span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.55 }}>
              Zero offsite data exposure. Vision OCR, LLM schedule extraction, and vector embeddings execute entirely on your local node.
            </p>
          </div>

          <div className="pro-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7E22CE', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              <CheckCircle2 size={16} />
              <span>3. Side-by-Side Audit</span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.55 }}>
              Split-screen verification pairs the raw declarations schedule with editable coverage rows so no limit or deductible goes unchecked.
            </p>
          </div>

          <div className="pro-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#B45309', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              <FileText size={16} />
              <span>4. Official .DOCX & RAG</span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.55 }}>
              Merges verified schedules directly into your brokerage’s Word letterhead and indexes policies into client-isolated ChromaDB.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          INTERACTIVE PIPELINE PREVIEW: STEP-1 DOCUMENT DETERMINATION
         ========================================================================= */}
      <section
        id="pipeline-demo"
        style={{
          padding: '56px 24px',
          background: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: '#F1F5F9',
              color: '#334155',
              fontSize: '11.5px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
            }}>
              Interactive Architecture Walkthrough
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>
              Starts With Intelligent Document Type Determination
            </h2>
            <p style={{ fontSize: '15px', color: '#475569', maxWidth: '680px', margin: '8px auto 0' }}>
              Brokers deal with more than just policies. Click any document type below to see how TwinCover’s local System-1 classifier triages incoming PDFs before extraction.
            </p>
          </div>

          {/* Interactive Selector Tabs */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            marginBottom: '28px',
          }}>
            {Object.entries(INTERACTIVE_DOC_PREVIEWS).map(([key, item]) => {
              const active = selectedPreviewType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPreviewType(key)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: active ? `2px solid ${item.badgeColor}` : '1px solid #CBD5E1',
                    background: active ? item.badgeBg : '#F8FAFC',
                    color: active ? item.badgeColor : '#334155',
                    fontWeight: 700,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Interactive Preview Card */}
          <div className="pro-card" style={{
            padding: '28px',
            borderRadius: '20px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
          }}>
            {/* Left Column: Step 1 Classification Output */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '22px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#2563EB',
                  background: '#EFF6FF',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  border: '1px solid #BFDBFE',
                }}>
                  Step 1 • Sovereign Classifier Output
                </span>
                <span style={{ fontSize: '12px', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                  {activePreview.pages} Page{activePreview.pages > 1 ? 's' : ''} • &lt;15ms Local
                </span>
              </div>

              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <FileText size={18} color={activePreview.badgeColor} />
                <span>{activePreview.filename}</span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <span style={{
                  display: 'inline-block',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: activePreview.badgeBg,
                  color: activePreview.badgeColor,
                  border: `1px solid ${activePreview.badgeBorder}`,
                }}>
                  Detected: {activePreview.label} ({activePreview.confidence}% Confidence)
                </span>
              </div>

              <p style={{
                fontSize: '13px',
                color: '#475569',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                padding: '10px 12px',
                borderRadius: '10px',
                marginBottom: '16px',
                lineHeight: 1.5,
              }}>
                {activePreview.reason}
              </p>

              {/* Probability Distribution Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Calibrated Class Probabilities:
                </div>
                {Object.entries(activePreview.probabilities).map(([k, pct]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px' }}>
                    <span style={{ width: '95px', textTransform: 'capitalize', fontWeight: pct > 50 ? 700 : 500, color: pct > 50 ? '#0F172A' : '#64748B' }}>
                      {k}
                    </span>
                    <div style={{ flex: 1, height: '7px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(2, pct)}%`,
                        height: '100%',
                        background: pct > 50 ? activePreview.badgeColor : '#94A3B8',
                        borderRadius: '999px',
                      }} />
                    </div>
                    <span style={{ width: '38px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: pct > 50 ? activePreview.badgeColor : '#64748B' }}>
                      {pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Step 2 Extracted Schedule Preview */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#047857',
                    background: '#ECFDF5',
                    padding: '3px 9px',
                    borderRadius: '999px',
                    border: '1px solid #A7F3D0',
                  }}>
                    Step 2 • Structured Field Extraction
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                    Side-by-Side Broker Audit
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                  {activePreview.extractedPreview.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '9px 12px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        fontSize: '13px',
                        gap: '12px',
                      }}
                    >
                      <span style={{ color: '#64748B', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ color: '#0F172A', fontWeight: 700, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: '12.5px', color: '#1E3A8A', fontWeight: 600 }}>
                  ⚡ {activePreview.nextAction}
                </div>
                <button
                  type="button"
                  onClick={handleTryLiveDemo}
                  className="btn btn-primary btn-sm"
                >
                  <span>Test With Your PDF</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          WHAT WE'RE BUILDING — TRANSPARENT PRODUCT ROADMAP
         ========================================================================= */}
      <section id="roadmap" style={{ padding: '60px 24px', maxWidth: '1160px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '999px',
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            color: '#B45309',
            fontSize: '11.5px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px',
          }}>
            Work In Progress • Active Build Roadmap
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>
            What We’re Building at TwinCover
          </h2>
          <p style={{ fontSize: '15px', color: '#475569', maxWidth: '680px', margin: '8px auto 0' }}>
            We are building TwinCover in the open as a sovereign AI workstation for commercial insurance brokerages. Here is what is live in the demo today and what is coming next.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '20px',
        }}>
          {/* Column 1: Live Today */}
          <div className="pro-card" style={{ padding: '24px', borderTop: '4px solid #059669' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span className="badge badge-verified">Live & Testable Today (v1.0)</span>
              <CheckCircle2 size={18} color="#059669" />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '12px' }}>
              Core Intake, Verification & Letterhead Suite
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#334155' }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={16} color="#059669" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Step-1 Local Document Classifier:</strong> Instant probability triage for Policies, Binders, COIs, Endorsements & Quotes.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={16} color="#059669" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Sovereign Declarations Extraction:</strong> Local MicroNode vision + <code>qwen2.5:7b-instruct</code> schedule extraction.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={16} color="#059669" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Side-by-Side Broker Audit:</strong> Split-screen schedule verification with dynamic coverage rows.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={16} color="#059669" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Official Word (.DOCX) Letterhead Export:</strong> Preserves brokerage logos, tables, and formatting.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={16} color="#059669" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Client-Isolated RAG Q&A:</strong> Partitioned <code>client_&#123;id&#125;</code> ChromaDB vector search with clause citations.</span>
              </li>
            </ul>
          </div>

          {/* Column 2: In Progress */}
          <div className="pro-card" style={{ padding: '24px', borderTop: '4px solid #2563EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span className="badge badge-blue">In Active Development (v1.1)</span>
              <Clock size={18} color="#2563EB" />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '12px' }}>
              Type-Specific Schemas & Binder Tracking
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#334155' }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Sparkles size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Tailored Extraction per Document Type:</strong> Dedicated field forms for Binders (Subjectivities & Expiry) and COIs (Certificate Holder, AI & WOS status).</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Sparkles size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Binder-to-Policy Reconciliation:</strong> Automatically verify that the issued policy matches the bound terms on the temporary binder.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Sparkles size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Batch Package Intake:</strong> Drop an entire renewal folder (Policy + Invoice + COI + Endorsements) and auto-sort every file.</span>
              </li>
            </ul>
          </div>

          {/* Column 3: Next Up */}
          <div className="pro-card" style={{ padding: '24px', borderTop: '4px solid #7E22CE' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span className="badge badge-purple">Upcoming Roadmap (v1.2+)</span>
              <Layers size={18} color="#7E22CE" />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '12px' }}>
              Year-over-Year Redlining & BMS Sync
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#334155' }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <ArrowRight size={16} color="#7E22CE" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Expiring vs. Renewal Comparison Table:</strong> Automatic side-by-side diff of expiring limits, deductibles, and premium changes.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <ArrowRight size={16} color="#7E22CE" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>Exclusion & Sublimit Alerting:</strong> Flag newly introduced cyber, PFAS, or communicable disease exclusions automatically.</span>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <ArrowRight size={16} color="#7E22CE" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span><strong>BMS / Agency Management Push:</strong> One-click verified schedule export to Applied Epic, Vertafore, and HawkSoft.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FAQ SECTION
         ========================================================================= */}
      <section style={{
        padding: '56px 24px 72px',
        background: '#FFFFFF',
        borderTop: '1px solid #E2E8F0',
      }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 800, textAlign: 'center', marginBottom: '28px' }}>
            Frequently Asked Questions
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="pro-card"
                  style={{
                    borderRadius: '14px',
                    overflow: 'hidden',
                    background: isOpen ? '#F8FAFC' : '#FFFFFF',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    style={{
                      width: '100%',
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#0F172A',
                      cursor: 'pointer',
                      gap: '12px',
                    }}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      size={18}
                      color="#64748B"
                      style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: '0 20px 18px',
                      fontSize: '14px',
                      color: '#475569',
                      lineHeight: 1.65,
                    }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '24px',
        background: '#F1F5F9',
        borderTop: '1px solid #E2E8F0',
        textAlign: 'center',
        fontSize: '12.5px',
        color: '#64748B',
      }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0F172A' }}>
            <Shield size={16} color="#2563EB" />
            <span>TwinCover — Commercial Insurance Verification & Renewal Platform</span>
          </div>
          <div>
            100% Local Sovereign AI Node • Zero Offsite Data Retention
          </div>
        </div>
      </footer>
    </div>
  );
}
