import { ArrowRight, Building2, CalendarClock, Hand, IndianRupee, MapPinned, Route, Sparkles, SplitSquareHorizontal, UsersRound, Van } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { BaseMap } from '../components/map/BaseMap'
import { NetworkLayers } from '../components/map/NetworkLayers'
import { compareWithManual } from '../lib/engine/baseline'
import { inr, inrSigned, kmValue } from '../lib/format'
import { href } from '../lib/router'
import { useStore } from '../store/context'

const AUTOMATIC = [
  { icon: <MapPinned />, title: 'Boarding points', body: 'Placed on real roads so every child is within walking distance, using the fewest stops.' },
  { icon: <Van />, title: 'Bus or van', body: 'Wide roads get buses. Lanes too narrow for a bus get a van, or a short walk to the main road.' },
  { icon: <Route />, title: 'Allocation and routes', body: 'Which child rides what, and the driving order, chosen for the lowest running cost within your ride limit.' },
  { icon: <CalendarClock />, title: 'Pickup times', body: 'Worked back from the school bell for every stop, morning and evening.' },
  { icon: <IndianRupee />, title: 'Fees and profit', body: 'Fees by distance, costs per vehicle, and improvements priced before you commit to them.' },
  { icon: <Hand />, title: 'Your call, always', body: 'Pin a child, move a stop, lock a route. The system plans around your change and keeps it.' },
]

export function Landing() {
  const { state, view, fleet, routeStatus } = useStore()
  const savings = useMemo(() => compareWithManual(state, fleet), [state, fleet])

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 lg:pt-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            New in the school app · Feature preview
          </span>
          <h1 className="mt-4 text-[34px] font-extrabold leading-[1.1] tracking-tight text-ink text-balance sm:text-5xl">
            School transport that <span className="relative isolate whitespace-nowrap">plans itself<span className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded bg-accent/70" aria-hidden="true" /></span>, and pays for itself.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-2">
            Tell it where each vehicle starts and how many seats it has. Parents pin their homes. Boarding points, bus or van, routes, times and fees are all worked out, and you can overrule any of it.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <RoleCard to="/parent" icon={<UsersRound />} title="I'm a parent" body="Pin your home and see the boarding point, vehicle, pickup time and fee straight away." cta="Open parent app" />
            <RoleCard to="/school" icon={<Building2 />} title="I'm the school" body="See the live plan, profit per vehicle, and what to change next." cta="Open school admin" />
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              ['Children seated', `${fleet.seated}`],
              ['Boarding points', `${fleet.stops}`],
              ['Profit a month', inr(fleet.profit)],
              ['Less driving', `${kmValue(Math.max(0, savings.kmDaily))}/day`],
            ].map(([label, value]) => (
              <div key={label} className="border-l-2 border-line-strong pl-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</dt>
                <dd className="text-2xl font-extrabold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative h-[340px] overflow-hidden rounded-3xl border border-line shadow-float sm:h-[480px] animate-fade-in">
          <BaseMap center={state.settings.location} zoom={12} label={`Map of all routes in Thiruvananthapuram for ${state.settings.name}`} interactive={false}>
            <NetworkLayers state={state} view={view} routeStatus={routeStatus} showHomes />
          </BaseMap>
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl bg-surface/95 px-3 py-2 text-xs font-semibold text-ink-2 shadow-card">
            {state.settings.name}, {state.settings.address} · live demo data
          </div>
        </div>
      </section>

      <section aria-labelledby="auto-heading" className="mt-16">
        <h2 id="auto-heading" className="text-xl font-extrabold text-ink">
          What runs on autopilot
        </h2>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
          Against a plan made by hand with the same fleet and children, this one changes monthly profit by {inrSigned(savings.profit)}. That comparison is a model, and the costs are sample figures you can replace.
        </p>
        <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AUTOMATIC.map((item) => (
            <li key={item.title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-ink [&>svg]:size-5" aria-hidden="true">
                {item.icon}
              </span>
              <h3 className="mt-3 font-bold text-ink">{item.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{item.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-6 flex items-start gap-2.5 rounded-2xl border border-dashed border-line-strong bg-primary-soft/60 p-4 text-sm text-ink-2">
          <SplitSquareHorizontal className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="text-ink">Try both sides at once:</strong> open the parent app and school admin in two browser tabs. A request from a parent lands in the school's plan straight away, and fleet changes reach the parent right after.
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
