import { Building2, Bus, RotateCcw, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { href, navigate } from '../lib/router'
import { useSimControls } from '../sim/context'
import { useStore } from '../store/context'
import { createSeedState } from '../store/state'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { useToast } from './ui/toast-context'

const roles = [
  { area: 'parent', label: 'Parent app', short: 'Parent', icon: UsersRound },
  { area: 'school', label: 'School admin', short: 'School', icon: Building2 },
] as const

export function AppHeader({ area }: { area: string | undefined }) {
  const { state, dispatch } = useStore()
  const sim = useSimControls()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  const reset = () => {
    sim.stop()
    dispatch({ type: 'replace', state: createSeedState() })
    setConfirmReset(false)
    toast({ tone: 'success', title: 'Demo data restored', description: '4 buses and 41 students are back to their starting state.' })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <a href={href('/')} className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-offset-4" aria-label="Smart Transport home">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-sm" aria-hidden="true">
            <Bus className="size-5" strokeWidth={2.4} />
          </span>
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-[15px] font-extrabold text-ink">Smart Transport</span>
            <span className="truncate text-xs font-medium text-ink-3">{state.settings.name}</span>
          </span>
        </a>
        <span className="hidden rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary lg:inline">Feature preview</span>

        <nav aria-label="Switch view" className="ml-auto flex items-center rounded-xl bg-muted p-1">
          {roles.map(({ area: target, label, short, icon: Icon }) => {
            const current = area === target
            return (
              <a
                key={target}
                href={href(`/${target}`)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors',
                  current ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
              </a>
            )
          })}
        </nav>

        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} className="px-2.5 sm:px-3" aria-label="Reset demo data">
          <RotateCcw className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">Reset demo</span>
        </Button>
      </div>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        size="sm"
        title="Reset the demo?"
        description="Buses, routes, settings and every child you registered go back to the starting sample data. This can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Keep my changes
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset()
                navigate(area ? `/${area}` : '/')
              }}
            >
              Reset demo data
            </Button>
          </>
        }
      />
    </header>
  )
}
