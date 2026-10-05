import { Activity, CalendarDays, CheckCircle2, Search, SlidersHorizontal, X } from 'lucide-react'

export default function SportHubHeader({ title, description, league, total, live, upcoming, completed, search, onSearch, status, onStatus, onOpenLeagues }) {
  const filters = [
    { id: 'all', label: 'All matches', count: total, icon: SlidersHorizontal },
    { id: 'live', label: 'Live', count: live, icon: Activity },
    { id: 'upcoming', label: 'Upcoming', count: upcoming, icon: CalendarDays },
    { id: 'completed', label: 'Completed', count: completed, icon: CheckCircle2 },
  ]
  return <section className="hub-header" aria-label={`${title} filters`}>
    <h1 className="sr-only">{title}</h1>
    <p className="sr-only">{description}</p>
    <div className="hub-controls">
      <label className="hub-search"><Search size={18} /><input type="search" aria-label="Search matches" placeholder="Search a team, match or league…" value={search} onChange={event => onSearch(event.target.value)} />{search && <button type="button" aria-label="Clear match search" onClick={() => onSearch('')}><X size={16} /></button>}</label>
      <button type="button" className="hub-league-trigger" aria-label={`Choose league: ${league === 'ALL' || !league ? 'All leagues' : league}`} onClick={onOpenLeagues}><SlidersHorizontal size={16} /><span>{league === 'ALL' || !league ? 'All leagues' : league}</span></button>
    </div>
    <div className="hub-filter-row" role="group" aria-label="Match status">
      {filters.map(({ id, label, count, icon: Icon }) => <button key={id} type="button" className={status === id ? 'is-active' : ''} aria-pressed={status === id} onClick={() => onStatus(id)}><Icon size={15} /><span>{label}</span><small>{count}</small></button>)}
    </div>
  </section>
}
