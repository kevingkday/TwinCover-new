/**
 * Web Worker running `@litert-lm/core` with `gemma-4-E2B-it-web.litertlm` loaded from OPFS.
 * Executes single-frame multimodal inference (current downscaled <=768px image + transcript +
 * current JSON checklist state) without retaining historical raw images in the LLM context window.
 */
import { Engine } from '@litert-lm/core';

const GEMMA_MODEL_FILENAME = 'gemma-4-E2B-it-web.litertlm';

let enginePromise = null;
let engineInstance = null;

async function getOrCreateEngine() {
  if (engineInstance) return engineInstance;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(GEMMA_MODEL_FILENAME, { create: false });
    const modelFile = await fileHandle.getFile();

    engineInstance = await Engine.create({
      model: modelFile,
      mainExecutorSettings: {
        maxNumTokens: 4096,
      },
    });
    return engineInstance;
  })();

  try {
    return await enginePromise;
  } catch (err) {
    enginePromise = null;
    throw err;
  }
}

function buildWalkthroughPrompt(checklist, transcript, riskProfileLabel) {
  const compactChecklist = (checklist || []).map((c) => ({
    id: c.id,
    label: c.label,
    category: c.category,
    completed: Boolean(c.completed),
  }));

  const nextUncompleted =
    compactChecklist.find((c) => !c.completed)?.label || 'All items complete';

  return `You are a commercial insurance field inspection copilot for a ${riskProfileLabel} risk.
Inspect ONLY the current image and spoken note against the current checklist JSON.

Current Checklist JSON:
${JSON.stringify(compactChecklist)}

Broker Spoken Note:
"${transcript || 'No spoken note — analyze the image only.'}"

Rules:
1. Identify detected_item and match checklist_item_id from Current Checklist JSON (or null).
2. If that checklist_item_id already has "completed": true, set "already_completed": true and set spoken_feedback to: "You already captured <item>—next up is ${nextUncompleted}."
3. Extract concrete underwriting key-values in extracted_data.
4. List any hazards/deficiencies in red_flags.
5. Output ONLY valid JSON matching:
{"detected_item":"string","checklist_item_id":"string|null","already_completed":false,"extracted_data":{},"red_flags":[],"spoken_feedback":"string","next_recommended_item":"string"}`;
}

function extractJsonObject(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return a JSON object.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

self.onmessage = async (event) => {
  const { requestId, type, payload } = event.data || {};

  if (type === 'warmup') {
    try {
      await getOrCreateEngine();
      self.postMessage({ requestId, ok: true, result: { ready: true } });
    } catch (err) {
      self.postMessage({ requestId, ok: false, error: err?.message || 'OPFS engine init failed' });
    }
    return;
  }

  if (type === 'evaluate_step') {
    let conversation = null;
    try {
      const engine = await getOrCreateEngine();
      const { checklist, transcript, imageBuffer, riskProfileLabel } = payload;

      // Single-turn fresh conversation so historical raw images are NEVER kept in context
      conversation = await engine.createConversation();
      const contentParts = [];
      if (imageBuffer) {
        contentParts.push({ type: 'image', data: new Uint8Array(imageBuffer) });
      }
      contentParts.push({
        type: 'text',
        text: buildWalkthroughPrompt(checklist, transcript, riskProfileLabel),
      });

      const responseMsg = await conversation.sendMessage({
        role: 'user',
        content: contentParts,
      });

      const responseText = (responseMsg?.content || [])
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('')
        .trim();

      const parsed = extractJsonObject(responseText);
      const matchedId = parsed.checklist_item_id || null;
      const matchedItem = (checklist || []).find((c) => c.id === matchedId);
      const alreadyDone = Boolean(parsed.already_completed || (matchedItem && matchedItem.completed));
      const remaining = (checklist || []).filter((c) => !c.completed && c.id !== matchedId);
      const fallbackNext = remaining[0]?.label || 'All checklist items complete — ready to sync!';

      self.postMessage({
        requestId,
        ok: true,
        result: {
          detected_item: String(parsed.detected_item || 'Site Observation'),
          checklist_item_id: matchedId,
          already_completed: alreadyDone,
          extracted_data:
            parsed.extracted_data && typeof parsed.extracted_data === 'object'
              ? parsed.extracted_data
              : {},
          red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags.map(String) : [],
          spoken_feedback: String(
            parsed.spoken_feedback || `Captured ${parsed.detected_item || 'item'}.`
          ),
          next_recommended_item: String(parsed.next_recommended_item || fallbackNext),
          engine: 'On-Device WebGPU (Gemma 4 E2B OPFS)',
        },
      });
    } catch (err) {
      self.postMessage({
        requestId,
        ok: false,
        error: err?.message || 'On-device WebGPU inference failed',
      });
    } finally {
      if (conversation && typeof conversation.delete === 'function') {
        conversation.delete().catch(() => {});
      }
    }
  }
};
