import { ArrowRight, BadgeCheck, Building2, CalendarClock, Hand, IndianRupee, MapPinned, Route, Sparkles, UsersRound, Van } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { LiveVehicles } from '../components/map/layers'
import { BaseMap } from '../components/map/BaseMap'
import { NetworkLayers } from '../components/map/NetworkLayers'
import { ButtonLink } from '../components/ui/Button'
import { AnimatedNumber, Reveal, Stagger, StaggerItem } from '../components/ui/motion'
import { compareWithManual } from '../lib/engine/baseline'
import { inr, inrSigned, kmValue } from '../lib/format'
import { EASE_OUT } from '../lib/motion'
import { href } from '../lib/router'
import { useSimControls } from '../sim/context'
import { useStore } from '../store/context'

const AUTOMATIC = [
  { icon: <MapPinned />, title: 'Boarding points', body: 'Placed on real roads so every child is within walking distance, using the fewest stops.', wide: true },
  { icon: <Van />, title: 'Bus or van', body: 'Wide roads get buses. Lanes too narrow for a bus get a van, or a short walk to the main road.' },
  { icon: <Route />, title: 'Allocation and routes', body: 'Which child rides what, and the driving order, for the lowest running cost within your ride limit.' },
  { icon: <CalendarClock />, title: 'Pickup times', body: 'Worked back from the school bell for every stop, morning and evening.' },
  { icon: <IndianRupee />, title: 'Fees and profit', body: 'Fees by distance, costs per vehicle, and improvements priced before you commit to them.' },
  { icon: <Hand />, title: 'Your call, always', body: 'Pin a child, move a stop, lock a route. The system plans around your change and keeps it.', wide: true },
]

const STEPS = [
  { title: 'Set up your fleet', body: 'Enter each vehicle: bus or van, how many seats, and where it starts.' },
  { title: 'Parents pin their homes', body: 'They see the boarding point, vehicle, pickup time and fee straight away.' },
  { title: 'The plan runs itself', body: 'Routes stay efficient as families join. You overrule only what you want to.' },
]

export function Landing() {
  const { state, view, fleet, routeStatus } = useStore()
  const sim = useSimControls()
  const reduced = useReducedMotion()
  const savings = useMemo(() => compareWithManual(state, fleet), [state, fleet])
  const routes = [...view.routes.values()]
  const { start, stop, setSpeed, finished } = sim

  // The hero map plays the morning run on a loop, unless the visitor prefers less motion.
  useEffect(() => {
    if (reduced) return
    setSpeed(2)
    start()
    return () => {
      stop()
      setSpeed(1)
    }
    // Starting once is enough; the loop below handles replays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])

  useEffect(() => {
    if (finished && !reduced) {
      const timer = window.setTimeout(() => start(), 1500)
      return () => window.clearTimeout(timer)
    }
  }, [finished, reduced, start])

  return (
    <div className="relative overflow-x-clip">
      {/* Soft color drifting behind the hero. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[780px]" aria-hidden="true">
        <div className="animate-drift absolute -left-32 -top-24 size-[520px] rounded-full bg-[radial-gradient(circle,rgb(124_58_237/0.2),transparent_65%)]" />
        <div className="animate-drift absolute -right-24 top-20 size-[560px] rounded-full bg-[radial-gradient(circle,rgb(251_191_36/0.22),transparent_65%)] [animation-delay:-6s]" />
      </div>

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-8 sm:px-6 lg:pt-14">
        <section className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <Stagger>
            <StaggerItem>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Ceeq Smart Transport · A school management feature
              </span>
            </StaggerItem>
            <StaggerItem>
              <h1 className="mt-5 text-[38px] font-extrabold leading-[1.06] tracking-tight text-ink text-balance sm:text-[56px]">
                School transport that <span className="text-gradient">plans itself</span>, and pays for itself.
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
                Tell it where each vehicle starts and how many seats it has. Parents pin their homes. Boarding points, bus or van, routes, times and fees are all worked out, and you can overrule any of it.
              </p>
            </StaggerItem>
            <StaggerItem>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href={href('/school')} size="lg">
                  <Building2 className="size-5" aria-hidden="true" />
                  Open school admin
                </ButtonLink>
                <ButtonLink href={href('/parent')} size="lg" variant="secondary">
                  <UsersRound className="size-5" aria-hidden="true" />
                  Open parent app
                </ButtonLink>
              </div>
            </StaggerItem>
            <StaggerItem>
              <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {[
                  { label: 'Children seated', value: fleet.seated, format: (n: number) => String(Math.round(n)) },
                  { label: 'Boarding points', value: fleet.stops, format: (n: number) => String(Math.round(n)) },
                  { label: 'Profit a month', value: fleet.profit, format: inr },
                  { label: 'Less driving', value: Math.max(0, savings.kmDaily), format: (n: number) => `${Math.round(n)} km` },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-xs font-medium text-ink-3">{stat.label}</dt>
                    <dd className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight text-ink">
                      <AnimatedNumber value={stat.value} from={0} format={stat.format} />
                    </dd>
                  </div>
                ))}
              </dl>
            </StaggerItem>
          </Stagger>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }} className="relative">
            <div className="h-[360px] overflow-hidden rounded-[2rem] sm:h-[540px]">
              <div className="size-full">
                <BaseMap center={state.settings.location} zoom={12} label={`Map of all routes in Thiruvananthapuram for ${state.settings.name}`} interactive={false}>
                  <NetworkLayers state={state} view={view} routeStatus={routeStatus} showHomes />
                  <LiveVehicles routes={routes} settings={state.settings} />
                </BaseMap>
              </div>
            </div>

            <div className="absolute -left-2 top-6 z-10 bg-surface flex items-center gap-3 rounded-2xl p-3 sm:-left-6">
              <span className="grid size-9 place-items-center rounded-xl bg-success-soft text-success-ink" aria-hidden="true">
                <BadgeCheck className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-bold text-ink">Seat confirmed</span>
                <span className="block text-xs text-ink-3">Pickup worked out in a moment</span>
              </span>
            </div>
            <div className="absolute -right-2 bottom-6 z-10 rounded-2xl bg-night p-3.5 text-white sm:-right-6">
              <p className="text-xs font-medium text-night-ink">Against planning by hand</p>
              <p className="text-xl font-extrabold tracking-tight text-white">{inrSigned(savings.profit)}/mo</p>
            </div>
          </motion.div>
        </section>

        <section aria-labelledby="auto-heading" className="mt-24">
          <Reveal>
            <h2 id="auto-heading" className="text-3xl font-extrabold tracking-tight text-ink sm:text-[38px]">
              Everything that used to take a week of phone calls
            </h2>
            <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-ink-2">All of it runs on autopilot. Every decision comes with a reason, and every one can be overruled.</p>
          </Reveal>
          <Stagger inView as="ul" className="mt-8 grid gap-4 md:grid-cols-3">
            {AUTOMATIC.map((item) => (
              <StaggerItem as="li" key={item.title} className={item.wide ? 'md:col-span-2 md:last:col-span-3' : ''}>
                <div className="group h-full rounded-3xl bg-surface p-6">
                  <span className="gradient-primary grid size-11 place-items-center rounded-2xl text-white transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 [&>svg]:size-5" aria-hidden="true">
                    {item.icon}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-2">{item.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <section aria-labelledby="how-heading" className="mt-24">
          <Reveal>
            <h2 id="how-heading" className="text-3xl font-extrabold tracking-tight text-ink sm:text-[38px]">
              Three steps, then it runs
            </h2>
          </Reveal>
          <Stagger inView as="ol" className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <StaggerItem as="li" key={step.title} className="relative">
                {i < STEPS.length - 1 && <span className="absolute left-14 top-5 hidden h-0.5 w-[calc(100%-2.5rem)] bg-[linear-gradient(90deg,var(--color-line-strong)_50%,transparent_50%)] bg-[length:10px_2px] md:block" aria-hidden="true" />}
                <span className="gradient-amber relative grid size-10 place-items-center rounded-full text-sm font-extrabold text-on-accent">{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-1 leading-relaxed text-ink-2">{step.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <Reveal className="mt-24">
          <section className="gradient-night relative overflow-hidden rounded-[2rem] p-8 text-white sm:p-12">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-[38px]">See both sides of it</h2>
              <p className="mt-3 text-[17px] leading-relaxed text-night-ink">
                Open the parent app and the school admin in two tabs. A request from a parent lands in the school's plan straight away.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={href('/parent')} size="lg" variant="accent">
                  Try it as a parent
                  <ArrowRight className="size-5" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href={href('/school')} size="lg" variant="night">
                  Try it as the school
                </ButtonLink>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-night-ink">
                A demo with a fictional school. Costs and fees are sample figures. {kmValue(Math.max(0, savings.kmDaily))} a day and {inrSigned(savings.profit)} a month are against a modelled hand-made plan, not a measured one.
              </p>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  )
}

