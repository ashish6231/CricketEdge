import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function PrivateRoute() {
  return localStorage.getItem('auth_token') ? <MainLayout /> : <Navigate to="/login" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<PrivateRoute />}>
          <Route path="/" element={<Navigate to="/cricket" replace />} />
          <Route path="/cricket" element={<CricketPage />} />
          <Route path="/cricket/match/:matchId" element={<CricketPage />} />
          <Route path="/tennis" element={<TennisPage />} />
          <Route path="/tennis/match/:matchId" element={<TennisPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/session/match/:matchId" element={<SessionDetail />} />
          <Route path="/toss" element={<TossPage />} />
          <Route path="/toss/match/:matchId" element={<TossPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
