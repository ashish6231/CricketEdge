import { BrowserRouter, Routes, Route, Navigate, useOutletContext, useLocation } from 'react-router-dom'
import { lazy, useEffect } from 'react'
import MainLayout from './components/MainLayout'
import { ToastProvider } from './components/ToastProvider'
import PageLoading from './components/PageLoading'

const CricketPage = lazy(() => import('./pages/CricketPage'))
const TennisPage = lazy(() => import('./pages/TennisPage'))
const TossPage = lazy(() => import('./pages/TossPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'))

function AppShell() {
  return <MainLayout />
}

function RedirectToCricket() {
  const location = useLocation()
  return <Navigate to={`/cricket${location.search}${location.hash}`} replace />
}

function LoginRedirect() {
  const location = useLocation()
  useEffect(() => {
    sessionStorage.setItem('open_login_modal', '1')
    window.dispatchEvent(new CustomEvent('open-login-modal'))
  }, [])
  return <Navigate to={`/cricket${location.search}${location.hash}`} replace />
}

function RequireAuth({ children }) {
  const { isLoggedIn, authReady } = useOutletContext()
  useEffect(() => {
    if (authReady && !isLoggedIn) {
      window.dispatchEvent(new CustomEvent('open-login-modal'))
    }
  }, [authReady, isLoggedIn])
  if (!authReady) return <PageLoading label="Loading your account" />
  if (!isLoggedIn) return <Navigate to="/cricket" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, isLoggedIn } = useOutletContext()
  if (!isLoggedIn || !user) return <PageLoading label="Loading your workspace" />
  if (!['admin', 'superadmin'].includes(user.role)) return <Navigate to="/cricket" replace />
  return children
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<RedirectToCricket />} />
            <Route path="/login" element={<LoginRedirect />} />
            <Route path="/cricket" element={<CricketPage />} />
            <Route path="/cricket/match/:matchId" element={<CricketPage />} />
            <Route path="/tennis" element={<TennisPage />} />
            <Route path="/tennis/match/:matchId" element={<TennisPage />} />
            <Route path="/toss" element={<TossPage />} />
            <Route path="/toss/match/:matchId" element={<TossPage />} />
            <Route path="/admin" element={<RequireAuth><AdminRoute><AdminPage /></AdminRoute></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/subscription" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
            <Route path="*" element={<RedirectToCricket />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
