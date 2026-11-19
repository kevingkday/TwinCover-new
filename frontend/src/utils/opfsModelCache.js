/**
 * 3-State Device Capability Router & OPFS Model Cache for Gemma 4 E2B WebGPU
 *
 * Verified Hugging Face repo & exact filename (via Hugging Face API):
 *   Repo: https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
 *   File: gemma-4-E2B-it-web.litertlm
 */

export const GEMMA_MODEL_FILENAME = 'gemma-4-E2B-it-web.litertlm';
export const GEMMA_MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm';

/**
 * Check if WebGPU + OPFS + sufficient device memory (>= 4GB when exposed) are available.
 */
export async function checkWebGpuAndOpfsSupport() {
  const hasOpfs =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.storage && typeof navigator.storage.getDirectory === 'function');

  const hasWebGpu = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  if (!hasWebGpu || !hasOpfs) {
    return {
      supported: false,
      reason: !hasWebGpu
        ? 'WebGPU unavailable on this browser (routing to MicroNode qwen2.5vl:7b).'
        : 'OPFS storage unavailable (routing to MicroNode qwen2.5vl:7b).',
    };
  }

  // Constrained mobile device memory guard (e.g. iOS Safari or <4GB RAM devices)
  const devMem = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
  if (devMem !== null && devMem < 4) {
    return {
      supported: false,
      reason: `Device memory (${devMem} GB) constrained — routing to MicroNode qwen2.5vl:7b.`,
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason: 'No WebGPU hardware adapter found — routing to MicroNode qwen2.5vl:7b.',
      };
    }
    return { supported: true, reason: 'WebGPU & OPFS hardware ready.' };
  } catch (err) {
    return {
      supported: false,
      reason: `WebGPU probe failed (${err.message}) — routing to MicroNode.`,
    };
  }
}

/**
 * Check whether `gemma-4-E2B-it-web.litertlm` is already cached in OPFS.
 */
export async function isModelCachedInOpfs() {
  try {
    if (!navigator.storage?.getDirectory) return { cached: false, sizeBytes: 0 };
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(GEMMA_MODEL_FILENAME, { create: false });
    const file = await handle.getFile();
    // Must be a non-trivial model file (> 50 MB)
    if (file.size > 50 * 1024 * 1024) {
      return { cached: true, sizeBytes: file.size };
    }
    return { cached: false, sizeBytes: file.size };
  } catch {
    return { cached: false, sizeBytes: 0 };
  }
}

/**
 * 3-State Capability Router:
 *   1. 'unsupported'       -> Hide offline download; route directly to MicroNode (qwen2.5vl:7b)
 *   2. 'ready_to_download' -> Show manual "Download Offline Field Model" button; use MicroNode if online
 *   3. 'opfs_cached'       -> Initialize @litert-lm/core from OPFS and run 100% locally offline
 */
export async function detectWalkthroughCapability() {
  const hw = await checkWebGpuAndOpfsSupport();
  if (!hw.supported) {
    return {
      state: 'unsupported',
      reason: hw.reason,
      cachedSizeBytes: 0,
    };
  }

  const cacheInfo = await isModelCachedInOpfs();
  if (cacheInfo.cached) {
    return {
      state: 'opfs_cached',
      reason: 'Gemma 4 E2B WebGPU cached in OPFS — 100% offline-ready.',
      cachedSizeBytes: cacheInfo.sizeBytes,
    };
  }

  return {
    state: 'ready_to_download',
    reason: 'WebGPU supported. Download Gemma 4 E2B over Wi-Fi for 100% offline field mode.',
    cachedSizeBytes: 0,
  };
}

/**
 * Stream `gemma-4-E2B-it-web.litertlm` from Hugging Face directly into OPFS
 * with real-time byte progress callbacks.
 */
export async function downloadModelToOpfs(onProgress, signal) {
  const root = await navigator.storage.getDirectory();
  const tempName = `${GEMMA_MODEL_FILENAME}.downloading`;
  const tempHandle = await root.getFileHandle(tempName, { create: true });
  const writable = await tempHandle.createWritable();

  try {
    const resp = await fetch(GEMMA_MODEL_URL, { signal });
    if (!resp.ok || !resp.body) {
      throw new Error(`Model download failed (HTTP ${resp.status})`);
    }

    const totalBytes = Number(resp.headers.get('content-length') || 0);
    const reader = resp.body.getReader();
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      receivedBytes += value.byteLength;
      if (onProgress) {
        onProgress({
          receivedBytes,
          totalBytes,
          percent: totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : 0,
        });
      }
    }

    await writable.close();

    // Move temp file into final OPFS handle
    const finalHandle = await root.getFileHandle(GEMMA_MODEL_FILENAME, { create: true });
    const finalWritable = await finalHandle.createWritable();
    const downloadedFile = await tempHandle.getFile();
    await downloadedFile.stream().pipeTo(finalWritable);
    await root.removeEntry(tempName).catch(() => {});

    if (onProgress) {
      onProgress({ receivedBytes, totalBytes: receivedBytes, percent: 100 });
    }
    return true;
  } catch (err) {
    try {
      await writable.abort();
      await root.removeEntry(tempName).catch(() => {});
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

export async function removeModelFromOpfs() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(GEMMA_MODEL_FILENAME);
    return true;
  } catch {
    return false;
  }
}
