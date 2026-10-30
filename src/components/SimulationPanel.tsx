import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '../lib/cn'
import { spring } from '../lib/motion'
import { formatClock } from '../lib/time'
import { SPEED_OPTIONS, useSimClock, useSimControls } from '../sim/context'
import { Button } from './ui/Button'

/** Start / pause / speed controls for the simulated morning run. */
export function SimulationPanel({ className, label = 'Simulate morning run', startAt }: { className?: string; label?: string; startAt?: number }) {
  const sim = useSimControls()

  if (!sim.active) {
    return (
      <Button variant="accent" onClick={() => sim.start(startAt)} className={className}>
        <Play className="size-4 fill-current" aria-hidden="true" />
        {label}
      </Button>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className={cn('glass-strong inline-flex flex-wrap items-center gap-1 rounded-2xl p-1 text-ink', className)}>
      <ClockReadout running={sim.running} />
      {sim.finished ? (
        <Button size="sm" variant="ghost" onClick={() => sim.start(startAt)}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Replay
        </Button>
      ) : (
        <Button size="icon" variant="ghost" onClick={sim.running ? sim.pause : sim.resume} aria-label={sim.running ? 'Pause simulation' : 'Resume simulation'}>
          {sim.running ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
        </Button>
      )}
      <div className="flex items-center rounded-xl bg-muted p-0.5" role="group" aria-label="Simulation speed">
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={sim.speed === opt.value}
            onClick={() => sim.setSpeed(opt.value)}
            className={cn('h-8 cursor-pointer rounded-lg px-2 text-xs font-bold transition-colors tabular', sim.speed === opt.value ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink')}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Button size="icon" variant="ghost" onClick={sim.stop} aria-label="End simulation">
        <X className="size-4" aria-hidden="true" />
      </Button>
    </motion.div>
  )
}

function ClockReadout({ running }: { running: boolean }) {
  const clock = useSimClock()
  if (clock === null) return null
  return (
    <span className="flex items-center gap-2 px-2.5 text-sm font-bold text-ink tabular" aria-label={`Simulated time ${formatClock(clock)}`}>
      <span className={cn('size-2 rounded-full', running ? 'animate-pulse bg-success' : 'bg-ink-3')} aria-hidden="true" />
      {formatClock(clock)}
    </span>
  )
}
