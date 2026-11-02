const scripts = new Map()

/** Load third-party code only when the user invokes its feature. */
export function loadScript(src, ready = () => false) {
  if (ready()) return Promise.resolve()
  if (scripts.has(src)) return scripts.get(src)
  const promise = new Promise((resolve,reject) => {
    const script = document.createElement('script')
    let timer
    const finish = error => {
      clearTimeout(timer)
      script.onload = script.onerror = null
      if (error) { script.remove(); scripts.delete(src); reject(error) }
      else resolve()
    }
    script.src = src
    script.async = true
    script.onload = () => finish(ready() ? null : new Error('Payment provider unavailable'))
    script.onerror = () => finish(new Error('Unable to load payment provider'))
    timer = setTimeout(() => finish(new Error('Payment provider timed out')),10000)
    document.head.appendChild(script)
  })
  scripts.set(src,promise)
  return promise
}
