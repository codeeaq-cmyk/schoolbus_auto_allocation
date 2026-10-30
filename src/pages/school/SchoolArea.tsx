import { BarChart3, Bus, LayoutDashboard, Settings, Sparkles, UsersRound } from 'lucide-react'
import { motion } from 'motion/react'
import { PageFade } from '../../components/ui/motion'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'
import { href, type Route } from '../../lib/router'
import { useStore } from '../../store/context'
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
  const { state } = useStore()
  const { autopilot } = state.settings

  return (
    <RecommendationsProvider>
      <div className="flex flex-1">
        {/* Desktop: a dark rail that stays put while the content changes. */}
        <aside className="on-dark gradient-rail sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col p-3 lg:flex">
          <nav aria-label="School admin">
            <ul className="flex flex-col gap-1">
              {tabs.map(({ id, label, icon: Icon }) => {
                const current = section === id
                return (
                  <li key={id}>
                    <a
                      href={href(id ? `/school/${id}` : '/school')}
                      aria-current={current ? 'page' : undefined}
                      className={cn('group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors', current ? 'text-white' : 'text-night-ink hover:text-white')}
                    >
                      {current && <motion.span layoutId="rail-pill" className="gradient-primary absolute inset-0 rounded-xl" transition={spring} />}
                      <Icon className="relative size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                      <span className="relative">{label}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>

          <a href={href('/school/settings')} className="mt-auto block rounded-2xl bg-white/5 p-3.5 transition-colors hover:bg-white/10">
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <span className="relative flex size-2.5" aria-hidden="true">
                {autopilot && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />}
                <span className={cn('relative inline-flex size-2.5 rounded-full', autopilot ? 'bg-accent' : 'bg-night-ink')} />
              </span>
              Autopilot {autopilot ? 'on' : 'off'}
            </span>
            <span className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-night-ink">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {autopilot ? 'Plans update by themselves.' : 'Plans wait for you to re-optimise.'}
            </span>
          </a>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
          <PageFade pageKey={section} className="flex flex-1 flex-col">
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
          </PageFade>
        </div>

        {/* Phones: thumb-reach tabs along the bottom. */}
        <nav aria-label="School admin" className="on-dark pb-safe fixed inset-x-0 bottom-0 z-30 bg-night lg:hidden">
          <ul className="flex items-stretch">
            {tabs.map(({ id, label, short, icon: Icon }) => {
              const current = section === id
              return (
                <li key={id} className="flex-1">
                  <a
                    href={href(id ? `/school/${id}` : '/school')}
                    aria-current={current ? 'page' : undefined}
                    className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors', current ? 'text-white' : 'text-night-ink')}
                  >
                    {current && <motion.span layoutId="tab-pill" className="gradient-primary absolute inset-x-2 inset-y-1 rounded-xl" transition={spring} />}
                    <Icon className="relative size-5" aria-hidden="true" />
                    <span className="relative">{short ?? label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </RecommendationsProvider>
  )
}
