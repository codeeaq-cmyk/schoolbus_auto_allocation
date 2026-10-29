import { useEffect, useRef } from 'react'
import { AppHeader } from './components/AppHeader'
import { useRoute } from './lib/router'
import { Landing } from './pages/Landing'
import { ChildDetail } from './pages/parent/ChildDetail'
import { ParentHome } from './pages/parent/ParentHome'
import { RequestBus } from './pages/parent/RequestBus'
import { SchoolArea } from './pages/school/SchoolArea'

const TITLES: Record<string, string> = {
  parent: 'Parent app',
  school: 'School admin',
}

export default function App() {
  const route = useRoute()
  const [area, section, id] = route.segments
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // On navigation: reset scroll, update the title, and move focus so screen readers announce the new page.
  useEffect(() => {
    document.title = `${TITLES[area] ? `${TITLES[area]} · ` : ''}Smart Transport`
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [route.path, area])

  let page
  if (area === 'parent') {
    if (section === 'request') page = <RequestBus key={route.query.get('edit') ?? 'new'} editId={route.query.get('edit')} />
    else if (section === 'child' && id) page = <ChildDetail key={id} id={id} isNew={route.query.get('new') === '1'} />
    else page = <ParentHome />
  } else if (area === 'school') {
    page = <SchoolArea route={route} />
  } else {
    page = <Landing />
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only z-50 rounded-xl bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </button>
      <AppHeader area={area} />
      <main ref={mainRef} tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {page}
      </main>
    </div>
  )
}
