import { Search } from 'lucide-react'

export default function LeagueSearch({ value, onChange }) {
  return <label className="league-search"><Search size={15} /><input type="search" aria-label="Search leagues" placeholder="Find a league…" value={value} onChange={event => onChange(event.target.value)} /></label>
}
