import { virtualWindow } from '../lib/virtualWindow'

export default function VirtualPriceRows({ rows, scrollTop, columns, rowHeight = 28, viewport = 390, overscan = 8, children }) {
  const window = virtualWindow(rows.length, scrollTop, { rowHeight, viewport, overscan })
  const spacer = (height, key) => height > 0 && (
    <tr key={key} aria-hidden="true" className="selection-volume__spacer" style={{ height }}>
      <td colSpan={columns} style={{ height, padding: 0, border: 0, lineHeight: 0, fontSize: 0 }} />
    </tr>
  )
  return (
    <tbody>
      {spacer(window.before, 'before')}
      {rows.slice(window.start, window.end).map(children)}
      {spacer(window.after, 'after')}
    </tbody>
  )
}
