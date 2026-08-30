import { lazy, Suspense, useEffect, useState } from 'react'
import { WidgetView } from './views/WidgetView'
import { isTauri } from './services/platform'

const QuizScreen = lazy(() => import('./views/QuizScreen').then((module) => ({ default: module.QuizScreen })))
const SettingsScreen = lazy(() => import('./views/SettingsScreen').then((module) => ({ default: module.SettingsScreen })))

function ViewLoader() {
  return <main className="app-window theme-dark"><div className="screen-loading"><span /></div></main>
}

export function App() {
  const requestedView = new URLSearchParams(window.location.search).get('view')
  const [view, setView] = useState(requestedView ?? 'widget')

  useEffect(() => {
    if (requestedView || !isTauri()) return
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const label = getCurrentWindow().label
      if (label === 'quiz' || label === 'settings') setView(label)
    })
  }, [requestedView])

  useEffect(() => {
    document.documentElement.dataset.view = view
    document.body.dataset.view = view
  }, [view])

  if (view === 'quiz') return <Suspense fallback={<ViewLoader />}><QuizScreen /></Suspense>
  if (view === 'settings') return <Suspense fallback={<ViewLoader />}><SettingsScreen /></Suspense>
  return <WidgetView />
}
