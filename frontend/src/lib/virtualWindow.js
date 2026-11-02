export function virtualWindow(count, scrollTop, { rowHeight = 44, viewport = 390, overscan = 5 } = {}) {
  const size = Math.ceil(viewport / rowHeight) + overscan * 2
  const start = Math.max(0, Math.min(Math.max(0,count-size), Math.floor(Math.max(0, scrollTop - rowHeight) / rowHeight) - overscan))
  const end = Math.min(count, start + size)
  return { start, end, before: start * rowHeight, after: (count - end) * rowHeight }
}
