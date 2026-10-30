import { Building2, RotateCcw, UsersRound } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { spring } from '../lib/motion'
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
  const { update } = useStore()
  const sim = useSimControls()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  const reset = () => {
    sim.stop()
    update(() => createSeedState())
    setConfirmReset(false)
    toast({ tone: 'success', title: 'Demo data restored', description: 'The fleet, children and plan are back to their starting state.' })
  }

  return (
    <header className="on-dark sticky top-0 z-40 bg-night text-white">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-5">
        <a href={href('/')} className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-offset-4" aria-label="Ceeq Smart Transport home">
          <img src="/ceeq-logo.png" alt="" width={40} height={40} className="size-10 shrink-0" />
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-[15px] font-extrabold text-white">Ceeq Smart Transport</span>
            <span className="truncate text-xs font-medium text-night-ink">School management feature</span>
          </span>
        </a>

        <nav aria-label="Switch view" className="ml-auto flex items-center rounded-2xl bg-white/10 p-1">
          {roles.map(({ area: target, label, short, icon: Icon }) => {
            const current = area === target
            return (
              <a
                key={target}
                href={href(`/${target}`)}
                aria-current={current ? 'page' : undefined}
                className={cn('relative flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors', current ? 'text-white' : 'text-night-ink hover:text-white')}
              >
                {current && <motion.span layoutId="role-pill" className="gradient-primary absolute inset-0 rounded-xl" transition={spring} />}
                <Icon className="relative size-4" aria-hidden="true" />
                <span className="relative hidden sm:inline">{label}</span>
                <span className="relative sm:hidden">{short}</span>
              </a>
            )
          })}
        </nav>

        <Button variant="night" size="sm" onClick={() => setConfirmReset(true)} className="px-2.5 sm:px-3" aria-label="Reset demo data">
          <RotateCcw className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">Reset demo</span>
        </Button>
      </div>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        size="sm"
        title="Reset the demo?"
        description="The fleet, plan, settings and every child you registered go back to the starting sample data. This can't be undone."
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
