import { virtualWindow } from '../lib/virtualWindow'

export default function VirtualPriceRows({ rows, scrollTop, columns, children }) {
  const window = virtualWindow(rows.length, scrollTop)
  const spacer = (height, key) => height > 0 && <tr key={key} aria-hidden="true" className="selection-volume__spacer"><td colSpan={columns} style={{ height, padding: 0, border: 0 }} /></tr>
  return <tbody>{spacer(window.before, 'before')}
    {rows.slice(window.start, window.end).map(children)}
    {spacer(window.after, 'after')}
  </tbody>
}
