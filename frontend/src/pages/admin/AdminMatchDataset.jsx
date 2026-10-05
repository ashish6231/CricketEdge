import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Code2, Cpu, Database, Download, ExternalLink, FileJson, LoaderCircle, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { adminGetMatchDataset, adminGetMatchDatasetExport } from '../../api'
import { useToast } from '../../components/ToastProvider'
import './AdminMatchDataset.css'
import { getBookiePlWindows, splitMatchOutcomes } from '../../utils/bookiePl'

const dateValue = value => {
  const number = typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : null
  return new Date(number === null ? value : number < 1e12 ? number * 1000 : number)
}
const fmtDate = (value, time = false) => !value || Number.isNaN(dateValue(value).getTime()) ? '—' : dateValue(value).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', ...(time ? { year: 'numeric', hour: '2-digit', minute: '2-digit' } : {}),
})
const fmtNumber = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'
const fmtShare = value => typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—'
const percent = (correct, wrong) => correct + wrong > 0 ? `${(100 * correct / (correct + wrong)).toFixed(1).replace(/\.0$/, '')}%` : '—'
const MODE_INFO = {
  active: { label: 'Active algorithm', pick: 'currentPrediction', comparison: 'currentComparison', hits: 'currentHits', misses: 'currentMisses', description: 'Current league algorithm replayed on the saved input.' },
  training: { label: 'Training fit', pick: 'trainingPrediction', comparison: 'trainingComparison', hits: 'trainingHits', misses: 'trainingMisses', description: 'Reference models fitted to historical examples. Training scores do not measure future accuracy.' },
  saved: { label: 'Saved forecast', comparison: 'comparison', hits: 'hits', misses: 'misses', description: 'Original prediction stored with the snapshot.' },
}
const comparisonLabels = { hit: 'Correct', miss: 'Missed', no_pick: 'No pick', pending: 'Pending', no_result: 'No result' }
const pickFor = (row, mode) => mode === 'saved' ? row.predictedWinner : row[MODE_INFO[mode].pick]?.winner

function ResultBadge({ comparison }) {
  return <span className={`md-result md-result-${comparison}`}>
    {comparison === 'hit' ? <Check size={12} /> : comparison === 'miss' ? <X size={12} /> : <span className="md-dot" />}
    {comparisonLabels[comparison] || 'Pending'}
  </span>
}

function SnapshotDrawer({ row, mode, onClose }) {
  const drawer = useRef(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawer.current?.querySelector('button')?.focus()
    const onKey = event => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const elements = [...(drawer.current?.querySelectorAll('button, a[href], summary, [tabindex="0"]') || [])].filter(element => element.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus() }
  }, [onClose])
  const snapshot = row.snapshot
  const { t1, t2, drawName } = splitMatchOutcomes(snapshot.teamNames)
  const preMatchPL = getBookiePlWindows(snapshot, t1, t2, drawName, { startTime: row.startTime }).preMatch.byName
  const algorithm = row.currentAlgorithm || {}
  const factors = row.currentPrediction?.commonFactors
  return <div className="md-drawer-backdrop" onClick={onClose}>
    <section ref={drawer} role="dialog" aria-modal="true" aria-labelledby="md-snapshot-title" className="md-drawer" onClick={event => event.stopPropagation()}>
      <header className="md-drawer-heading"><div><span className="md-eyebrow">SAVED SNAPSHOT</span><h3 id="md-snapshot-title">{row.matchName || `${row.team1} v ${row.team2}`}</h3><p>{row.league} · {fmtDate(row.startTime, true)} IST</p></div><button className="md-icon-button" aria-label="Close snapshot" onClick={onClose}><X size={19} /></button></header>
      <div className="md-drawer-body">
        <div className="md-drawer-comparison"><div><span>{MODE_INFO[mode].label}</span><strong>{pickFor(row, mode) || 'No pick'}</strong></div><ArrowRight size={18} /><div><span>Actual result</span><strong>{row.actualWinner || 'Awaiting verification'}</strong></div></div>
        <div className="md-drawer-section"><div className="md-section-label"><Database size={14} /> Frozen pre-match inputs</div><div className="md-input-table"><table><thead><tr><th>Metric</th>{snapshot.teamNames.map(team => <th key={team}>{team}</th>)}</tr></thead><tbody>{[
          ['Back stake', i => snapshot.preMatchVolume?.[`team${i + 1}`]?.back],
          ['Lay stake', i => snapshot.preMatchVolume?.[`team${i + 1}`]?.lay],
          ['Bookie P/L (settlement)', i => preMatchPL[snapshot.teamNames[i]]],
          ['Provider reported total', i => snapshot.preMatchTotalBets?.[`team${i + 1}`]],
        ].map(([label, value]) => <tr key={label}><td>{label}</td>{snapshot.teamNames.map((name, i) => <td key={name}>{fmtNumber(value(i))}</td>)}</tr>)}</tbody></table></div><p className="md-muted">Settlement P/L uses the same matched-trade formula as match details. A dash means the saved time-matched ledger cannot be verified. Original provider fields remain in the saved JSON.</p></div>
        <div className="md-drawer-section"><div className="md-section-label"><Cpu size={14} /> Algorithm</div><dl className="md-metadata"><div><dt>Active profile</dt><dd>{algorithm.mode}</dd></div><div><dt>Algorithm ID</dt><dd className="md-code">{algorithm.algorithmId}</dd></div><div><dt>Version</dt><dd>{algorithm.predictorVersion}</dd></div><div><dt>Verified training data</dt><dd>{algorithm.trainingSamples ?? '—'} matches</dd></div><div><dt>Original saved algorithm</dt><dd className="md-code">{row.algorithmId || 'Not recorded'}</dd></div></dl><p className="md-rule-reason">{mode === 'saved' ? row.predictionReason || row.predictionConfidence || 'No saved rule description.' : row[MODE_INFO[mode].pick]?.reason || 'No prediction available for this input.'}</p></div>
        {factors && <div className="md-drawer-section"><div className="md-section-label"><Code2 size={14} /> Common pre-match factor</div><dl className="md-metadata"><div><dt>Factor family</dt><dd>Relative market flow</dd></div><div><dt>Flow-dominant team</dt><dd>{snapshot.teamNames[factors.dominantTeamIndex] || '—'}</dd></div><div><dt>Total flow share</dt><dd>{fmtShare(factors.totalShare)}</dd></div><div><dt>Back / lay share</dt><dd>{fmtShare(factors.backShare)} / {fmtShare(factors.layShare)}</dd></div><div><dt>Prediction agreement</dt><dd>{factors.predictionAgreement} of 3 flow signals</dd></div></dl><p className="md-rule-reason">Back, lay and total-volume balance is the shared descriptive factor across leagues. It is combined with P/L and league-specific rules; this is not a calibrated win probability.</p></div>}
        <div className="md-drawer-section"><div className="md-section-label"><ShieldCheck size={14} /> Result & capture</div><dl className="md-metadata"><div><dt>Saved</dt><dd>{fmtDate(row.capturedAt, true)} IST</dd></div><div><dt>Data source</dt><dd>{row.datasetSource}</dd></div><div><dt>Match ID</dt><dd className="md-code">{row.matchId}</dd></div><div><dt>Input timing</dt><dd>{row.forecastIssuedBeforeStart ? 'Captured before start' : row.inputTiming === 'captured-before-start' ? 'Before-start timestamp not verified' : row.inputTiming === 'provider-frozen-fields-captured-after-start' ? 'Frozen fields collected after start' : 'Historical timing not recorded'}</dd></div></dl>{(row.resultVerification?.resultText || row.resultText) && <p className="md-rule-reason">{row.resultVerification?.resultText || row.resultText}</p>}{row.reportedWinner && !row.actualWinner && <p className="md-muted">Reported: {row.reportedWinner}. Verification pending.</p>}{row.actualWinner && row.resultVerification?.sourceUrl?.startsWith('https://') && <a className="md-source-link" href={row.resultVerification.sourceUrl} target="_blank" rel="noreferrer">View verified result <ExternalLink size={12} /></a>}</div>
        <details className="md-json"><summary><FileJson size={14} /> Full saved JSON</summary><pre>{JSON.stringify(snapshot, null, 2)}</pre></details>
        {row.sourceSnapshots && <details className="md-json"><summary><FileJson size={14} /> All {row.sourceSnapshots.length} source snapshots</summary><pre>{JSON.stringify(row.sourceSnapshots, null, 2)}</pre></details>}
      </div>
    </section>
  </div>
}

export default function AdminMatchDataset() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [league, setLeague] = useState('')
  const [leagueSearch, setLeagueSearch] = useState('')
  const [view, setView] = useState('matches')
  const [status, setStatus] = useState('all')
  const [result, setResult] = useState('all')
  const [mode, setMode] = useState('active')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const closeDrawer = useMemo(() => () => setSelectedRow(null), [])

  useEffect(() => {
    if (!autoRefresh || selectedRow) return
    const timer = setInterval(() => setRefresh(value => value + 1), 30000)
    return () => clearInterval(timer)
  }, [autoRefresh, selectedRow])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      adminGetMatchDataset({ league, status, result, search, page, predictionMode: mode })
        .then(response => { if (active) setData(response) })
        .catch(e => { if (active) setError(e.detail || 'Failed to load match dataset') })
        .finally(() => { if (active) setLoading(false) })
    }, search ? 250 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [league, status, result, search, page, refresh, mode])

  const selectLeague = value => { setLeague(value); setPage(1); setSelectedRow(null); setView('matches') }
  const changeMode = value => { setMode(value); setResult('all'); setPage(1) }
  const exportJson = async () => {
    setExporting(true)
    try { await adminGetMatchDatasetExport(); toast.success('All valid match snapshots exported') }
    catch (e) { toast.error(e.detail || 'Export failed') }
    finally { setExporting(false) }
  }
  const leagues = data?.leagues || []
  const allTotal = data?.overallSummary?.total ?? (leagues.length ? leagues.reduce((total, item) => total + (item.total || 0), 0) : data?.summary?.total)
  const visibleLeagues = leagues.filter(item => item.league.toLowerCase().includes(leagueSearch.toLowerCase()))
  const selectedLeague = leagues.find(item => item.league === league)
  const summary = data?.summary || {}
  const compared = (summary[MODE_INFO[mode].hits] || 0) + (summary[MODE_INFO[mode].misses] || 0)
  const correct = summary[MODE_INFO[mode].hits] || 0
  const missed = summary[MODE_INFO[mode].misses] || 0
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 }
  const diagnostics = (selectedLeague ? [selectedLeague] : leagues).reduce((total, item) => ({
    correct: total.correct + (item.evaluation?.walkForward?.correct || 0),
    wrong: total.wrong + (item.evaluation?.walkForward?.wrong || 0),
  }), { correct: 0, wrong: 0 })

  const forwardCompared = (summary.forwardHits || 0) + (summary.forwardMisses || 0)
  const validationLabel = item => item.validationStatus === 'awaiting-data' ? 'Awaiting verified data'
    : ['insufficient-history', 'insufficient-time-splits'].includes(item.validationStatus) ? 'Limited history'
      : item.validationStatus === 'retrospective-development-checks' ? 'Historical checks complete' : 'Validation not measured'

  return <div className="md-workbench">
    <header className="md-topbar">
      <div className="md-title"><span className="md-title-icon"><Database size={22} /></span><div>
        <span className="md-eyebrow">CRICEDGE / MATCH INTELLIGENCE</span>
        <h2>Match dataset</h2><p>Saved inputs, league algorithms and verified outcomes.</p>
      </div></div>
      <div className="md-top-actions">
        <button className="md-button md-button-secondary" aria-label="Refresh dataset" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /><span>Refresh</span></button>
        <button className="md-button md-button-primary" onClick={exportJson} disabled={exporting}>{exporting ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}<span>Export JSON</span></button>
      </div>
    </header>
    <div className="md-content">
      <div className="md-library-nav">
        <div className="md-view-tabs" role="group" aria-label="Dataset views">
          <button aria-pressed={view === 'matches'} className={view === 'matches' ? 'is-active' : ''} onClick={() => setView('matches')}><Database size={15} /> Matches <span>{allTotal ?? '—'}</span></button>
          <button aria-pressed={view === 'algorithms'} className={view === 'algorithms' ? 'is-active' : ''} onClick={() => setView('algorithms')}><Cpu size={15} /> League algorithms <span>{leagues.length}</span></button>
        </div>
        <label className="md-league-select" htmlFor="md-league-select"><span>League</span><select id="md-league-select" value={league} onChange={e => selectLeague(e.target.value)}>
          <option value="">All leagues</option>{leagues.map(item => <option key={item.league} value={item.league}>{item.league} ({item.total})</option>)}
        </select></label>
      </div>

      {error && <div className="md-error" role="alert">{error}<button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
      {view === 'algorithms' ? <section className="md-catalog">
        <div className="md-catalog-heading"><div><span className="md-eyebrow">ALGORITHM DIRECTORY</span><h3>One profile for every league</h3><p>Inspect the algorithm and its data before opening the matches.</p></div>
          <label className="md-search"><Search size={16} /><input aria-label="Find a league" placeholder="Search league algorithms…" value={leagueSearch} onChange={e => setLeagueSearch(e.target.value)} /></label>
        </div>
        <p className="md-validation-note">Replay scores use historical saved inputs. Reference models were fitted to historical examples. Neither score establishes future accuracy.</p>
        <div className="md-algorithm-grid">{visibleLeagues.map(item => <article className="md-profile-card" key={item.league}>
          <div className="md-profile-card-top"><span className="md-profile-icon"><Cpu size={18} /></span><span className="md-validation-badge">{validationLabel(item)}</span></div>
          <h4>{item.league}</h4><p className="md-profile-strategy">{item.mode}</p><code>{item.algorithmId}</code>
          <div className="md-profile-scores">
            <div><span>Active replay</span><strong>{percent(item.currentHits, item.currentMisses)}</strong><small>{item.currentHits || 0}/{(item.currentHits || 0) + (item.currentMisses || 0)} verified</small></div>
            <div><span>Earlier-only check</span><strong>{percent(item.evaluation?.walkForward?.correct || 0, item.evaluation?.walkForward?.wrong || 0)}</strong><small>{item.evaluation?.walkForward?.total || 0} examples</small></div>
          </div>
          <div className="md-profile-meta"><span>{item.total} saved matches</span><span>{item.trainingSamples ?? '—'} training examples</span></div>
          <div className="md-profile-version">{item.profileVersion || item.predictorVersion || 'Version unavailable'}</div>
          <button className="md-profile-open" onClick={() => selectLeague(item.league)}>View league matches <ArrowRight size={15} /></button>
        </article>)}</div>
        {loading && !data ? <div className="md-empty" role="status"><LoaderCircle size={24} className="animate-spin" /><p>Loading league profiles…</p></div> : !visibleLeagues.length && <div className="md-empty"><Search size={24} /><h4>No league found</h4><p>Try a different league name.</p></div>}
      </section> : <main className="md-main">
        <div className="md-main-heading"><div><span className="md-eyebrow">{league ? 'LEAGUE DATASET' : 'ALL LEAGUES'}</span><h3>{league || 'Saved match library'}</h3></div>
          <label className="md-auto-refresh"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto-refresh</label>
        </div>
        <div className="md-stats">
          <div><span>Saved matches</span><strong>{summary.total ?? '—'}</strong><small>{summary.pending || 0} pending · {summary.noResult || 0} no result</small></div>
          <div><span>Verified results</span><strong>{summary.verified ?? '—'}</strong><small>Winners checked against results</small></div>
          <div><span>{mode === 'training' ? 'Training fit · in-sample' : mode === 'saved' ? 'Saved forecast replay' : 'Active algorithm replay'}</span><strong className="md-stat-accent">{percent(correct, missed)}</strong><small>{correct} correct · {missed} missed / {compared}</small></div>
          <div><span>Before-start forecasts</span><strong>{summary.forwardForecasts === undefined ? '—' : percent(summary.forwardHits || 0, summary.forwardMisses || 0)}</strong><small>{summary.forwardForecasts === undefined ? 'Tracking data unavailable' : `${forwardCompared ? `${summary.forwardHits} correct / ${forwardCompared} verified` : 'No verified forecasts yet'} · ${summary.forwardPending || 0} pending`}</small></div>
        </div>
        <section className="md-algorithm">
          <div className="md-algorithm-icon"><Cpu size={21} /></div>
          <div className="md-algorithm-copy"><span className="md-eyebrow">{selectedLeague ? 'DEFAULT LEAGUE ALGORITHM' : 'AUTOMATIC LEAGUE ROUTING'}</span>
            <h4>{selectedLeague?.mode || `${leagues.length} independent league profiles`}</h4>
            <p>{selectedLeague ? validationLabel(selectedLeague) : 'Each match uses the profile assigned to its league.'}</p>
            {selectedLeague && <code>{selectedLeague.algorithmId}</code>}
          </div>
          <div className="md-algorithm-validation"><span>Earlier-only replay</span><strong>{percent(diagnostics.correct, diagnostics.wrong)}</strong><small>{diagnostics.correct}/{diagnostics.correct + diagnostics.wrong} historical examples</small></div>
          <details className="md-algorithm-details"><summary><Code2 size={14} /> Profile details</summary><div>
            <p>Engine: {selectedLeague?.predictorVersion || leagues[0]?.predictorVersion || '—'}</p>
            {selectedLeague && <><p>Profile: {selectedLeague.profileVersion || '—'} · Strategy: {selectedLeague.strategy || 'League rules'}</p><p>{selectedLeague.trainingSamples ?? '—'} verified training examples</p></>}
            <p>Earlier-only replay is a retrospective diagnostic. Future accuracy remains unmeasured.</p>
          </div></details>
        </section>
        <div className="md-comparison-heading"><h4>Predicted vs actual</h4><span>{pagination.total} matching records</span></div>
        <div className="md-mode-tabs" role="group" aria-label="Prediction comparison">{Object.entries(MODE_INFO).map(([value, info]) => <button key={value} className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => changeMode(value)}>{info.label}{value === 'training' && <span>In-sample</span>}</button>)}</div>
        <p className={`md-mode-note ${mode === 'training' ? 'md-note-training' : ''}`}>{MODE_INFO[mode].description}{mode === 'active' && ' Replay does not measure future accuracy.'}</p>
        <div className="md-toolbar">
          <label className="md-search md-match-search"><Search size={17} /><input aria-label="Search matches" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search team, match or ID…" /></label>
          <select aria-label="Actual result" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="all">All results</option><option value="verified">Verified winners</option><option value="pending">Pending verification</option><option value="abandoned">No result</option></select>
          <select aria-label="Prediction result" value={result} onChange={e => { setResult(e.target.value); setPage(1) }}><option value="all">All predictions</option><option value="hit">Correct</option><option value="miss">Missed</option><option value="no_pick">No pick</option></select>
        </div>

        <div className="md-matches" aria-busy={loading}>
          {loading ? <div className="md-empty" role="status"><LoaderCircle size={24} className="animate-spin" /><p>Loading saved matches…</p></div>
            : !data?.records?.length ? <div className="md-empty"><Database size={26} /><h4>No matches for these filters</h4><p>{selectedLeague?.total === 0 ? 'This league has its own profile. Matches appear when complete data is saved.' : 'Try another league, result filter or search.'}</p></div>
              : <><div className="md-row-header"><span>Match & date</span><span>Predicted winner</span><span>Actual winner</span><span>Comparison</span><span /></div>{data.records.map(row => <article className="md-match-row" key={row.recordKey}>
                <div className="md-match-identity"><span className="md-match-date">{fmtDate(row.startTime)}<span> · {row.league}</span></span><h4>{row.matchName || `${row.team1} v ${row.team2}`}</h4><p>{row.forecastIssuedBeforeStart ? 'Forecast saved before start' : 'Historical saved snapshot'}</p></div>
                <div className="md-match-pick"><span className="md-mobile-label">Predicted</span><strong>{pickFor(row, mode) || 'No pick'}</strong><small>{MODE_INFO[mode].label}</small></div>
                <div className="md-match-actual"><span className="md-mobile-label">Actual</span><strong className={!row.actualWinner ? 'md-muted' : ''}>{row.actualWinner || (row.resultConflict ? 'Conflicting results' : 'Not verified yet')}</strong><small>{row.status === 'verified' ? 'Verified result' : row.status === 'abandoned' ? 'No result' : 'Awaiting verification'}</small></div>
                <div className="md-match-result"><ResultBadge comparison={row[MODE_INFO[mode].comparison]} /></div>
                <button className="md-row-button" onClick={() => setSelectedRow(row)} aria-label={`View snapshot for ${row.matchName}`}><span>Snapshot</span><ArrowRight size={15} /></button>
              </article>)}</>}
        </div>
        <footer className="md-pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} matches</span><div><button aria-label="Previous page" disabled={loading || pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}><ChevronLeft size={17} /></button><button aria-label="Next page" disabled={loading || pagination.page >= pagination.pages} onClick={() => setPage(pagination.page + 1)}><ChevronRight size={17} /></button></div></footer>
        <div className="md-footnote"><span><ShieldCheck size={14} /> Complete team, league, volume and P/L data required.</span><span>Updated {fmtDate(data?.updatedAt, true)} IST</span>{data?.quality?.excluded > 0 && <span>{data.quality.excluded} incomplete records excluded.</span>}</div>
      </main>}
    </div>
    {selectedRow && <SnapshotDrawer row={selectedRow} mode={mode} onClose={closeDrawer} />}
  </div>
}
