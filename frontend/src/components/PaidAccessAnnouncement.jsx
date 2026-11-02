import { useEffect, useRef } from 'react'
import { ArrowUpRight, CalendarDays, Crown, MessageCircle, CheckCircle, LockKeyhole, X } from 'lucide-react'
import TelegramLink, { AdminTelegramLink, TelegramIcon } from './TelegramLink'

export default function PaidAccessAnnouncement({ siteName, onClose, completedOnly = false, onViewPlans, onBrowseCompleted }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    dialog.querySelector('button').focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const controls = [...dialog.querySelectorAll('a[href], button')]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      dialog.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return (
    <div className="paid-announcement-backdrop" onClick={onClose}>
      <section ref={dialogRef} className="paid-announcement" role="dialog" aria-modal="true" aria-labelledby="paid-announcement-title" aria-describedby="paid-announcement-description" onClick={event => event.stopPropagation()}>
        <div className="paid-announcement-hero">
          <button type="button" className="paid-announcement-close" aria-label="Close announcement" onClick={onClose}><X size={20} /></button>
          <span className="paid-announcement-label"><Crown size={15} /> {completedOnly ? 'YOUR CRICEDGE ACCESS' : 'PREMIUM IS RETURNING'}</span>
          <h2 id="paid-announcement-title">{completedOnly ? <>Keep exploring.<br /><span>Unlock more with a plan.</span></> : <>Your edge. <span>Going premium.</span></>}</h2>
          <p id="paid-announcement-description">{completedOnly ? 'You don’t have an active subscription. Completed match details are yours to explore for free.' : `Paid access returns to ${siteName}.`}</p>
          {!completedOnly && <div className="paid-announcement-launch"><CalendarDays size={17} /><time dateTime="2026-11-04T20:00:00+05:30">4 November · 8 PM IST</time></div>}
        </div>
        <div className="paid-announcement-body">
          {completedOnly ? <>
            <div className="access-notice-summary"><span><CheckCircle size={16} /> Completed match details <strong>FREE</strong></span><span><LockKeyhole size={16} /> Live & upcoming details <strong>PLAN NEEDED</strong></span></div>
            <button type="button" className="access-notice-plans" onClick={onViewPlans}>Explore Lite & Pro <ArrowUpRight size={17} /></button>
            <AdminTelegramLink className="access-notice-admin" onClick={onClose}><TelegramIcon size={15} /> Subscribe via Telegram</AdminTelegramLink>
            <button type="button" className="paid-announcement-continue" onClick={onBrowseCompleted}>Browse completed matches →</button>
          </> : <>
          <TelegramLink className="paid-announcement-join" onClick={onClose} aria-label="Join our official Telegram channel (opens in a new tab)"><TelegramIcon size={18} /><span><strong>Join official channel</strong><small>@cricedge_online</small></span><ArrowUpRight size={18} /></TelegramLink>
          <AdminTelegramLink className="paid-announcement-admin" onClick={onClose} aria-label="Get paid access: contact admin @cricedgeonline on Telegram (opens in a new tab)"><MessageCircle size={18} /><span><strong>Buy subscription</strong><small>Contact admin · @cricedgeonline</small></span><ArrowUpRight size={18} /></AdminTelegramLink>
          <button type="button" className="paid-announcement-continue" onClick={onClose}>Continue browsing</button>
          </>}
        </div>
      </section>
    </div>
  )
}
