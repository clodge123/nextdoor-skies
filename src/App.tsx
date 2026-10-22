// W3-B1 ROUTING — real URL routing (session 2 decision 2). Routes:
//   /                    map (existing)
//   /feed                session-town feed (existing)
//   /t/<slug>            town page shell (slug validated in routing.ts)
//   /t/<slug>/feed       town feed seeded with THAT town, not the session town
//   /p/<id>              post detail placeholder (content lands in D3)
//   /alerts              alerts page placeholder
// Unknown town slugs resolve to the honest 404 page (search box included).
// History API + popstate come from BrowserRouter (main.tsx); deep links
// resolve on hard load via the Vercel SPA rewrite (/api-excluded paths).
import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import CommandPalette, { usePaletteOpen } from './components/CommandPalette'
import TourHost from './components/Tour'
import FeedPage from './pages/FeedPage'
import MapPage from './pages/MapPage'
import TownPage from './pages/TownPage'
import TownFeedPage from './pages/TownFeedPage'
import PostDetailPage from './pages/PostDetailPage'
import AlertsPage from './pages/AlertsPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  // W3-C3 COMMAND PALETTE: Ctrl/Cmd+K app-wide (session 3 decision 4).
  const palette = usePaletteOpen()
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/t/:slug" element={<TownPage />} />
          <Route path="/t/:slug/feed" element={<TownFeedPage />} />
          <Route path="/p/:id" element={<PostDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
      {/* W3-E2 FIRST-VISIT TOUR (session 5): seen-once spotlight tour, replay
          via palette 'Show tour' / drawer 'Take the tour'. Portal on body; 
          never blocks first paint for returning users (unseen check is a
          synchronous localStorage read, open is delayed past paint). */}
      <TourHost />
    </div>
  )
}
