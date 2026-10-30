import { BarChart3, Bus, LayoutDashboard, Settings, UsersRound } from 'lucide-react'
import { cn } from '../../lib/cn'
import { href, type Route } from '../../lib/router'
import { RecommendationsProvider } from '../../store/RecommendationsProvider'
import { Analytics } from './Analytics'
import { Fleet } from './Fleet'
import { Overview } from './Overview'
import { SchoolSettingsPage } from './SchoolSettingsPage'
import { Students } from './Students'

const tabs = [
  { id: '', label: 'Overview', icon: LayoutDashboard },
  { id: 'fleet', label: 'Fleet & routes', short: 'Fleet', icon: Bus },
  { id: 'students', label: 'Students', icon: UsersRound },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function SchoolArea({ route }: { route: Route }) {
  const section = route.segments[1] ?? ''

  return (
    <RecommendationsProvider>
      <div className="flex flex-1 flex-col">
        <nav aria-label="School admin" className="border-b border-line bg-surface">
          <ul className="mx-auto flex h-[52px] max-w-[1600px] items-stretch gap-0.5 overflow-x-auto px-2 sm:gap-1 sm:px-4">
            {tabs.map(({ id, label, short, icon: Icon }) => {
              const current = section === id
              return (
                <li key={id} className="flex shrink-0">
                  <a
                    href={href(id ? `/school/${id}` : '/school')}
                    aria-current={current ? 'page' : undefined}
                    className={cn('relative flex items-center gap-2 rounded-t-lg px-2 text-sm font-semibold transition-colors sm:px-3', current ? 'text-primary' : 'text-ink-3 hover:text-ink')}
                  >
                    <Icon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
                    <span className={short ? 'hidden sm:inline' : undefined}>{label}</span>
                    {short && <span className="sm:hidden">{short}</span>}
                    {current && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        {section === 'fleet' ? (
          <Fleet key={route.query.get('tab') ?? 'vehicles'} selectedId={route.query.get('bus')} initialTab={route.query.get('tab') === 'stops' ? 'stops' : 'vehicles'} />
        ) : section === 'students' ? (
          <Students initialStatus={route.query.get('status')} />
        ) : section === 'analytics' ? (
          <Analytics />
        ) : section === 'settings' ? (
          <SchoolSettingsPage />
        ) : (
          <Overview />
        )}
      </div>
    </RecommendationsProvider>
  )
}
