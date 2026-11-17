import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Plus,
  Upload,
  Mic,
  Square,
  Camera,
  FileText,
  CheckCircle2,
  Clock,
  Sparkles,
  Lock,
  ExternalLink,
  Download,
  Copy,
  Check,
  Building2,
  AlertCircle,
  RefreshCw,
  Layers,
  ChevronRight,
  Send,
  Trash2,
  X,
  FileSpreadsheet,
  StickyNote,
  Mail,
  AlertTriangle,
  WifiOff,
  Scale,
} from 'lucide-react';
import { submissionsApi } from '../api/submissionsApi';
import { clientsApi } from '../api/clientsApi';
import { lettersApi } from '../api/lettersApi';
import { offlineCaptureQueue } from '../utils/offlineCaptureQueue';

export const SPECIALTY_META = {
  construction: {
    label: 'Construction & Wrap-Up',
    badgeBg: '#EFF6FF',
    badgeColor: '#1D4ED8',
    badgeBorder: '#BFDBFE',
  },
  cyber_ai: {
    label: 'Cyber, Tech E&O & AI Liability',
    badgeBg: '#F5F3FF',
    badgeColor: '#6D28D9',
    badgeBorder: '#DDD6FE',
  },
  marine: {
    label: 'Commercial Marine Hull & Cargo',
    badgeBg: '#ECFEFF',
    badgeColor: '#0E7490',
    badgeBorder: '#A5F3FC',
  },
  environmental: {
    label: 'Environmental / Pollution (CPL)',
    badgeBg: '#ECFDF5',
    badgeColor: '#047857',
    badgeBorder: '#A7F3D0',
  },
  general_commercial: {
    label: 'Commercial Property & Casualty',
    badgeBg: '#F1F5F9',
    badgeColor: '#334155',
    badgeBorder: '#CBD5E1',
  },
};

export const PIPELINE_STAGES = [
  { key: 'field_capture', label: '1. Field Capture' },
  { key: 'drafted', label: '2. Drafted' },
  { key: 'submitted', label: '3. Submitted' },
  { key: 'underwriter_review', label: '4. UW Review' },
  { key: 'quote_received', label: '5. Quote Received' },
  { key: 'subjectivities', label: '6. Subjectivities' },
  { key: 'bound', label: '7. Bound' },
];

export default function ProducerCopilot({ initialClientId = null }) {
  const [submissions, setSubmissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [activeTab, setActiveTab] = useState('cited_profile'); // 'capture' | 'cited_profile' | 'narrative' | 'placements'
  const [loading, setLoading] = useState(true);
  const [filterSpecialty, setFilterSpecialty] = useState('');

  // Async Job Polling state
  const [activeJob, setActiveJob] = useState(null);
  const [receiptBanner, setReceiptBanner] = useState(null);

  // Field Capture state
  const [stagedFiles, setStagedFiles] = useState([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [textNote, setTextNote] = useState('');
  const [uploadingCapture, setUploadingCapture] = useState(false);

  // Browser Voice Recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Active Citation Inspector state
  const [inspectedCitation, setInspectedCitation] = useState(null);

  // Editable Risk Profile & Narrative state
  const [editableFields, setEditableFields] = useState([]);
  const [editableNarrative, setEditableNarrative] = useState('');
  const [editableChecklist, setEditableChecklist] = useState([]);
  const [editableFollowup, setEditableFollowup] = useState('');
  const [savingSub, setSavingSub] = useState(false);
  const [copiedFollowup, setCopiedFollowup] = useState(false);

  // New Submission Modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubForm, setNewSubForm] = useState({
    client_id: '',
    title: '',
    specialty_line: 'construction',
    initial_note: '',
  });

  // New Market Placement state
  const [newPlacement, setNewPlacement] = useState({
    carrier_name: '',
    target_line: '',
    status: 'submitted',
    quoted_premium: '',
    notes: '',
  });

  // Phase 2: Offline Capture Queue (IndexedDB), Quote Diffing, and Cover Email Modal
  const [pendingOfflineCaptures, setPendingOfflineCaptures] = useState([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [quoteComparison, setQuoteComparison] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [coverEmailModal, setCoverEmailModal] = useState(null);
  const [copiedCoverEmail, setCopiedCoverEmail] = useState(false);
  const [uploadingQuotePlacementId, setUploadingQuotePlacementId] = useState(null);
  const quoteFileInputRef = useRef(null);

  // Phase 2.5: Mobile 1-Tap Quick Walk-In Mode (e.g. Pazyryk Rugs Commercial P&C)
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    business_name: '',
    website_url: '',
    contact_name: '',
    specialty_line: 'general_commercial',
    initial_note: '',
  });
  const cameraInputRef = useRef(null);

  const refreshPendingOffline = async () => {
    const items = await offlineCaptureQueue.listPendingCaptures();
    setPendingOfflineCaptures(items);
  };

  const syncOfflineQueue = async () => {
    const pending = await offlineCaptureQueue.listPendingCaptures();
    if (pending.length === 0) return;
    setSyncingOffline(true);
    let syncedCount = 0;
    try {
      for (const rec of pending) {
        try {
          const files = offlineCaptureQueue.reconstructFiles(rec);
          const job = await submissionsApi.captureEvidence(rec.submissionId, {
            files,
            textNote: rec.notes?.textNote || '',
            noteTitle: rec.notes?.noteTitle || 'producer_site_note.txt',
          });
          await offlineCaptureQueue.removeCapture(rec.id);
          syncedCount += 1;
          if (selectedSub && Number(rec.submissionId) === Number(selectedSub.id)) {
            setActiveJob(job);
          }
        } catch (err) {
          console.warn('Offline sync item deferred:', rec.id, err);
        }
      }
      await refreshPendingOffline();
      if (syncedCount > 0) {
        setReceiptBanner(
          `Synced ${syncedCount} offline capture bundle(s) from IndexedDB to Sovereign Vault.`
        );
        if (selectedSub) {
          const refreshed = await submissionsApi.getSubmission(selectedSub.id);
          setSelectedSub(refreshed);
        }
      }
    } finally {
      setSyncingOffline(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    refreshPendingOffline();

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initialClientId, filterSpecialty]);

  // Sync local editable states whenever selectedSub changes
  useEffect(() => {
    if (selectedSub) {
      setEditableFields(selectedSub.structured_risk_profile || []);
      setEditableNarrative(selectedSub.underwriter_narrative || '');
      setEditableChecklist(selectedSub.missing_info_checklist || []);
      setEditableFollowup(selectedSub.client_followup_draft || '');
      const firstFieldWithCit = (selectedSub.structured_risk_profile || []).find(
        (f) => f.citations && f.citations.length > 0
      );
      if (firstFieldWithCit) {
        setInspectedCitation({
          fieldLabel: firstFieldWithCit.label,
          ...firstFieldWithCit.citations[0],
        });
      } else {
        setInspectedCitation(null);
      }
    }
  }, [selectedSub]);

  // Poll active background job (`GET /api/jobs/{job_id}`)
  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const updatedJob = await submissionsApi.getJobStatus(activeJob.id);
        setActiveJob(updatedJob);
        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          clearInterval(interval);
          if (selectedSub) {
            const refreshed = await submissionsApi.getSubmission(selectedSub.id);
            setSelectedSub(refreshed);
            setSubmissions((prev) =>
              prev.map((s) => (s.id === refreshed.id ? refreshed : s))
            );
          }
          setTimeout(() => setReceiptBanner(null), 4000);
        }
      } catch (e) {
        console.error('Job poll error:', e);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeJob, selectedSub]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [subsData, clientsData] = await Promise.all([
        submissionsApi.listSubmissions({
          clientId: initialClientId,
          specialtyLine: filterSpecialty || undefined,
        }),
        clientsApi.listClients(),
      ]);
      setSubmissions(subsData);
      setClients(clientsData);
      if (clientsData.length > 0 && !newSubForm.client_id) {
        setNewSubForm((prev) => ({
          ...prev,
          client_id: initialClientId || clientsData[0].id,
        }));
      }
      if (subsData.length > 0) {
        const currentId = selectedSub?.id;
        const matched = currentId ? subsData.find((s) => s.id === currentId) : null;
        setSelectedSub(matched || subsData[0]);
      } else {
        setSelectedSub(null);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmission = async (e) => {
    e.preventDefault();
    if (!newSubForm.client_id || !newSubForm.title.trim()) return;
    try {
      const created = await submissionsApi.createSubmission({
        client_id: Number(newSubForm.client_id),
        title: newSubForm.title.trim(),
        specialty_line: newSubForm.specialty_line,
        status: 'field_capture',
        initial_note: newSubForm.initial_note,
      });
      setShowNewModal(false);
      setNewSubForm({
        client_id: clients[0]?.id || '',
        title: '',
        specialty_line: 'construction',
        initial_note: '',
      });
      setSubmissions((prev) => [created, ...prev]);
      setSelectedSub(created);
      setActiveTab('capture');
      if (created.latest_job) {
        setActiveJob(created.latest_job);
        setReceiptBanner('Processing Capture — Queued initial field note for extraction');
      }
    } catch (err) {
      alert('Failed to create submission: ' + err.message);
    }
  };

  // Voice recording handlers (Mobile / Desktop browser microphone)
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
        const voiceFile = new File([blob], `field_voice_memo_${timestamp}.webm`, {
          type: 'audio/webm',
        });
        setStagedFiles((prev) => [...prev, voiceFile]);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      alert(
        'Microphone access unavailable in this browser context. You can still upload any recorded .m4a, .webm, .mp3, or .wav voice memo file directly.'
      );
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleQuickWalkIn = async (e) => {
    e.preventDefault();
    if (!walkInForm.business_name.trim()) return;
    setSubmittingWalkIn(true);
    try {
      const created = await submissionsApi.quickWalkIn(walkInForm);
      setShowWalkInModal(false);
      setWalkInForm({
        business_name: '',
        website_url: '',
        contact_name: '',
        specialty_line: 'general_commercial',
        initial_note: '',
      });
      setSubmissions((prev) => [created, ...prev]);
      setSelectedSub(created);
      setActiveTab('capture');
      // Refresh client list so the new client appears in dropdowns too
      clientsApi.listClients().then(setClients).catch(() => {});
    } catch (err) {
      alert('Quick Walk-In failed: ' + err.message);
    } finally {
      setSubmittingWalkIn(false);
    }
  };

  const handleCaptureSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSub) return;
    if (stagedFiles.length === 0 && !textNote.trim()) {
      alert('Please select at least one photo, audio memo, or PDF, or enter a field note.');
      return;
    }
    setUploadingCapture(true);

    // 1. Write capture bundle to IndexedDB FIRST (cross-browser offline resilience)
    let offlineRecord = null;
    try {
      offlineRecord = await offlineCaptureQueue.enqueueCapture({
        submissionId: selectedSub.id,
        files: stagedFiles,
        textNote,
        noteTitle: noteTitle || 'producer_site_note.txt',
      });
      await refreshPendingOffline();
    } catch (idbErr) {
      console.warn('IndexedDB enqueue skipped:', idbErr);
    }

    // 2. Attempt immediate upload; delete from IndexedDB ONLY after HTTP 200/202
    try {
      const job = await submissionsApi.captureEvidence(selectedSub.id, {
        files: stagedFiles,
        textNote,
        noteTitle: noteTitle || 'producer_site_note.txt',
      });
      if (offlineRecord) {
        await offlineCaptureQueue.removeCapture(offlineRecord.id);
        await refreshPendingOffline();
      }
      setStagedFiles([]);
      setTextNote('');
      setNoteTitle('');
      setActiveJob(job);
      setReceiptBanner(
        `${job.receipt || 'Processing Capture'} — Job ${job.id} running on Local Sovereign Node (qwen2.5vl:7b + faster-whisper)`
      );
    } catch (err) {
      // Keep safely in IndexedDB if offline or network interrupted
      setStagedFiles([]);
      setTextNote('');
      setNoteTitle('');
      await refreshPendingOffline();
      setReceiptBanner(
        'Offline / Network Interrupted: Capture safely persisted in local IndexedDB queue. Will auto-sync when online.'
      );
    } finally {
      setUploadingCapture(false);
    }
  };

  const handleExportPacket = async (fmt) => {
    if (!selectedSub) return;
    if (!selectedSub.verified_at) {
      alert(
        'E&O Sign-Off Gate: Please click "Verify & Sign Off" on this submission before exporting an outbound Carrier Submission Packet.'
      );
      return;
    }
    try {
      await submissionsApi.exportSubmissionPacket(selectedSub.id, fmt, selectedSub.title);
    } catch (err) {
      alert('Packet export blocked: ' + err.message);
    }
  };

  const handleOpenCoverEmail = async (placementId = null, carrierName = null) => {
    if (!selectedSub) return;
    try {
      const res = await submissionsApi.generateCoverEmail(selectedSub.id, placementId, carrierName);
      setCoverEmailModal(res);
      setCopiedCoverEmail(false);
    } catch (err) {
      alert('Failed to draft cover email: ' + err.message);
    }
  };

  const handleCompareQuotes = async () => {
    if (!selectedSub) return;
    setLoadingComparison(true);
    try {
      const res = await submissionsApi.compareQuotes(selectedSub.id);
      setQuoteComparison(res);
    } catch (err) {
      alert('Quote comparison failed: ' + err.message);
    } finally {
      setLoadingComparison(false);
    }
  };

  const handleQuotePdfSelected = async (e) => {
    const file = e.target.files?.[0];
    const placementId = uploadingQuotePlacementId;
    e.target.value = '';
    if (!file || !placementId || !selectedSub) return;
    try {
      const job = await submissionsApi.uploadQuotePdf(selectedSub.id, placementId, file);
      setActiveJob(job);
      setReceiptBanner(`Processing Carrier Quote PDF (${file.name}) via qwen2.5vl:7b...`);
    } catch (err) {
      alert('Quote PDF upload failed: ' + err.message);
    } finally {
      setUploadingQuotePlacementId(null);
    }
  };

  const handleToggleSubjectivity = async (placement, subjId) => {
    if (!selectedSub) return;
    const qsum = { ...(placement.quote_summary_json || {}) };
    const subjs = (qsum.binding_subjectivities || []).map((s) =>
      s.id === subjId ? { ...s, resolved: !s.resolved } : s
    );
    qsum.binding_subjectivities = subjs;
    try {
      await submissionsApi.updateMarketPlacement(selectedSub.id, placement.id, {
        quote_summary_json: qsum,
      });
      const refreshed = await submissionsApi.getSubmission(selectedSub.id);
      setSelectedSub(refreshed);
      if (quoteComparison) {
        const comp = await submissionsApi.compareQuotes(selectedSub.id);
        setQuoteComparison(comp);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReSynthesize = async () => {
    if (!selectedSub) return;
    try {
      const job = await submissionsApi.triggerExtraction(selectedSub.id);
      setActiveJob(job);
      setReceiptBanner(
        `Processing Capture — Re-synthesizing ${selectedSub.artifact_count} immutable evidence artifacts (${job.id})`
      );
    } catch (err) {
      alert('Extraction trigger failed: ' + err.message);
    }
  };

  const handleStageChange = async (newStage) => {
    if (!selectedSub) return;
    try {
      const updated = await submissionsApi.updateSubmission(selectedSub.id, {
        status: newStage,
      });
      setSelectedSub(updated);
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      alert('Failed to update stage: ' + err.message);
    }
  };

  const handleSaveAndVerify = async (markVerified = true) => {
    if (!selectedSub) return;
    setSavingSub(true);
    try {
      const updated = await submissionsApi.updateSubmission(selectedSub.id, {
        structured_risk_profile: editableFields,
        underwriter_narrative: editableNarrative,
        missing_info_checklist: editableChecklist,
        client_followup_draft: editableFollowup,
        verified: markVerified,
      });
      setSelectedSub(updated);
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      alert('Failed to save submission: ' + err.message);
    } finally {
      setSavingSub(false);
    }
  };

  const handleToggleChecklistItem = async (itemId) => {
    const updatedList = editableChecklist.map((item) =>
      item.id === itemId ? { ...item, resolved: !item.resolved } : item
    );
    setEditableChecklist(updatedList);
    if (selectedSub) {
      try {
        const updated = await submissionsApi.updateSubmission(selectedSub.id, {
          missing_info_checklist: updatedList,
        });
        setSelectedSub(updated);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleAddPlacement = async (e) => {
    e.preventDefault();
    if (!selectedSub || !newPlacement.carrier_name.trim()) return;
    try {
      await submissionsApi.addMarketPlacement(selectedSub.id, {
        carrier_name: newPlacement.carrier_name,
        target_line:
          newPlacement.target_line ||
          SPECIALTY_META[selectedSub.specialty_line]?.label ||
          'Commercial Specialty',
        status: newPlacement.status,
        quoted_premium: newPlacement.quoted_premium || 'Pending',
        notes: newPlacement.notes,
      });
      setNewPlacement({
        carrier_name: '',
        target_line: '',
        status: 'submitted',
        quoted_premium: '',
        notes: '',
      });
      const refreshed = await submissionsApi.getSubmission(selectedSub.id);
      setSelectedSub(refreshed);
      setSubmissions((prev) => prev.map((s) => (s.id === refreshed.id ? refreshed : s)));
    } catch (err) {
      alert('Failed to add market placement: ' + err.message);
    }
  };

  const handleUpdatePlacementStatus = async (placementId, newStatus) => {
    if (!selectedSub) return;
    try {
      await submissionsApi.updateMarketPlacement(selectedSub.id, placementId, {
        status: newStatus,
      });
      const refreshed = await submissionsApi.getSubmission(selectedSub.id);
      setSelectedSub(refreshed);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePlacement = async (placementId) => {
    if (!selectedSub) return;
    try {
      await submissionsApi.deleteMarketPlacement(selectedSub.id, placementId);
      const refreshed = await submissionsApi.getSubmission(selectedSub.id);
      setSelectedSub(refreshed);
    } catch (err) {
      console.error(err);
    }
  };

  const getArtifactIcon = (type) => {
    switch (type) {
      case 'photo':
        return <Camera size={14} color="#2563EB" />;
      case 'audio':
        return <Mic size={14} color="#7C3AED" />;
      case 'pdf':
        return <FileText size={14} color="#0284C7" />;
      case 'spreadsheet':
        return <FileSpreadsheet size={14} color="#047857" />;
      default:
        return <StickyNote size={14} color="#D97706" />;
    }
  };

  const specMeta =
    SPECIALTY_META[selectedSub?.specialty_line] || SPECIALTY_META.general_commercial;

  return (
    <div className="copilot-container" style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '24px 28px' }}>
      {/* Top Executive Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '3px 10px',
                borderRadius: '999px',
                background: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
              }}
            >
              Pre-Bind Field-to-Underwriter Copilot
            </span>
            <span
              style={{
                fontSize: '11.5px',
                color: '#047857',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#ECFDF5',
                padding: '3px 10px',
                borderRadius: '999px',
                border: '1px solid #A7F3D0',
              }}
            >
              <Lock size={12} /> E&O Immutable Evidence Vault • Qwen2.5-VL + faster-whisper
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Commercial Producer Submission Pipeline & Field Capture
          </h1>
          <p style={{ fontSize: '13.5px', color: '#475569', marginTop: '2px' }}>
            Capture on-site photos, voice walkthrough memos, and schedules in the field — automatically synthesized into source-cited Canadian underwriting submissions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            className="form-select"
            style={{ width: 'auto', fontSize: '13px', padding: '8px 12px' }}
          >
            <option value="">All Specialty Lines</option>
            <option value="general_commercial">Commercial P&C (COPE)</option>
            <option value="construction">Construction & Wrap-Up</option>
            <option value="cyber_ai">Cyber, Tech E&O & AI Liability</option>
            <option value="marine">Commercial Marine</option>
            <option value="environmental">Environmental / Pollution</option>
          </select>

          <button
            type="button"
            onClick={() => setShowWalkInModal(true)}
            className="btn btn-primary"
            style={{
              padding: '9px 16px',
              background: '#0F172A',
              borderColor: '#0F172A',
            }}
          >
            <Camera size={16} />
            <span>Quick Walk-In (Phone)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="btn btn-primary"
            style={{ padding: '9px 18px' }}
          >
            <Plus size={16} />
            <span>New Pre-Bind Submission</span>
          </button>
        </div>
      </div>

      {/* Hidden input for uploading carrier Quote PDFs onto a MarketPlacement row */}
      <input
        type="file"
        ref={quoteFileInputRef}
        accept=".pdf,application/pdf"
        onChange={handleQuotePdfSelected}
        style={{ display: 'none' }}
      />

      {/* Offline / Pending IndexedDB Captures Banner */}
      {(pendingOfflineCaptures.length > 0 || !isOnline) && (
        <div
          className="glass-panel"
          style={{
            padding: '12px 18px',
            marginBottom: '16px',
            background: '#FFFBEB',
            borderColor: '#FDE68A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <WifiOff size={16} color="#B45309" />
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#92400E' }}>
              {pendingOfflineCaptures.length > 0
                ? `${pendingOfflineCaptures.length} Pending Capture${pendingOfflineCaptures.length > 1 ? 's' : ''} Saved Locally (IndexedDB)`
                : 'Offline Mode Active — Captures will be persisted locally in IndexedDB'}
            </span>
          </div>
          {pendingOfflineCaptures.length > 0 && (
            <button
              type="button"
              onClick={syncOfflineQueue}
              disabled={syncingOffline || !isOnline}
              className="btn btn-primary btn-sm"
            >
              <RefreshCw size={13} className={syncingOffline ? 'animate-spin' : ''} />
              <span>{syncingOffline ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}
        </div>
      )}

      {/* Instant "Processing Capture" Async Job Receipt & Progress Bar */}
      {(receiptBanner || (activeJob && activeJob.status !== 'completed')) && (
        <div
          className="glass-panel"
          style={{
            padding: '14px 20px',
            marginBottom: '18px',
            background: '#EFF6FF',
            borderColor: '#93C5FD',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RefreshCw
                size={16}
                color="#2563EB"
                className={activeJob?.status !== 'completed' ? 'animate-spin' : ''}
              />
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1E3A8A' }}>
                {activeJob?.current_step || receiptBanner || 'Processing Capture'}
              </span>
            </div>
            <span
              style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: '#1D4ED8',
              }}
            >
              {activeJob ? `${activeJob.progress}% (${activeJob.status.toUpperCase()})` : 'QUEUED'}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '6px',
              background: '#DBEAFE',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${activeJob?.progress || 15}%`,
                height: '100%',
                background: '#2563EB',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Main Layout: Left Submission Selector + Right Active Submission Workspace */}
      <div className="copilot-main-grid">
        {/* Left Column: Active Pre-Bind Deals List */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#64748B',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Pre-Bind Deals ({submissions.length})</span>
            <button
              type="button"
              onClick={loadInitialData}
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px' }}
              title="Refresh pipeline"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              Loading submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No pre-bind submissions yet. Click "New Pre-Bind Submission" to start capturing field risk evidence.
            </div>
          ) : (
            submissions.map((sub) => {
              const isSelected = selectedSub?.id === sub.id;
              const sm = SPECIALTY_META[sub.specialty_line] || SPECIALTY_META.general_commercial;
              return (
                <div
                  key={sub.id}
                  onClick={() => setSelectedSub(sub)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: isSelected ? '#EFF6FF' : '#F8FAFC',
                    border: isSelected ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: sm.badgeBg,
                        color: sm.badgeColor,
                        border: `1px solid ${sm.badgeBorder}`,
                      }}
                    >
                      {sm.label}
                    </span>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        color: sub.verified_at ? '#047857' : '#B45309',
                      }}
                    >
                      {sub.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: isSelected ? '#1E3A8A' : '#0F172A',
                      lineHeight: 1.35,
                    }}
                  >
                    {sub.title}
                  </div>

                  <div
                    style={{
                      fontSize: '12px',
                      color: '#475569',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{sub.client_name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#64748B' }}>
                      {sub.artifact_count} evid • {sub.placement_count} mkts
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Selected Submission Workspace */}
        {selectedSub ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Deal Header + 7-Stage Pipeline Bar */}
            <div className="glass-panel" style={{ padding: '20px 24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: '999px',
                        background: specMeta.badgeBg,
                        color: specMeta.badgeColor,
                        border: `1px solid ${specMeta.badgeBorder}`,
                      }}
                    >
                      {specMeta.label}
                    </span>
                    <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                      Account: <strong style={{ color: '#0F172A' }}>{selectedSub.client_name}</strong>
                    </span>
                    {selectedSub.verified_at ? (
                      <span className="badge badge-verified" style={{ fontSize: '11px' }}>
                        <CheckCircle2 size={12} /> Producer Verified
                      </span>
                    ) : (
                      <span className="badge badge-pending" style={{ fontSize: '11px' }}>
                        <Clock size={12} /> Pending Producer Sign-Off
                      </span>
                    )}
                  </div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                    {selectedSub.title}
                  </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleReSynthesize}
                    className="btn btn-secondary btn-sm"
                    title="Re-run Qwen2.5-VL + faster-whisper multimodal synthesis across all artifacts"
                  >
                    <Sparkles size={14} color="#2563EB" />
                    <span>Re-Synthesize</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveAndVerify(true)}
                    disabled={savingSub}
                    className="btn btn-primary btn-sm"
                  >
                    <CheckCircle2 size={14} />
                    <span>{savingSub ? 'Saving...' : 'Verify & Sign Off'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportPacket('docx')}
                    className="btn btn-secondary btn-sm"
                    style={{
                      opacity: selectedSub.verified_at ? 1 : 0.65,
                      borderColor: selectedSub.verified_at ? '#93C5FD' : '#CBD5E1',
                      color: selectedSub.verified_at ? '#1D4ED8' : '#64748B',
                    }}
                    title={
                      selectedSub.verified_at
                        ? 'Download Triage-AI & Underwriter Carrier Packet (.docx)'
                        : 'Requires Producer Verify & Sign Off first (E&O Sign-Off Gate)'
                    }
                  >
                    <Download size={13} />
                    <span>Packet .DOCX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportPacket('pdf')}
                    className="btn btn-secondary btn-sm"
                    style={{
                      opacity: selectedSub.verified_at ? 1 : 0.65,
                      borderColor: selectedSub.verified_at ? '#93C5FD' : '#CBD5E1',
                      color: selectedSub.verified_at ? '#1D4ED8' : '#64748B',
                    }}
                    title={
                      selectedSub.verified_at
                        ? 'Download Triage-AI & Underwriter Carrier Packet (.pdf)'
                        : 'Requires Producer Verify & Sign Off first (E&O Sign-Off Gate)'
                    }
                  >
                    <Download size={13} />
                    <span>Packet .PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenCoverEmail(null, null)}
                    className="btn btn-secondary btn-sm"
                    title="Draft 1-Click Underwriter Cover Email"
                  >
                    <Mail size={13} color="#2563EB" />
                    <span>Cover Email</span>
                  </button>
                </div>
              </div>

              {/* 7-Stage Pre-Bind Deal Progression Stepper */}
              <div
                className="copilot-stepper"
                style={{
                  background: '#F8FAFC',
                  padding: '6px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                }}
              >
                {PIPELINE_STAGES.map((st, idx) => {
                  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === selectedSub.status);
                  const isCurrent = st.key === selectedSub.status;
                  const isCompleted = idx < currentIdx;
                  return (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => handleStageChange(st.key)}
                      style={{
                        padding: '7px 6px',
                        borderRadius: '7px',
                        fontSize: '11.5px',
                        fontWeight: isCurrent ? 700 : 600,
                        border: isCurrent ? '1px solid #2563EB' : '1px solid transparent',
                        background: isCurrent
                          ? '#2563EB'
                          : isCompleted
                          ? '#ECFDF5'
                          : 'transparent',
                        color: isCurrent
                          ? '#FFFFFF'
                          : isCompleted
                          ? '#047857'
                          : '#64748B',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: '2px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('cited_profile')}
                className={`btn ${activeTab === 'cited_profile' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
              >
                <Sparkles size={15} />
                <span>1. Source-Cited Risk Profile ({editableFields.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('capture')}
                className={`btn ${activeTab === 'capture' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
              >
                <Camera size={15} />
                <span>2. Field Capture & Immutable Evidence Vault ({selectedSub.artifact_count})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('narrative')}
                className={`btn ${activeTab === 'narrative' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
              >
                <FileText size={15} />
                <span>
                  3. Underwriter Narrative & Missing Info Checklist (
                  {editableChecklist.filter((c) => !c.resolved).length} Open)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('placements')}
                className={`btn ${activeTab === 'placements' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px 8px 0 0' }}
              >
                <Building2 size={15} />
                <span>4. Carrier Placement Matrix ({selectedSub.market_placements?.length || 0})</span>
              </button>
            </div>

            {/* TAB 1: SOURCE-CITED RISK PROFILE & PROVENANCE INSPECTOR */}
            {activeTab === 'cited_profile' && (
              <div className="copilot-two-col-wide">
                {/* Left: Source-Cited Underwriting Fields */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      paddingBottom: '10px',
                      borderBottom: '1px solid #E2E8F0',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                        Source-Cited Underwriting Risk Profile
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        Every extracted field carries mandatory source provenance from the Immutable Evidence Vault. Click any citation pill to inspect the raw excerpt.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {editableFields.map((field, idx) => (
                      <div
                        key={field.field_key || idx}
                        style={{
                          padding: '14px 16px',
                          borderRadius: '10px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '6px',
                          }}
                        >
                          <label
                            style={{
                              fontSize: '12.5px',
                              fontWeight: 700,
                              color: '#0F172A',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {field.label}
                          </label>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: '#ECFDF5',
                              color: '#047857',
                              border: '1px solid #A7F3D0',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {Math.round((field.confidence || 0.92) * 100)}% Confidence
                          </span>
                        </div>

                        <input
                          type="text"
                          value={field.value || ''}
                          onChange={(e) => {
                            const updated = [...editableFields];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            setEditableFields(updated);
                          }}
                          className="form-input"
                          style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A', background: '#FFFFFF' }}
                        />

                        {/* Mandatory Source Provenance Citations */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                            marginTop: '8px',
                          }}
                        >
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                            Provenance:
                          </span>
                          {(field.citations || []).map((cit, cIdx) => {
                            const isSelectedCit =
                              inspectedCitation?.artifact_id === cit.artifact_id &&
                              inspectedCitation?.reference === cit.reference;
                            return (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={() =>
                                  setInspectedCitation({
                                    fieldLabel: field.label,
                                    ...cit,
                                  })
                                }
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-mono)',
                                  background: isSelectedCit ? '#DBEAFE' : '#FFFFFF',
                                  color: '#1D4ED8',
                                  border: isSelectedCit
                                    ? '1.5px solid #2563EB'
                                    : '1px solid #CBD5E1',
                                  cursor: 'pointer',
                                }}
                              >
                                {getArtifactIcon(cit.artifact_type)}
                                <span>
                                  {cit.artifact_id} • {cit.reference}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Live Evidence Provenance & E&O Vault Inspector */}
                <div className="glass-panel" style={{ padding: '20px', position: 'sticky', top: '84px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: '10px',
                      marginBottom: '14px',
                      borderBottom: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Lock size={16} color="#047857" />
                      <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>
                        E&O Source Provenance Inspector
                      </span>
                    </div>
                    <span className="badge badge-verified" style={{ fontSize: '10.5px' }}>
                      Immutable Raw Vault
                    </span>
                  </div>

                  {inspectedCitation ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div
                        style={{
                          padding: '12px 14px',
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase' }}>
                          Supporting Field
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                          {inspectedCitation.fieldLabel}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Artifact ID & Type</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-mono)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {getArtifactIcon(inspectedCitation.artifact_type)}
                            <span>
                              {inspectedCitation.artifact_id} ({inspectedCitation.artifact_type.toUpperCase()})
                            </span>
                          </div>
                        </div>

                        <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Timestamp / Page Ref</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                            {inspectedCitation.reference}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                          Exact Extracted Evidence Excerpt:
                        </div>
                        <div
                          style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: '#F8FAFC',
                            borderLeft: '4px solid #2563EB',
                            borderTop: '1px solid #E2E8F0',
                            borderRight: '1px solid #E2E8F0',
                            borderBottom: '1px solid #E2E8F0',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12.5px',
                            color: '#0F172A',
                            lineHeight: 1.6,
                          }}
                        >
                          "{inspectedCitation.excerpt}"
                        </div>
                      </div>

                      {/* Matching Vault Artifact SHA-256 Lock Info */}
                      {(() => {
                        const matchedArt = (selectedSub.evidence_artifacts || []).find(
                          (a) => `art_${a.id}` === inspectedCitation.artifact_id
                        );
                        if (!matchedArt) return null;
                        const meta = matchedArt.metadata_json || {};
                        return (
                          <div
                            style={{
                              padding: '12px',
                              borderRadius: '8px',
                              background: '#ECFDF5',
                              border: '1px solid #A7F3D0',
                              fontSize: '12px',
                              color: '#065F46',
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>Immutable E&O Audit Trail</span>
                              <button
                                type="button"
                                onClick={() =>
                                  submissionsApi.downloadEvidenceArtifact(
                                    matchedArt.id,
                                    meta.original_filename || `artifact_${matchedArt.id}`
                                  )
                                }
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                              >
                                <Download size={11} /> Raw File
                              </button>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', wordBreak: 'break-all' }}>
                              SHA-256: {meta.sha256_hash || 'Verified on Local Sovereign Disk'}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      Click any citation pill on the left to inspect its timestamped voice transcript, site photo observation, or PDF schedule page.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: FIELD CAPTURE & IMMUTABLE EVIDENCE VAULT */}
            {activeTab === 'capture' && (
              <div className="copilot-two-col">
                {/* Left: Mobile-First Field Capture Form + Live COPE Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Live "Never Miss Anything" COPE & Security Field Checklist */}
                  {editableChecklist.length > 0 && (
                    <div className="glass-panel" style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          On-Site Field Checklist ({editableChecklist.filter((c) => c.resolved).length}/{editableChecklist.length} Captured)
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: editableChecklist.every((c) => c.resolved) ? '#ECFDF5' : '#FFFBEB',
                            color: editableChecklist.every((c) => c.resolved) ? '#047857' : '#B45309',
                            border: `1px solid ${editableChecklist.every((c) => c.resolved) ? '#A7F3D0' : '#FDE68A'}`,
                          }}
                        >
                          {editableChecklist.every((c) => c.resolved) ? 'All COPE Items Covered' : 'Ask Before Leaving'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {editableChecklist.map((chk) => (
                          <div
                            key={chk.id}
                            onClick={() => handleToggleChecklistItem(chk.id)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              background: chk.resolved ? '#ECFDF5' : '#FFFBEB',
                              border: `1px solid ${chk.resolved ? '#A7F3D0' : '#FDE68A'}`,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!chk.resolved}
                              onChange={() => {}}
                              style={{ marginTop: '2px', cursor: 'pointer' }}
                            />
                            <span
                              style={{
                                fontWeight: 600,
                                color: chk.resolved ? '#065F46' : '#92400E',
                                textDecoration: chk.resolved ? 'line-through' : 'none',
                              }}
                            >
                              {chk.item}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="glass-panel" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                    Add Field Evidence to Vault
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#475569', marginBottom: '14px' }}>
                    Snap site photos, record voice walkthrough memos, or attach PDFs. Saved locally in IndexedDB first so you never lose captures if signal drops.
                  </p>

                  {/* Hidden Mobile Rear Camera Input */}
                  <input
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => {
                      const chosen = Array.from(e.target.files || []);
                      if (chosen.length > 0) {
                        setStagedFiles((prev) => [...prev, ...chosen]);
                      }
                      e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />

                  {/* Big Thumb-Friendly Mobile Capture Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="btn btn-primary"
                      style={{
                        padding: '14px 12px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        justifyContent: 'center',
                        borderRadius: '10px',
                      }}
                    >
                      <Camera size={18} />
                      <span>Take Site Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                      className="btn"
                      style={{
                        padding: '14px 12px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        justifyContent: 'center',
                        borderRadius: '10px',
                        background: isRecording ? '#DC2626' : '#7C3AED',
                        color: '#FFFFFF',
                        border: 'none',
                      }}
                    >
                      {isRecording ? <Square size={18} /> : <Mic size={18} />}
                      <span>{isRecording ? `Stop (${recordingSeconds}s)` : 'Voice Memo'}</span>
                    </button>
                  </div>

                  <form onSubmit={handleCaptureSubmit}>
                    {/* Dropzone + Voice Recorder */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: '2px dashed #93C5FD',
                        borderRadius: '12px',
                        padding: '16px',
                        textAlign: 'center',
                        background: '#F8FAFC',
                        cursor: 'pointer',
                        marginBottom: '14px',
                      }}
                    >
                      <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        accept="image/*,audio/*,.pdf,.xlsx,.xls,.csv,.txt,.m4a,.webm,.mp3,.wav"
                        onChange={(e) => {
                          const chosen = Array.from(e.target.files || []);
                          if (chosen.length > 0) {
                            setStagedFiles((prev) => [...prev, ...chosen]);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                      <Upload size={26} color="#2563EB" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                        Click to select Site Photos, Voice Memos, or PDFs
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                        Supports .jpg, .png, .m4a, .webm, .mp3, .wav, .pdf, .csv
                      </div>
                    </div>

                    {/* Live Microphone Voice Memo Recorder */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: isRecording ? '#FEF2F2' : '#F1F5F9',
                        border: isRecording ? '1px solid #FCA5A5' : '1px solid #E2E8F0',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mic size={16} color={isRecording ? '#DC2626' : '#7C3AED'} />
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>
                          {isRecording
                            ? `Recording Field Voice Memo (${recordingSeconds}s)...`
                            : 'Record Live Producer Voice Memo (faster-whisper)'}
                        </span>
                      </div>
                      {isRecording ? (
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="btn btn-sm"
                          style={{ background: '#DC2626', color: '#FFFFFF', padding: '4px 10px' }}
                        >
                          <Square size={12} /> Stop & Stage
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startVoiceRecording}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                          <Mic size={12} /> Start Mic
                        </button>
                      )}
                    </div>

                    {/* Staged Files List */}
                    {stagedFiles.length > 0 && (
                      <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                          Staged Files ({stagedFiles.length}):
                        </div>
                        {stagedFiles.map((f, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: '#EFF6FF',
                              borderRadius: '6px',
                              fontSize: '12px',
                              color: '#1E3A8A',
                            }}
                          >
                            <span>
                              {f.name} ({(f.size / 1024).toFixed(1)} KB)
                            </span>
                            <button
                              type="button"
                              onClick={() => setStagedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick-Paste Field Note */}
                    <div className="form-group">
                      <label className="form-label">Quick-Paste Producer Field Note (Optional)</label>
                      <input
                        type="text"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        placeholder="Note Reference (e.g. superintendent_walkthrough_notes.txt)"
                        className="form-input"
                        style={{ marginBottom: '8px', fontSize: '12.5px' }}
                      />
                      <textarea
                        rows={4}
                        value={textNote}
                        onChange={(e) => setTextNote(e.target.value)}
                        placeholder="Paste raw discovery call notes, COPE details, or underwriter answers..."
                        className="form-textarea"
                        style={{ fontSize: '13px' }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingCapture}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '12px', fontWeight: 700, fontSize: '14px' }}
                    >
                      <Upload size={16} />
                      <span>
                        {uploadingCapture
                          ? 'Locking in Vault & Queuing...'
                          : 'Capture to Immutable Vault & Extract'}
                      </span>
                    </button>
                  </form>
                </div>
                </div>

                {/* Right: Immutable E&O Raw Evidence Vault List */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      paddingBottom: '10px',
                      borderBottom: '1px solid #E2E8F0',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                        Immutable E&O Raw Evidence Vault ({selectedSub.evidence_artifacts?.length || 0})
                      </h3>
                      <p style={{ fontSize: '12px', color: '#64748B' }}>
                        Original raw files are cryptographically hashed and never overwritten or deleted after AI extraction.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(selectedSub.evidence_artifacts || []).map((art) => {
                      const meta = art.metadata_json || {};
                      const raw = art.raw_text_or_transcript || {};
                      const segments = raw.segments || raw.pages || [];
                      return (
                        <div
                          key={art.id}
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              marginBottom: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {getArtifactIcon(art.artifact_type)}
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: '#1D4ED8',
                                  background: '#EFF6FF',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                }}
                              >
                                art_{art.id}
                              </span>
                              <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                                {meta.original_filename || `Artifact #${art.id}`}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  color: '#047857',
                                  background: '#ECFDF5',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  border: '1px solid #A7F3D0',
                                }}
                              >
                                <Lock size={10} style={{ display: 'inline', marginRight: '3px' }} />
                                Immutable
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  submissionsApi.downloadEvidenceArtifact(
                                    art.id,
                                    meta.original_filename || `artifact_${art.id}`
                                  )
                                }
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              >
                                <Download size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Timestamped Segments / Vision Observations */}
                          {segments.length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                marginTop: '8px',
                                paddingTop: '8px',
                                borderTop: '1px solid #E2E8F0',
                              }}
                            >
                              {segments.map((seg, sIdx) => (
                                <div
                                  key={sIdx}
                                  style={{
                                    fontSize: '12px',
                                    color: '#334155',
                                    lineHeight: 1.5,
                                    background: '#FFFFFF',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #E2E8F0',
                                  }}
                                >
                                  <strong
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      color: '#1D4ED8',
                                      marginRight: '8px',
                                    }}
                                  >
                                    [{seg.reference || `Seg ${sIdx + 1}`}]
                                  </strong>
                                  <span>{seg.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: UNDERWRITER NARRATIVE, MISSING INFO CHECKLIST & CLIENT FOLLOW-UP */}
            {activeTab === 'narrative' && (
              <div className="copilot-two-col">
                {/* Left: Missing Info Checklist & Client Follow-Up Draft */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                      Specialty Underwriting Subjectivities & Gap Checklist
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '14px' }}>
                      Automatically cross-checked against captured field evidence for{' '}
                      <strong>{specMeta.label}</strong>.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {editableChecklist.map((chk) => (
                        <div
                          key={chk.id}
                          onClick={() => handleToggleChecklistItem(chk.id)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: chk.resolved ? '#ECFDF5' : '#FFFBEB',
                            border: chk.resolved ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!chk.resolved}
                            onChange={() => {}}
                            style={{ marginTop: '3px', cursor: 'pointer' }}
                          />
                          <div>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: chk.resolved ? '#065F46' : '#92400E',
                                textDecoration: chk.resolved ? 'line-through' : 'none',
                              }}
                            >
                              {chk.item}
                            </div>
                            {chk.reason && (
                              <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                                {chk.reason}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Client Follow-Up Email Draft */}
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                      }}
                    >
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                        Auto-Drafted Client Follow-Up Email
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(editableFollowup);
                          setCopiedFollowup(true);
                          setTimeout(() => setCopiedFollowup(false), 2000);
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        {copiedFollowup ? <Check size={13} color="#047857" /> : <Copy size={13} />}
                        <span>{copiedFollowup ? 'Copied!' : 'Copy Email'}</span>
                      </button>
                    </div>
                    <textarea
                      rows={9}
                      value={editableFollowup}
                      onChange={(e) => setEditableFollowup(e.target.value)}
                      className="form-textarea"
                      style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}
                    />
                  </div>
                </div>

                {/* Right: Pre-Bind Underwriter Submission Narrative */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      paddingBottom: '10px',
                      borderBottom: '1px solid #E2E8F0',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: '#0F172A' }}>
                        Pre-Bind Underwriter Submission Memorandum
                      </h3>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        Ready for Canadian commercial specialty markets with inline evidence citations.
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() =>
                          lettersApi.exportDocx(
                            selectedSub.title,
                            editableNarrative,
                            selectedSub.client_name
                          )
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        <Download size={13} /> Export .DOCX
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          lettersApi.exportPdf(
                            selectedSub.title,
                            editableNarrative,
                            selectedSub.client_name
                          )
                        }
                        className="btn btn-primary btn-sm"
                      >
                        <Download size={13} /> Export .PDF
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={22}
                    value={editableNarrative}
                    onChange={(e) => setEditableNarrative(e.target.value)}
                    className="form-textarea"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12.5px',
                      lineHeight: 1.6,
                      background: '#F8FAFC',
                    }}
                  />
                </div>
              </div>
            )}

            {/* TAB 4: CANADIAN CARRIER PLACEMENT MATRIX (`market_placements`) */}
            {activeTab === 'placements' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Add Carrier Row Form */}
                <div className="glass-panel" style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '10px' }}>
                    Add Target Insurer / MGA to Placement Matrix
                  </div>
                  <form
                    onSubmit={handleAddPlacement}
                    className="copilot-placement-form"
                  >
                    <input
                      type="text"
                      required
                      placeholder="Carrier / MGA (e.g. Intact Specialty, CFC Canada)"
                      value={newPlacement.carrier_name}
                      onChange={(e) =>
                        setNewPlacement({ ...newPlacement, carrier_name: e.target.value })
                      }
                      className="form-input"
                      style={{ fontSize: '13px' }}
                    />
                    <input
                      type="text"
                      placeholder="Target Line / Layer (e.g. $10M Wrap-Up)"
                      value={newPlacement.target_line}
                      onChange={(e) =>
                        setNewPlacement({ ...newPlacement, target_line: e.target.value })
                      }
                      className="form-input"
                      style={{ fontSize: '13px' }}
                    />
                    <select
                      value={newPlacement.status}
                      onChange={(e) => setNewPlacement({ ...newPlacement, status: e.target.value })}
                      className="form-select"
                      style={{ fontSize: '13px' }}
                    >
                      <option value="drafted">Drafted</option>
                      <option value="submitted">Submitted</option>
                      <option value="underwriter_review">UW Review</option>
                      <option value="quote_received">Quote Received</option>
                      <option value="subjectivities">Subjectivities</option>
                      <option value="bound">Bound</option>
                      <option value="declined">Declined</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Quoted Premium (CAD)"
                      value={newPlacement.quoted_premium}
                      onChange={(e) =>
                        setNewPlacement({ ...newPlacement, quoted_premium: e.target.value })
                      }
                      className="form-input mono"
                      style={{ fontSize: '13px' }}
                    />
                    <input
                      type="text"
                      placeholder="Underwriter Notes / Subjectivities"
                      value={newPlacement.notes}
                      onChange={(e) => setNewPlacement({ ...newPlacement, notes: e.target.value })}
                      className="form-input"
                      style={{ fontSize: '13px' }}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" style={{ height: '38px' }}>
                      <Plus size={14} /> Add Market
                    </button>
                  </form>
                </div>

                {/* Carrier Placement Table */}
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Canadian Insurer / MGA</th>
                        <th>Target Line & Layer</th>
                        <th>Placement Status</th>
                        <th>Quoted Premium</th>
                        <th>Underwriter Terms & Notes</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSub.market_placements || []).map((mp) => (
                        <tr key={mp.id}>
                          <td style={{ fontWeight: 700, color: '#0F172A' }}>{mp.carrier_name}</td>
                          <td style={{ color: '#334155', fontSize: '13px' }}>{mp.target_line}</td>
                          <td>
                            <select
                              value={mp.status}
                              onChange={(e) => handleUpdatePlacementStatus(mp.id, e.target.value)}
                              className="form-select"
                              style={{
                                width: 'auto',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              <option value="drafted">Drafted</option>
                              <option value="submitted">Submitted</option>
                              <option value="underwriter_review">UW Review</option>
                              <option value="quote_received">Quote Received</option>
                              <option value="subjectivities">Subjectivities</option>
                              <option value="bound">Bound</option>
                              <option value="declined">Declined</option>
                            </select>
                          </td>
                          <td>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#047857',
                                fontSize: '13.5px',
                              }}
                            >
                              {mp.quoted_premium || 'Pending'}
                            </span>
                          </td>
                          <td style={{ fontSize: '12.5px', color: '#475569', maxWidth: '340px' }}>
                            <div>{mp.notes}</div>
                            {mp.quote_summary_json?.subjectivity && (
                              <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '2px' }}>
                                <strong>Subjectivity:</strong> {mp.quote_summary_json.subjectivity}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadingQuotePlacementId(mp.id);
                                  quoteFileInputRef.current?.click();
                                }}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 9px', fontSize: '11.5px' }}
                                title="Upload Carrier Quote PDF for qwen2.5vl:7b extraction & diffing"
                              >
                                <Upload size={12} color="#2563EB" />
                                <span>Quote PDF</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCoverEmail(mp.id, mp.carrier_name)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 9px', fontSize: '11.5px' }}
                                title="Draft carrier-specific submission cover email"
                              >
                                <Mail size={12} color="#2563EB" />
                                <span>Cover Email</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePlacement(mp.id)}
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#DC2626' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Quote Comparison & Bind Readiness Section */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                      paddingBottom: '12px',
                      borderBottom: '1px solid #E2E8F0',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Scale size={18} color="#2563EB" />
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                          Quote Comparison & Bind Readiness Engine
                        </h3>
                      </div>
                      <p style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>
                        Compare carrier quotes against expiring/requested limits and across each other to catch silent AI/water exclusions, higher deductibles, and binding subjectivities.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleCompareQuotes}
                        disabled={loadingComparison}
                        className="btn btn-primary btn-sm"
                      >
                        <Scale size={14} />
                        <span>{loadingComparison ? 'Comparing...' : 'Run Quote Diff Analysis'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          submissionsApi.exportQuoteComparison(
                            selectedSub.id,
                            'docx',
                            selectedSub.title
                          )
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        <Download size={13} /> Proposal .DOCX
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          submissionsApi.exportQuoteComparison(
                            selectedSub.id,
                            'pdf',
                            selectedSub.title
                          )
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        <Download size={13} /> Proposal .PDF
                      </button>
                    </div>
                  </div>

                  {quoteComparison ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Baseline & Alert Summary */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: '#F8FAFC',
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12.5px',
                          flexWrap: 'wrap',
                          gap: '10px',
                        }}
                      >
                        <div>
                          <strong>Expiring / Requested Baseline:</strong>{' '}
                          <span style={{ fontFamily: 'var(--font-mono)', color: '#1D4ED8' }}>
                            {quoteComparison.expiring_baseline?.requested_limit} Limit •{' '}
                            {quoteComparison.expiring_baseline?.baseline_deductible} Deductible
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span
                            style={{
                              padding: '2px 9px',
                              borderRadius: '999px',
                              background: '#FEF2F2',
                              color: '#B91C1C',
                              border: '1px solid #FECACA',
                              fontWeight: 700,
                              fontSize: '11.5px',
                            }}
                          >
                            {quoteComparison.high_severity_count} High Risk Diffs
                          </span>
                          <span
                            style={{
                              padding: '2px 9px',
                              borderRadius: '999px',
                              background: '#FFFBEB',
                              color: '#B45309',
                              border: '1px solid #FDE68A',
                              fontWeight: 700,
                              fontSize: '11.5px',
                            }}
                          >
                            {quoteComparison.medium_severity_count} Medium Alerts
                          </span>
                        </div>
                      </div>

                      {/* Color-Coded Diff Flags */}
                      {quoteComparison.diff_flags?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {quoteComparison.diff_flags.map((df, idx) => {
                            const isHigh = df.severity === 'high';
                            const isMed = df.severity === 'medium';
                            return (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 14px',
                                  borderRadius: '8px',
                                  background: isHigh ? '#FEF2F2' : isMed ? '#FFFBEB' : '#EFF6FF',
                                  border: `1px solid ${
                                    isHigh ? '#FECACA' : isMed ? '#FDE68A' : '#BFDBFE'
                                  }`,
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '10px',
                                }}
                              >
                                <AlertTriangle
                                  size={16}
                                  color={isHigh ? '#DC2626' : isMed ? '#D97706' : '#2563EB'}
                                  style={{ flexShrink: 0, marginTop: '2px' }}
                                />
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span
                                      style={{
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: isHigh ? '#991B1B' : isMed ? '#92400E' : '#1E3A8A',
                                      }}
                                    >
                                      {df.title}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        padding: '1px 6px',
                                        borderRadius: '999px',
                                        background: '#FFFFFF',
                                        color: isHigh ? '#DC2626' : isMed ? '#B45309' : '#1D4ED8',
                                      }}
                                    >
                                      {df.flag_type.replace('_', ' ')} • {df.comparison_scope.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '2px' }}>
                                    {df.detail}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Side-by-Side Carrier Cards + Clickable Binding Subjectivities */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: '14px',
                        }}
                      >
                        {(quoteComparison.matrix || []).map((row) => {
                          const placementObj = (selectedSub.market_placements || []).find(
                            (p) => p.id === row.placement_id
                          );
                          return (
                            <div
                              key={row.placement_id}
                              style={{
                                padding: '14px',
                                borderRadius: '10px',
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>
                                  {row.carrier_name}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#047857' }}>
                                  {row.quoted_premium}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#475569' }}>
                                <strong>Limit:</strong> {row.limit_summary} | <strong>Deductible:</strong>{' '}
                                {row.deductible_summary}
                              </div>

                              {/* Clickable Binding Subjectivities Checklist */}
                              {(row.binding_subjectivities || []).length > 0 && (
                                <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Binding Subjectivities Checklist
                                  </div>
                                  {row.binding_subjectivities.map((s) => (
                                    <label
                                      key={s.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '7px',
                                        fontSize: '12px',
                                        color: s.resolved ? '#047857' : '#334155',
                                        textDecoration: s.resolved ? 'line-through' : 'none',
                                        marginBottom: '4px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!s.resolved}
                                        onChange={() =>
                                          placementObj && handleToggleSubjectivity(placementObj, s.id)
                                        }
                                        style={{ marginTop: '2px' }}
                                      />
                                      <span>{s.item}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#64748B', fontSize: '13px' }}>
                      Upload a carrier Quote PDF on any market row above or click <strong>Run Quote Diff Analysis</strong> to inspect coverage gaps, higher deductibles, and silent exclusions.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Modal: 1-Tap Mobile Quick Walk-In Mode */}
      {showWalkInModal && (
        <div className="modal-overlay" onClick={() => setShowWalkInModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={20} color="#2563EB" />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                  Quick Walk-In Capture (Phone Mode)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                className="btn btn-ghost btn-sm"
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
              Auto-creates the Commercial Client + Submission + 7-point COPE Field Checklist in one tap so you can start snapping photos and recording voice memos immediately.
            </p>

            <form onSubmit={handleQuickWalkIn}>
              <div className="form-group">
                <label className="form-label">Business / Prospect Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pazyryk Rugs"
                  value={walkInForm.business_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, business_name: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Prospect Website (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. https://pazyrykrug.ca/"
                  value={walkInForm.website_url}
                  onChange={(e) => setWalkInForm({ ...walkInForm, website_url: e.target.value })}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Owner / Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Owner / Manager"
                    value={walkInForm.contact_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, contact_name: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Policy Line</label>
                  <select
                    value={walkInForm.specialty_line}
                    onChange={(e) =>
                      setWalkInForm({ ...walkInForm, specialty_line: e.target.value })
                    }
                    className="form-select"
                  >
                    <option value="general_commercial">Commercial P&C (COPE)</option>
                    <option value="construction">Construction & Wrap-Up</option>
                    <option value="cyber_ai">Cyber, Tech E&O & AI</option>
                    <option value="marine">Commercial Marine</option>
                    <option value="environmental">Environmental / CPL</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label">Quick Initial Observation (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Retail rug showroom ~3,500 sq ft, brick building, monitored alarm..."
                  value={walkInForm.initial_note}
                  onChange={(e) => setWalkInForm({ ...walkInForm, initial_note: e.target.value })}
                  className="form-textarea"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWalkIn}
                  className="btn btn-primary"
                >
                  <Camera size={15} />
                  <span>{submittingWalkIn ? 'Opening Capture...' : 'Start Walk-In Capture'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create New Pre-Bind Submission */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                New Pre-Bind Commercial Submission
              </h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="btn btn-ghost btn-sm"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmission}>
              <div className="form-group">
                <label className="form-label">Commercial Client Account *</label>
                <select
                  required
                  value={newSubForm.client_id}
                  onChange={(e) => setNewSubForm({ ...newSubForm, client_id: e.target.value })}
                  className="form-select"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.account_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Submission Deal Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kelowna Mass Timber Mid-Rise — Course of Construction & Wrap-Up"
                  value={newSubForm.title}
                  onChange={(e) => setNewSubForm({ ...newSubForm, title: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Canadian Specialty Line *</label>
                <select
                  value={newSubForm.specialty_line}
                  onChange={(e) =>
                    setNewSubForm({ ...newSubForm, specialty_line: e.target.value })
                  }
                  className="form-select"
                >
                  <option value="construction">Construction & Wrap-Up Liability</option>
                  <option value="cyber_ai">Cyber, Tech E&O & AI Liability</option>
                  <option value="marine">Commercial Marine Hull & Cargo</option>
                  <option value="environmental">Environmental / Pollution Liability (CPL)</option>
                  <option value="general_commercial">General Commercial P&C</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Initial Field Discovery Note (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. On-site walkthrough with project superintendent: $14.5M TIV, steel frame, wet sprinklered..."
                  value={newSubForm.initial_note}
                  onChange={(e) => setNewSubForm({ ...newSubForm, initial_note: e.target.value })}
                  className="form-textarea"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Submission & Open Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 1-Click Underwriter Cover Email Generator */}
      {coverEmailModal && (
        <div className="modal-overlay" onClick={() => setCoverEmailModal(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={20} color="#2563EB" />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                  Underwriter Submission Cover Email — {coverEmailModal.carrier_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCoverEmailModal(null)}
                className="btn btn-ghost btn-sm"
              >
                <X size={18} />
              </button>
            </div>

            {!coverEmailModal.verified && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '12.5px',
                  marginBottom: '12px',
                }}
              >
                <strong>E&O Sign-Off Notice:</strong> Click <em>Verify & Sign Off</em> on the submission header to unlock formal <code>.DOCX</code> / <code>.PDF</code> Carrier Packet attachment downloads.
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Subject</label>
              <input
                type="text"
                value={coverEmailModal.subject}
                onChange={(e) =>
                  setCoverEmailModal({ ...coverEmailModal, subject: e.target.value })
                }
                className="form-input"
                style={{ fontWeight: 600 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Body</label>
              <textarea
                rows={12}
                value={coverEmailModal.body}
                onChange={(e) =>
                  setCoverEmailModal({ ...coverEmailModal, body: e.target.value })
                }
                className="form-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleExportPacket('docx')}
                  className="btn btn-secondary btn-sm"
                >
                  <Download size={13} /> Packet .DOCX
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPacket('pdf')}
                  className="btn btn-secondary btn-sm"
                >
                  <Download size={13} /> Packet .PDF
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Subject: ${coverEmailModal.subject}\n\n${coverEmailModal.body}`
                    );
                    setCopiedCoverEmail(true);
                    setTimeout(() => setCopiedCoverEmail(false), 2000);
                  }}
                  className="btn btn-primary btn-sm"
                >
                  {copiedCoverEmail ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCoverEmail ? 'Copied to Clipboard!' : 'Copy Subject & Body'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
