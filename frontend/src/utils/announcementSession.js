const KEY = 'cricedge:premium-launch:shown:v2'

// sessionStorage survives refresh and route changes, but ends when the tab/app closes.
export function shouldShowAnnouncement(storage, kind = 'launch') {
  try { return storage?.getItem(kind === 'access' ? 'cricedge:completed-only:shown:v1' : KEY) !== '1' } catch { return true }
}

export function markAnnouncementShown(storage, kind = 'launch') {
  try { storage?.setItem(kind === 'access' ? 'cricedge:completed-only:shown:v1' : KEY, '1') } catch { /* Private browsing may block storage. */ }
}
