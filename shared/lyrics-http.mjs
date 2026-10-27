const cacheKey = 'lrclib-search-cache-v1';
const cacheAge = 7 * 24 * 60 * 60 * 1000;
const retryable = new Set([429, 500, 502, 503, 504]);

export function retryDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function lrclibRows(title, signal, fetcher = fetch, options = {}) {
  let storage = options.storage;
  try { if (storage === undefined && typeof window !== 'undefined') storage = window.localStorage; } catch { }
  const sleep = options.sleep ?? retryDelay;
  let cache = [];
  try {
    const saved = JSON.parse(storage?.getItem(cacheKey) || '[]');
    if (Array.isArray(saved)) cache = saved.filter(entry => entry && typeof entry.title === 'string'
      && Number.isFinite(entry.at) && Date.now() - entry.at < cacheAge && Array.isArray(entry.rows));
  } catch { /* Storage may be disabled or full. Network lookup still works. */ }
  signal.throwIfAborted();
  const hit = cache.find(entry => entry.title === title);
  if (hit) return hit.rows;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response;
    try {
      const nativeSearch = options.nativeSearch ?? (typeof window !== 'undefined' ? window.companion?.lyricsSearch : undefined);
      try {
        response = await fetcher(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title })}`, {
          cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        });
      } catch (error) {
        signal.throwIfAborted();
        if (!nativeSearch) throw error;
      }
      if (nativeSearch && (!response || retryable.has(response.status))) {
        signal.throwIfAborted();
        const result = await nativeSearch(title);
        response = { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.rows };
      }
    } catch (error) {
      signal.throwIfAborted();
      if (attempt === 2) throw new Error('LRCLIB 网络连接失败或超时，已尝试 3 次，请稍后重新查询', { cause: error });
      await sleep(1000 * (attempt + 1), signal);
      continue;
    }
    if (!response.ok) {
      if (retryable.has(response.status) && attempt < 2) {
        const requested = Number(response.headers?.get('retry-after')) * 1000;
        await sleep(Math.min(5000, Math.max(1000 * (attempt + 1), requested || 0)), signal);
        continue;
      }
      throw new Error(`LRCLIB 服务返回 ${response.status}${retryable.has(response.status) ? '，已尝试 3 次，请稍后重新查询' : ''}`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('LRCLIB 返回了无效响应');
    signal.throwIfAborted();
    // Cache only successful nonempty searches. Never cache 503s or missing results.
    if (rows.length) {
      cache = [{ title, at: Date.now(), rows }, ...cache.filter(entry => entry.title !== title)].slice(0, 10);
      while (cache.length && JSON.stringify(cache).length > 1_500_000) cache.pop();
      try { storage?.setItem(cacheKey, JSON.stringify(cache)); } catch { }
    }
    return rows;
  }
}
