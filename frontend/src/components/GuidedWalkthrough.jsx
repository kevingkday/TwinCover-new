import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Mic,
  Square,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Download,
  Cloud,
  HardDrive,
  RefreshCw,
  Send,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  WALKTHROUGH_RISK_TEMPLATES,
  downscaleImageToMaxEdge,
} from '../utils/walkthroughTemplates';
import {
  detectWalkthroughCapability,
  downloadModelToOpfs,
  removeModelFromOpfs,
} from '../utils/opfsModelCache';
import { offlineCaptureQueue } from '../utils/offlineCaptureQueue';
import { submissionsApi } from '../api/submissionsApi';

export default function GuidedWalkthrough({ submission, onSubmissionUpdated }) {
  const [riskProfileKey, setRiskProfileKey] = useState('commercial_property_cope');
  const [checklist, setChecklist] = useState(
    () => WALKTHROUGH_RISK_TEMPLATES.commercial_property_cope.items.map((i) => ({ ...i, completed: false }))
  );
  const [extractedCopeFields, setExtractedCopeFields] = useState({});
  const [redFlags, setRedFlags] = useState([]);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [pendingFrameBlob, setPendingFrameBlob] = useState(null);
  const [pendingFramePreviewUrl, setPendingFramePreviewUrl] = useState(null);

  // 3-State Capability Router
  const [capability, setCapability] = useState({
    state: 'unsupported',
    reason: 'Checking device WebGPU & OPFS capabilities...',
    cachedSizeBytes: 0,
  });
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadingModel, setDownloadingModel] = useState(false);

  // Live Voice & Hands-Free TTS
  const [isListening, setIsListening] = useState(false);
  const [handsFreeVoice, setHandsFreeVoice] = useState(true);
  const [analyzingStep, setAnalyzingStep] = useState(false);
  const [lastAiResponse, setLastAiResponse] = useState(null);
  const [syncingToPacket, setSyncingToPacket] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const cameraInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const workerRef = useRef(null);
  const workerRequestIdRef = useRef(0);
  const workerPendingRef = useRef(new Map());

  // 1. Detect 3-state device capability on mount
  useEffect(() => {
    refreshCapability();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // 2. Load persisted IndexedDB walk-through session for this submission
  useEffect(() => {
    if (!submission?.id) return;
    let active = true;
    offlineCaptureQueue.getWalkthroughSession(submission.id).then((saved) => {
      if (!active) return;
      if (saved) {
        setRiskProfileKey(saved.riskProfileKey || 'commercial_property_cope');
        setChecklist(saved.checklist || []);
        setExtractedCopeFields(saved.extractedCopeFields || {});
        setRedFlags(saved.redFlags || []);
        setCapturedPhotos(saved.photos || []);
      } else {
        const defaultKey =
          submission.specialty_line === 'construction'
            ? 'manufacturing'
            : 'commercial_property_cope';
        setRiskProfileKey(defaultKey);
        setChecklist(
          WALKTHROUGH_RISK_TEMPLATES[defaultKey].items.map((i) => ({ ...i, completed: false }))
        );
        setExtractedCopeFields({});
        setRedFlags([]);
        setCapturedPhotos([]);
      }
    });
    return () => {
      active = false;
    };
  }, [submission?.id]);

  const refreshCapability = async () => {
    const cap = await detectWalkthroughCapability();
    setCapability(cap);
  };

  const persistSession = async (nextState) => {
    if (!submission?.id) return;
    await offlineCaptureQueue.saveWalkthroughSession({
      id: `wt_${submission.id}`,
      submissionId: submission.id,
      riskProfileKey: nextState.riskProfileKey ?? riskProfileKey,
      checklist: nextState.checklist ?? checklist,
      extractedCopeFields: nextState.extractedCopeFields ?? extractedCopeFields,
      redFlags: nextState.redFlags ?? redFlags,
      photos: nextState.photos ?? capturedPhotos,
    });
  };

  const handleTemplateChange = async (newKey) => {
    const tmpl = WALKTHROUGH_RISK_TEMPLATES[newKey] || WALKTHROUGH_RISK_TEMPLATES.commercial_property_cope;
    const freshChecklist = tmpl.items.map((i) => ({ ...i, completed: false }));
    setRiskProfileKey(newKey);
    setChecklist(freshChecklist);
    setExtractedCopeFields({});
    setRedFlags([]);
    setCapturedPhotos([]);
    setLastAiResponse(null);
    await persistSession({
      riskProfileKey: newKey,
      checklist: freshChecklist,
      extractedCopeFields: {},
      redFlags: [],
      photos: [],
    });
  };

  // Speak feedback via Web Speech Synthesis when hands-free mode is on (or always on duplicate warning)
  const speakText = (text, force = false) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!handsFreeVoice && !force) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.03;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore speech synthesis restrictions
    }
  };

  // Web Worker helper for on-device @litert-lm/core Gemma 4 E2B
  const runWorkerStep = async ({ checklistSnapshot, spokenNote, imageBlob, riskLabel }) => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/gemmaWalkthrough.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = (ev) => {
        const { requestId, ok, result, error } = ev.data || {};
        const pending = workerPendingRef.current.get(requestId);
        if (!pending) return;
        workerPendingRef.current.delete(requestId);
        if (ok) pending.resolve(result);
        else pending.reject(new Error(error || 'WebGPU worker error'));
      };
    }

    const requestId = ++workerRequestIdRef.current;
    const imageBuffer = imageBlob ? await imageBlob.arrayBuffer() : null;

    return new Promise((resolve, reject) => {
      workerPendingRef.current.set(requestId, { resolve, reject });
      workerRef.current.postMessage(
        {
          requestId,
          type: 'evaluate_step',
          payload: {
            checklist: checklistSnapshot,
            transcript: spokenNote,
            imageBuffer,
            riskProfileLabel: riskLabel,
          },
        },
        imageBuffer ? [imageBuffer] : []
      );
    });
  };

  const handleDownloadOfflineModel = async () => {
    setDownloadingModel(true);
    setDownloadProgress({ percent: 0, receivedBytes: 0, totalBytes: 0 });
    try {
      await downloadModelToOpfs((prog) => setDownloadProgress(prog));
      await refreshCapability();
    } catch (err) {
      alert('Offline model download failed: ' + err.message);
    } finally {
      setDownloadingModel(false);
    }
  };

  const handleDeleteOfflineModel = async () => {
    await removeModelFromOpfs();
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    await refreshCapability();
  };

  // Web Speech API (SpeechRecognition) for live broker notes
  const toggleSpeechRecognition = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Live speech recognition is unavailable in this browser. You can type or dictate into the note box directly.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = 'en-CA';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let fullText = '';
      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript + ' ';
      }
      setTranscript(fullText.trim());
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Capture photo -> immediately downscale to <=768px and optionally run step
  const handlePhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const downscaledBlob = await downscaleImageToMaxEdge(file, 768);
      if (pendingFramePreviewUrl) URL.revokeObjectURL(pendingFramePreviewUrl);
      setPendingFrameBlob(downscaledBlob);
      setPendingFramePreviewUrl(URL.createObjectURL(downscaledBlob));
      await runWalkthroughStep(downscaledBlob, transcript);
    } catch (err) {
      alert('Photo processing failed: ' + err.message);
    }
  };

  const runWalkthroughStep = async (frameBlob = pendingFrameBlob, spokenNote = transcript) => {
    if (!frameBlob && !spokenNote.trim()) {
      alert('Snap a photo or speak/enter a field note first.');
      return;
    }

    setAnalyzingStep(true);
    const riskLabel = WALKTHROUGH_RISK_TEMPLATES[riskProfileKey]?.label || 'Commercial Property / COPE';

    try {
      let aiRes = null;

      // 3-State Capability Routing
      if (capability.state === 'opfs_cached') {
        try {
          aiRes = await runWorkerStep({
            checklistSnapshot: checklist,
            spokenNote,
            imageBlob: frameBlob,
            riskLabel,
          });
        } catch (webGpuErr) {
          console.warn('OPFS WebGPU worker failed; falling back to MicroNode:', webGpuErr);
          if (navigator.onLine) {
            aiRes = await submissionsApi.evaluateWalkthroughStep({
              checklist,
              transcript: spokenNote,
              riskProfileLabel: riskLabel,
              imageBlob: frameBlob,
            });
          } else {
            throw webGpuErr;
          }
        }
      } else {
        // State 1 ('unsupported') or State 2 ('ready_to_download'): route to MicroNode qwen2.5vl:7b
        aiRes = await submissionsApi.evaluateWalkthroughStep({
          checklist,
          transcript: spokenNote,
          riskProfileLabel: riskLabel,
          imageBlob: frameBlob,
        });
      }

      setLastAiResponse(aiRes);

      // Alert + speak if already_completed is true
      if (aiRes.already_completed) {
        speakText(aiRes.spoken_feedback, true);
      } else {
        speakText(aiRes.spoken_feedback, false);
      }

      // Tick off matched checklist item & merge extracted_data + red_flags into IndexedDB
      const updatedChecklist = checklist.map((item) => {
        if (aiRes.checklist_item_id && item.id === aiRes.checklist_item_id) {
          return {
            ...item,
            completed: true,
            capturedAt: item.capturedAt || new Date().toISOString(),
            extractedData: { ...(item.extractedData || {}), ...(aiRes.extracted_data || {}) },
          };
        }
        return item;
      });

      const mergedCope = {
        ...extractedCopeFields,
        ...(aiRes.extracted_data || {}),
      };

      const mergedFlags = Array.from(
        new Set([...redFlags, ...(aiRes.red_flags || [])])
      );

      let updatedPhotos = capturedPhotos;
      if (frameBlob) {
        const photoEntry = {
          id: `wt_photo_${Date.now()}`,
          itemId: aiRes.checklist_item_id || 'general',
          detectedItem: aiRes.detected_item,
          filename: `${aiRes.checklist_item_id || 'walkthrough'}_${Date.now()}.jpg`,
          blob: frameBlob,
          capturedAt: new Date().toISOString(),
        };
        updatedPhotos = [...capturedPhotos, photoEntry];
      }

      setChecklist(updatedChecklist);
      setExtractedCopeFields(mergedCope);
      setRedFlags(mergedFlags);
      setCapturedPhotos(updatedPhotos);
      setTranscript('');
      setPendingFrameBlob(null);
      if (pendingFramePreviewUrl) {
        URL.revokeObjectURL(pendingFramePreviewUrl);
        setPendingFramePreviewUrl(null);
      }

      await persistSession({
        checklist: updatedChecklist,
        extractedCopeFields: mergedCope,
        redFlags: mergedFlags,
        photos: updatedPhotos,
      });
    } catch (err) {
      alert('Walk-through step failed: ' + err.message);
    } finally {
      setAnalyzingStep(false);
    }
  };

  // Sync IndexedDB Walk-Through Session into TwinCover's Submission Packet & Immutable Evidence Vault
  const handleSyncToSubmission = async () => {
    if (!submission?.id) return;
    setSyncingToPacket(true);
    setSyncMessage(null);
    try {
      const filesToUpload = capturedPhotos.map(
        (p) => new File([p.blob], p.filename, { type: 'image/jpeg' })
      );
      const summaryNote = [
        `Guided Walk-Through (${WALKTHROUGH_RISK_TEMPLATES[riskProfileKey]?.label})`,
        `Extracted COPE Fields: ${JSON.stringify(extractedCopeFields)}`,
        redFlags.length > 0 ? `Red Flags: ${redFlags.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      if (filesToUpload.length > 0 || summaryNote) {
        await submissionsApi.captureEvidence(submission.id, {
          files: filesToUpload,
          textNote: summaryNote,
          noteTitle: `guided_walkthrough_${riskProfileKey}.txt`,
        });
      }

      // Map extracted COPE fields directly into TwinCover's structured_risk_profile schema
      const existingProfile = submission.structured_risk_profile || [];
      const newProfileRows = Object.entries(extractedCopeFields).map(([k, v]) => ({
        field_key: k,
        label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value: String(v),
        confidence: 0.94,
        category: WALKTHROUGH_RISK_TEMPLATES[riskProfileKey]?.label || 'Guided Walk-Through',
        citations: [
          {
            artifact_id: 'walkthrough',
            artifact_type: 'photo',
            reference: 'Guided Field Walk-Through',
            excerpt: `Captured on-site (${Object.keys(extractedCopeFields).length} COPE fields, ${redFlags.length} red flags)`,
          },
        ],
      }));

      const mergedByKey = new Map();
      [...existingProfile, ...newProfileRows].forEach((row) => {
        mergedByKey.set(row.field_key, row);
      });

      const updated = await submissionsApi.updateSubmission(submission.id, {
        structured_risk_profile: Array.from(mergedByKey.values()),
      });

      setSyncMessage('Synced walk-through photos, COPE fields & red flags into Submission Packet!');
      if (onSubmissionUpdated) onSubmissionUpdated(updated);
    } catch (err) {
      setSyncMessage('Offline or network error — session remains safely saved in IndexedDB.');
    } finally {
      setSyncingToPacket(false);
    }
  };

  const completedCount = checklist.filter((c) => c.completed).length;

  return (
    <div className="copilot-two-col">
      {/* Left Column: Template Selector, 3-State Capability Router, Camera + Voice Loop */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 3-State Capability Router Card */}
        <div className="glass-panel" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {capability.state === 'opfs_cached' ? (
                <HardDrive size={16} color="#047857" />
              ) : (
                <Cloud size={16} color="#2563EB" />
              )}
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                {capability.state === 'opfs_cached'
                  ? 'Engine: On-Device WebGPU (Gemma 4 E2B OPFS)'
                  : 'Engine: Sovereign MicroNode Fallback (qwen2.5vl:7b)'}
              </span>
            </div>

            <span
              className={`badge ${capability.state === 'opfs_cached' ? 'badge-verified' : 'badge-blue'}`}
              style={{ fontSize: '10.5px' }}
            >
              {capability.state === 'opfs_cached'
                ? '100% Offline Ready'
                : capability.state === 'ready_to_download'
                ? 'WebGPU Ready'
                : 'MicroNode Active'}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
            {capability.reason}
          </div>

          {/* State 2: Supported hardware, model not yet in OPFS -> Manual Wi-Fi Download Button */}
          {capability.state === 'ready_to_download' && (
            <div style={{ marginTop: '10px' }}>
              {downloadingModel ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 600, color: '#1D4ED8', marginBottom: '4px' }}>
                    <span>Streaming gemma-4-E2B-it-web.litertlm to OPFS...</span>
                    <span>{downloadProgress?.percent || 0}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#DBEAFE', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${downloadProgress?.percent || 0}%`, height: '100%', background: '#2563EB' }} />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadOfflineModel}
                  className="btn btn-secondary btn-sm"
                  style={{ borderColor: '#93C5FD', color: '#1D4ED8' }}
                >
                  <Download size={13} />
                  <span>Download Offline Field Model (Wi-Fi)</span>
                </button>
              )}
            </div>
          )}

          {/* State 3: OPFS Cached option to clear cache */}
          {capability.state === 'opfs_cached' && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: '#047857', fontFamily: 'var(--font-mono)' }}>
                Cached in OPFS: {(capability.cachedSizeBytes / (1024 * 1024)).toFixed(0)} MB
              </span>
              <button
                type="button"
                onClick={handleDeleteOfflineModel}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '11px', color: '#64748B', padding: '2px 6px' }}
              >
                <Trash2 size={11} /> Clear OPFS Cache
              </button>
            </div>
          )}
        </div>

        {/* Risk Profile Template + Hands-Free Capture Card */}
        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: '#0F172A' }}>
              Guided Field Walk-Through
            </h3>
            <button
              type="button"
              onClick={() => setHandsFreeVoice((v) => !v)}
              className="btn btn-secondary btn-sm"
              style={{
                background: handsFreeVoice ? '#EFF6FF' : '#F8FAFC',
                borderColor: handsFreeVoice ? '#93C5FD' : '#E2E8F0',
                color: handsFreeVoice ? '#1D4ED8' : '#64748B',
              }}
            >
              {handsFreeVoice ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>{handsFreeVoice ? 'Hands-Free Voice: ON' : 'Voice: Muted'}</span>
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Risk Profile Template</label>
            <select
              value={riskProfileKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="form-select"
            >
              {Object.values(WALKTHROUGH_RISK_TEMPLATES).map((tmpl) => (
                <option key={tmpl.key} value={tmpl.key}>
                  {tmpl.label} ({tmpl.items.length} items)
                </option>
              ))}
            </select>
          </div>

          {/* Hidden 768px Camera Input */}
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            style={{ display: 'none' }}
          />

          {/* Camera + Web Speech API Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={analyzingStep}
              className="btn btn-primary"
              style={{ padding: '14px 12px', fontWeight: 700, justifyContent: 'center', borderRadius: '10px' }}
            >
              <Camera size={18} />
              <span>{analyzingStep ? 'Inspecting...' : 'Snap & Inspect'}</span>
            </button>

            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className="btn"
              style={{
                padding: '14px 12px',
                fontWeight: 700,
                justifyContent: 'center',
                borderRadius: '10px',
                background: isListening ? '#DC2626' : '#7C3AED',
                color: '#FFFFFF',
                border: 'none',
              }}
            >
              {isListening ? <Square size={18} /> : <Mic size={18} />}
              <span>{isListening ? 'Stop Listening' : 'Speak Note'}</span>
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: '10px' }}>
            <label className="form-label">Live Broker Spoken Transcript / Note</label>
            <textarea
              rows={2}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder='e.g. "Here is the main 200-amp panel in the basement"'
              className="form-textarea"
              style={{ fontSize: '13px' }}
            />
          </div>

          {pendingFramePreviewUrl && (
            <div style={{ marginBottom: '10px' }}>
              <img
                src={pendingFramePreviewUrl}
                alt="Downscaled 768px preview"
                style={{ maxHeight: '140px', borderRadius: '8px', border: '1px solid #E2E8F0' }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => runWalkthroughStep()}
            disabled={analyzingStep || (!transcript.trim() && !pendingFrameBlob)}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
          >
            <Sparkles size={15} color="#2563EB" />
            <span>{analyzingStep ? 'Analyzing Frame + Note...' : 'Evaluate Current Step'}</span>
          </button>

          {/* AI Spoken Feedback Banner */}
          {lastAiResponse && (
            <div
              style={{
                marginTop: '14px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: lastAiResponse.already_completed ? '#FFFBEB' : '#EFF6FF',
                border: `1px solid ${lastAiResponse.already_completed ? '#FDE68A' : '#BFDBFE'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: lastAiResponse.already_completed ? '#B45309' : '#1D4ED8' }}>
                  {lastAiResponse.already_completed ? 'ALREADY COMPLETED' : `DETECTED: ${lastAiResponse.detected_item}`}
                </span>
                <span style={{ fontSize: '10.5px', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                  {lastAiResponse.engine}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                "{lastAiResponse.spoken_feedback}"
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px' }}>
                <strong>Next Recommended:</strong> {lastAiResponse.next_recommended_item}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Live Structured Checklist, Red Flags, Extracted COPE & Packet Sync */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: '#0F172A' }}>
                Live Inspection Checklist ({completedCount}/{checklist.length})
              </h3>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                Stored 100% offline in IndexedDB (`twincover_walkthrough_sessions`)
              </div>
            </div>

            <button
              type="button"
              onClick={handleSyncToSubmission}
              disabled={syncingToPacket}
              className="btn btn-primary btn-sm"
            >
              <Send size={13} />
              <span>{syncingToPacket ? 'Syncing...' : 'Sync to Submission Packet'}</span>
            </button>
          </div>

          {syncMessage && (
            <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', fontSize: '12px', marginBottom: '12px', fontWeight: 600 }}>
              {syncMessage}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {checklist.map((item) => (
              <div
                key={item.id}
                onClick={async () => {
                  const next = checklist.map((c) =>
                    c.id === item.id ? { ...c, completed: !c.completed } : c
                  );
                  setChecklist(next);
                  await persistSession({ checklist: next });
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '9px',
                  background: item.completed ? '#ECFDF5' : '#F8FAFC',
                  border: `1px solid ${item.completed ? '#A7F3D0' : '#E2E8F0'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!item.completed}
                  onChange={() => {}}
                  style={{ marginTop: '3px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: item.completed ? '#065F46' : '#0F172A', textDecoration: item.completed ? 'line-through' : 'none' }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                      {item.category}
                    </span>
                  </div>
                  {!item.completed && (
                    <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                      {item.promptHint}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Red Flags & Extracted COPE Fields Summary */}
        {(redFlags.length > 0 || Object.keys(extractedCopeFields).length > 0) && (
          <div className="glass-panel" style={{ padding: '18px 20px' }}>
            {redFlags.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <AlertTriangle size={15} />
                  <span>Underwriting Red Flags ({redFlags.length})</span>
                </div>
                {redFlags.map((rf, idx) => (
                  <div key={idx} style={{ padding: '7px 10px', borderRadius: '6px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '12px', marginBottom: '4px' }}>
                    {rf}
                  </div>
                ))}
              </div>
            )}

            {Object.keys(extractedCopeFields).length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  Extracted COPE Fields (Packet Ready)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {Object.entries(extractedCopeFields).map(([k, v]) => (
                    <div key={k} style={{ padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        {k.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                        {String(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
