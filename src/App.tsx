import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import FeedPage from './pages/FeedPage'
import MapPage from './pages/MapPage'

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/feed" element={<FeedPage />} />
        </Routes>
      </main>
    </div>
  )
}
