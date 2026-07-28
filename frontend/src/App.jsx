import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom'
import { useState, useEffect } from 'react'
import MainLayout from './components/MainLayout'
import LoginPage from './pages/LoginPage'
import CricketPage from './pages/CricketPage'
import TennisPage from './pages/TennisPage'
import SessionPage from './pages/SessionPage'
import TossPage from './pages/TossPage'
import SessionDetail from './pages/SessionDetail'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import SubscriptionPage from './pages/SubscriptionPage'
import { getAuthStatus } from './api'

function PrivateRoute() {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)

  const verify = async () => {
    // Handle Google OAuth callback token (stored in sessionStorage to avoid URL exposure)
    const pendingToken = sessionStorage.getItem('pending_token')
    if (pendingToken) {
      localStorage.setItem('auth_token', pendingToken)
      sessionStorage.removeItem('pending_token')
    }
    const token = localStorage.getItem('auth_token')
    if (!token) { setStatus('fail'); return }
    const res = await getAuthStatus()
    if (res.isLoggedIn) { setUser(res.user); setStatus('ok') }
    else setStatus('fail')
  }

  useEffect(() => {
    verify()
    window.addEventListener('focus', verify)
    document.addEventListener('visibilitychange', verify)
    return () => {
      window.removeEventListener('focus', verify)
      document.removeEventListener('visibilitychange', verify)
    }
  }, [])

  if (status === 'loading') return null
  if (status === 'fail') return <Navigate to="/login" replace />
  return <MainLayout />
}

function ProRoute({ children }) {
  const { user, isLoggedIn } = useOutletContext()
  if (!isLoggedIn || !user) return null
  const isPro = user.subscription?.planSlug === 'pro' || user.role === 'admin' || user.role === 'superadmin'
  if (!isPro) return <Navigate to="/subscription" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, isLoggedIn } = useOutletContext()
  if (!isLoggedIn || !user) return null
  if (!['admin', 'superadmin'].includes(user.role)) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<PrivateRoute />}>
          <Route path="/" element={<Navigate to="/cricket" replace />} />
          <Route path="/cricket" element={<ProRoute><CricketPage /></ProRoute>} />
          <Route path="/cricket/match/:matchId" element={<ProRoute><CricketPage /></ProRoute>} />
          <Route path="/tennis" element={<ProRoute><TennisPage /></ProRoute>} />
          <Route path="/tennis/match/:matchId" element={<ProRoute><TennisPage /></ProRoute>} />
          <Route path="/session" element={<ProRoute><SessionPage /></ProRoute>} />
          <Route path="/session/match/:matchId" element={<ProRoute><SessionDetail /></ProRoute>} />
          <Route path="/toss" element={<ProRoute><TossPage /></ProRoute>} />
          <Route path="/toss/match/:matchId" element={<ProRoute><TossPage /></ProRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
