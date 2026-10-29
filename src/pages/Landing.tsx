import { ArrowRight, Building2, Clock4, MapPinned, Route, Sparkles, SplitSquareHorizontal, UsersRound } from 'lucide-react'
import { BaseMap } from '../components/map/BaseMap'
import { NetworkLayers } from '../components/map/NetworkLayers'
import type { ReactNode } from 'react'
import { href } from '../lib/router'
import { useStore } from '../store/context'

export function Landing() {
  const { state, result, routeStatus } = useStore()
  const seats = state.buses.reduce((sum, b) => sum + b.capacity, 0)
  const assigned = [...result.byStudent.values()].filter((a) => a.status === 'assigned').length
  const waitlisted = state.students.length - assigned

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 lg:pt-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            New in the school app · Feature preview
          </span>
          <h1 className="mt-4 text-[34px] font-extrabold leading-[1.1] tracking-tight text-ink text-balance sm:text-5xl">
            Every child gets a seat on the <span className="relative isolate whitespace-nowrap">right bus<span className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded bg-accent/70" aria-hidden="true" /></span>, automatically.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-2">
            Parents drop a pin at home. The system finds the bus route that passes closest, checks for a free seat, and sends back a pickup point and
            time. The school just adds buses, sets how many seats each one has, and draws its routes.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <RoleCard
              to="/parent"
              icon={<UsersRound />}
              title="I'm a parent"
              body="Request a bus seat, see the pickup point and time, and track the bus live."
              cta="Open parent app"
            />
            <RoleCard
              to="/school"
              icon={<Building2 />}
              title="I'm the school"
              body="Add buses and seats, draw routes, and watch students get assigned."
              cta="Open school admin"
            />
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              ['Buses', state.buses.length],
              ['Seats', seats],
              ['Assigned', assigned],
              ['Waitlisted', waitlisted],
            ].map(([label, value]) => (
              <div key={label} className="border-l-2 border-line-strong pl-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</dt>
                <dd className="text-2xl font-extrabold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative h-[340px] overflow-hidden rounded-3xl border border-line shadow-float sm:h-[460px] animate-fade-in">
          <BaseMap center={state.settings.location} zoom={12} label="Map of all school bus routes" interactive={false}>
            <NetworkLayers state={state} result={result} routeStatus={routeStatus} showHomes />
          </BaseMap>
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl bg-surface/95 px-3 py-2 text-xs font-semibold text-ink-2 shadow-card">
            Live data from the demo · {state.buses.length} routes into {state.settings.name}
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="mt-16">
        <h2 id="how-heading" className="text-xl font-extrabold text-ink">
          How it works
        </h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <Route />,
              title: '1 · The school maps its fleet',
              body: 'Add each bus with its seat count and click stops on the map. Routes snap to real roads and end at school.',
            },
            {
              icon: <MapPinned />,
              title: '2 · Parents drop a home pin',
              body: 'Search an address, use GPS, or tap the map. A live preview shows which bus will serve that spot before anything is sent.',
            },
            {
              icon: <Clock4 />,
              title: '3 · Seats assign themselves',
              body: `Closest route within ${state.settings.maxWalkMeters} m walking distance with a free seat wins. Earlier requests keep their seats, and everyone else waits in a queue.`,
            },
          ].map((step) => (
            <li key={step.title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-ink [&>svg]:size-5" aria-hidden="true">
                {step.icon}
              </span>
              <h3 className="mt-3 font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 flex items-start gap-2.5 rounded-2xl border border-dashed border-line-strong bg-primary-soft/60 p-4 text-sm text-ink-2">
          <SplitSquareHorizontal className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="text-ink">Try both sides at once:</strong> open the parent app and the school admin in two browser tabs. A request from
            the parent shows up in the school view straight away, and fleet changes reach the parent right after.
          </span>
        </p>
      </section>
    </div>
  )
}

function RoleCard({ to, icon, title, body, cta }: { to: string; icon: ReactNode; title: string; body: string; cta: string }) {
  return (
    <a
      href={href(to)}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-primary text-on-primary [&>svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <span className="mt-3 text-base font-bold text-ink">{title}</span>
      <span className="mt-1 flex-1 text-sm text-ink-2">{body}</span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
        {cta}
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </a>
  )
}

