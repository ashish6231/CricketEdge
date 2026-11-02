/** Share concurrent reads, never writes. Auth headers are part of the key. */
export function createRequestClient({ base = '', getHeaders = () => ({}), fetchImpl = (...args) => fetch(...args), parseError } = {}) {
  const pending = new Map()
  return function request(endpoint, options = {}) {
    const { timeoutMs = 12000, retries = 1, signal, ...init } = options
    const method = (init.method || 'GET').toUpperCase()
    const headers = new Headers({ ...getHeaders(), ...init.headers })
    const key = method === 'GET' && !signal
      ? JSON.stringify([endpoint, [...headers.entries()].sort(), init.credentials, init.cache, init.mode, init.redirect, timeoutMs, retries]) : null
    if (key && pending.has(key)) return pending.get(key)

    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const controller = new AbortController()
        const cancel = () => controller.abort()
        signal?.addEventListener('abort', cancel, { once: true })
        if (signal?.aborted) cancel()
        const timer = setTimeout(cancel, timeoutMs)
        let failure
        try {
          const response = await fetchImpl(`${base}${endpoint}`, { ...init, method, headers, signal: controller.signal })
          if (!response.ok) throw parseError ? await parseError(response) : { status: response.status, detail: `HTTP ${response.status}` }
          return await response.json()
        } catch (error) {
          if (signal?.aborted) throw { name: 'AbortError', detail: 'Request cancelled' }
          failure = error.detail ? error : { detail: controller.signal.aborted ? 'Request timeout — please try again' : 'Network error' }
        } finally {
          clearTimeout(timer)
          signal?.removeEventListener('abort', cancel)
        }
        // Retrying payments, account changes, or other writes can duplicate them.
        if (method !== 'GET' || failure.status || attempt >= retries) throw failure
        await new Promise(resolve => setTimeout(resolve, 800))
        if (signal?.aborted) throw { name: 'AbortError', detail: 'Request cancelled' }
      }
    }
    const promise = run().finally(() => { if (key) pending.delete(key) })
    if (key) pending.set(key, promise)
    return promise
  }
}
