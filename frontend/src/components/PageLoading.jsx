export default function PageLoading({ label = 'Loading your workspace', cards = 6 }) {
  return <div className="page-skeleton" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}…</span>
    <div aria-hidden="true">
      <div className="page-skeleton__heading skeleton-block" />
      <div className="page-skeleton__toolbar skeleton-block" />
      <div className="page-skeleton__grid">{Array.from({ length: cards }, (_, index) => <div className="page-skeleton__card" key={index}>
        <div className="skeleton-block page-skeleton__line" /><div className="skeleton-block page-skeleton__line short" />
        <div className="page-skeleton__values"><div className="skeleton-block" /><div className="skeleton-block" /></div>
      </div>)}</div>
    </div>
  </div>
}
