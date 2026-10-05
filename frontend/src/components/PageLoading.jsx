import { LoaderCircle } from 'lucide-react'

export default function PageLoading({ label = 'Loading your workspace' }) {
  return <div className="ui-page-loading" role="status"><LoaderCircle size={26} className="animate-spin" /><p>{label}…</p></div>
}
