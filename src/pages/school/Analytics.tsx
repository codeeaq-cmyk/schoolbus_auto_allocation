import { Fuel, Gauge, IndianRupee, Leaf, Route, Timer } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { ChartCard, DivergingBars, Histogram, Legend, SimpleTable, StackedBars } from '../../components/charts/charts'
import { Card, CardHeader } from '../../components/ui/Card'
import { PageHeader, StatTile } from '../../components/ui/misc'
import { AnimatedNumber } from '../../components/ui/motion'
import { compareWithManual } from '../../lib/engine/baseline'
import { breakEvenDiesel, fleetEconomics, revenueBySlab } from '../../lib/engine/economics'
import { inr, inrSigned, kmValue, percent } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { useStore } from '../../store/context'
import { RecommendationList } from './RecommendationList'

// Cost categories in the validated categorical order (adjacent pairs are colorblind-safe).
const COST_COLORS = { fuel: '#2a78d6', upkeep: '#eb6834', crew: '#1baf7a', fixed: '#eda100' }

export function Analytics() {
  const { state, view, fleet } = useStore()
  const { settings } = state
  const savings = useMemo(() => compareWithManual(state, fleet), [state, fleet])
  const slabs = useMemo(() => revenueBySlab(state, view), [state, view])

  const byProfit = [...fleet.vehicles].sort((a, b) => b.profit - a.profit)

  const rideBins = useMemo(() => {
    const width = 10
    const rides = [...view.students.values()].flatMap((s) => (s.status === 'seated' ? [s.rideMin] : []))
    const top = Math.max(settings.maxRideMin, ...rides, width)
    const bins: { from: number; to: number; count: number }[] = []
    for (let from = 0; from < top; from += width) bins.push({ from, to: from + width, count: 0 })
    for (const ride of rides) bins[Math.min(bins.length - 1, Math.floor(ride / width))].count++
    return bins
  }, [view, settings.maxRideMin])

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Analytics"
        description={`Money, fuel and time for the current plan, per month over ${settings.schoolDays} school days. Costs and fees are sample figures: enter your own in Settings and Fleet.`}
      />

      <section aria-label="Monthly result" className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <div className="gradient-night flex flex-col justify-center rounded-3xl p-6 text-white">
          <p className="text-sm font-medium text-night-ink">Monthly profit</p>
          <p className="mt-1 text-5xl font-extrabold tracking-tight">
            <AnimatedNumber value={fleet.profit} from={0} format={inr} />
          </p>
          <p className="mt-2 text-sm text-night-ink">
            {inr(fleet.revenue)} in fees − {inr(fleet.cost)} in costs. {percent(fleet.margin)} margin.
          </p>
          {fleet.unrealisedRevenue > 0 && (
            <p className="mt-1 text-sm text-night-ink">
              {fleet.waitlisted} waiting {fleet.waitlisted === 1 ? 'child' : 'children'} would add {inr(fleet.unrealisedRevenue)} in fees.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile icon={<IndianRupee />} label="Cost per child" value={inr(fleet.costPerRider)} detail="A month, all costs in" />
          <StatTile icon={<Gauge />} label="Seats filled" value={percent(fleet.seats ? fleet.seated / fleet.seats : 0)} detail={`${fleet.seated} of ${fleet.seats} seats`} />
          <StatTile icon={<Route />} label="Fleet distance" value={`${Math.round(fleet.kmDaily)} km`} detail={`A day · ${Math.round(fleet.kmMonthly).toLocaleString('en-IN')} km a month`} />
          <StatTile icon={<Fuel />} label="Diesel" value={`${Math.round(fleet.litres)} L`} detail={`${inr(fleet.fuel)} a month at ₹${settings.dieselPrice}/L`} />
          <StatTile icon={<Timer />} label="Average ride" value={`${Math.round(fleet.rideAvg)} min`} detail={`Longest ${Math.round(fleet.rideMax)} min · average walk ${formatDistance(fleet.walkAvg)}`} />
          <StatTile icon={<Leaf />} label="Carbon dioxide" value={`${(fleet.co2Kg / 1000).toFixed(1)} t`} detail="A month, from diesel burned" />
        </div>
      </section>

      {/* Each column sizes to its own content, so the long list leaves no gap beside the table. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <SavingsCard savings={savings} />
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">Fee income by distance</h2>
            <p className="mt-0.5 text-sm text-ink-3">Fees follow the road distance from the boarding point to school, not the route a vehicle happens to take.</p>
            <div className="relative mt-4 overflow-x-auto">
              <SimpleTable
                head={['Distance', 'Fee a month', 'Children', 'Income']}
                align={['left', 'right', 'right', 'right']}
                rows={slabs.map(({ slab, riders, revenue }, i) => [slab.upToKm === null ? `Over ${settings.feeSlabs[i - 1]?.upToKm ?? 0} km` : `Up to ${slab.upToKm} km`, inr(slab.monthly), riders, inr(revenue)])}
              />
            </div>
          </Card>
        </div>
        <Card>
          <CardHeader title="Suggested improvements" description="Priced by planning each one with your real fleet and children." />
          <div className="p-5">
            <RecommendationList limit={4} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Profit by vehicle"
          description="Fees collected from its riders minus everything it costs, each month."
          chart={<DivergingBars data={byProfit.map((v) => ({ label: v.vehicle.label, value: v.profit }))} />}
          table={
            <SimpleTable
              head={['Vehicle', 'Riders', 'Fees', 'Costs', 'Profit', 'Break-even riders']}
              align={['left', 'right', 'right', 'right', 'right', 'right']}
              rows={byProfit.map((v) => [v.vehicle.label, `${v.riders}/${v.vehicle.seats}`, inr(v.revenue), inr(v.cost), inrSigned(v.profit), v.breakEvenRiders ?? '—'])}
            />
          }
        />

        <ChartCard
          title="Where the money goes"
          description="Monthly running cost of each vehicle, by type of cost."
          legend={
            <Legend
              items={[
                { label: 'Diesel', color: COST_COLORS.fuel },
                { label: 'Upkeep', color: COST_COLORS.upkeep },
                { label: 'Crew', color: COST_COLORS.crew },
                { label: 'Fixed', color: COST_COLORS.fixed },
              ]}
            />
          }
          chart={
            <StackedBars
              rows={fleet.vehicles.map((v) => ({
                label: v.vehicle.label,
                segments: [
                  { label: 'Diesel', value: v.fuel, color: COST_COLORS.fuel },
                  { label: 'Upkeep', value: v.maintenance, color: COST_COLORS.upkeep },
                  { label: 'Crew', value: v.crew, color: COST_COLORS.crew },
                  { label: 'Fixed', value: v.standing, color: COST_COLORS.fixed },
                ],
              }))}
            />
          }
          table={
            <SimpleTable
              head={['Vehicle', 'Diesel', 'Upkeep', 'Crew', 'Fixed', 'Total']}
              align={['left', 'right', 'right', 'right', 'right', 'right']}
              rows={[
                ...fleet.vehicles.map((v) => [v.vehicle.label, inr(v.fuel), inr(v.maintenance), inr(v.crew), inr(v.standing), inr(v.cost)]),
                ['Fleet', inr(fleet.fuel), inr(fleet.maintenance), inr(fleet.crew), inr(fleet.standing), inr(fleet.cost)],
              ]}
            />
          }
        />

        <ChartCard
          className="lg:col-span-2"
          title="How long children ride"
          description="Children by minutes on board in the morning."
          chart={<Histogram bins={rideBins} unit="min" limit={settings.maxRideMin} limitLabel={`${settings.maxRideMin} min limit`} />}
          table={<SimpleTable head={['Minutes on board', 'Children']} align={['left', 'right']} rows={rideBins.map((b) => [`${b.from}–${b.to}`, b.count])} />}
        />

      </div>

      <WhatIf />
    </div>
  )
}

function SavingsCard({ savings }: { savings: ReturnType<typeof compareWithManual> }) {
  const { manual, automatic } = savings
  const rows: [string, string, string, string][] = [
    ['Profit a month', inr(manual.profit), inr(automatic.profit), inrSigned(savings.profit)],
    ['Costs a month', inr(manual.cost), inr(automatic.cost), inrSigned(-savings.cost)],
    ['Boarding points', String(manual.stops), String(automatic.stops), `${automatic.stops - manual.stops >= 0 ? '+' : '−'}${Math.abs(automatic.stops - manual.stops)}`],
    ['Distance a day', kmValue(manual.kmDaily), kmValue(automatic.kmDaily), `${savings.kmDaily >= 0 ? '−' : '+'}${kmValue(Math.abs(savings.kmDaily))}`],
    ['Diesel a month', `${Math.round(manual.litresMonthly)} L`, `${Math.round(automatic.litresMonthly)} L`, `${savings.litresMonthly >= 0 ? '−' : '+'}${Math.abs(Math.round(savings.litresMonthly))} L`],
    ['Average ride', `${Math.round(manual.rideAvg)} min`, `${Math.round(automatic.rideAvg)} min`, `${automatic.rideAvg <= manual.rideAvg ? '−' : '+'}${Math.abs(Math.round(manual.rideAvg - automatic.rideAvg))} min`],
    ['Longest ride', `${Math.round(manual.rideMax)} min`, `${Math.round(automatic.rideMax)} min`, `${automatic.rideMax <= manual.rideMax ? '−' : '+'}${Math.abs(Math.round(manual.rideMax - automatic.rideMax))} min`],
    ['Average walk', formatDistance(manual.walkAvg), formatDistance(automatic.walkAvg), `${automatic.walkAvg <= manual.walkAvg ? '−' : '+'}${formatDistance(Math.abs(manual.walkAvg - automatic.walkAvg))}`],
    ['Children seated', String(manual.seated), String(automatic.seated), `${automatic.seated >= manual.seated ? '+' : '−'}${Math.abs(automatic.seated - manual.seated)}`],
  ]
  return (
    <Card>
      <CardHeader title="Why automatic" description="The same children and fleet, planned by hand versus by the system." />
      <div className="relative mt-3 overflow-x-auto px-5">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-bold uppercase tracking-wide text-ink-3">
              <th scope="col" className="py-2 pr-3 text-left">Measure</th>
              <th scope="col" className="px-3 py-2 text-right">By hand</th>
              <th scope="col" className="px-3 py-2 text-right">Automatic</th>
              <th scope="col" className="py-2 pl-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([label, a, b, change]) => (
              <tr key={label}>
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-ink">{label}</th>
                <td className="px-3 py-2 text-right text-ink-3 tabular">{a}</td>
                <td className="px-3 py-2 text-right font-semibold text-ink tabular">{b}</td>
                <td className="py-2 pl-3 text-right font-bold text-ink tabular">{change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="p-5 pt-3 text-xs text-ink-3">
        "By hand" is a modelled plan, not a real one: stops at the nearest main road, merged within walking distance, the map split by direction from school, vehicles filled area by area and driven from the farthest child inward. It is estimated from road distances; the automatic column is the live plan on its actual routes.
      </p>
    </Card>
  )
}

function Slider({ id, label, value, min, max, step, format, onChange, hint }: { id: string; label: string; value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void; hint?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <output htmlFor={id} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-bold text-primary tabular">
          {format(value)}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full cursor-pointer accent-primary" />
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

/** Instant what-if on the current plan: nothing here changes the real data. */
function WhatIf() {
  const { state, view, fleet } = useStore()
  const { settings } = state
  const [diesel, setDiesel] = useState(settings.dieselPrice)
  const [feeChange, setFeeChange] = useState(0)
  const [crewChange, setCrewChange] = useState(0)
  const scenario = useMemo(() => fleetEconomics(state, view, { dieselPrice: diesel, feeChange: feeChange / 100, crewChange: crewChange / 100 }), [state, view, diesel, feeChange, crewChange])
  const breakEven = breakEvenDiesel(fleet)
  const delta = scenario.profit - fleet.profit
  const changed = diesel !== settings.dieselPrice || feeChange !== 0 || crewChange !== 0

  return (
    <Card className="mt-6">
      <CardHeader title="What if" description="Try a change on today's plan. Nothing is saved." />
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <Slider
            id="whatif-diesel"
            label="Diesel price"
            value={diesel}
            min={70}
            max={140}
            step={1}
            format={(n) => `₹${n}/L`}
            onChange={setDiesel}
            hint={breakEven !== null ? `At today's fees the fleet stops making money above ₹${Math.round(breakEven)}/L.` : undefined}
          />
          <Slider id="whatif-fee" label="Transport fees" value={feeChange} min={-20} max={30} step={1} format={(n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`} onChange={setFeeChange} />
          <Slider id="whatif-crew" label="Crew pay" value={crewChange} min={-10} max={40} step={1} format={(n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`} onChange={setCrewChange} />
        </div>
        <div className="gradient-night flex flex-col justify-center rounded-3xl p-5 text-white" aria-live="polite">
          <p className="text-sm font-medium text-night-ink">Monthly profit in this scenario</p>
          <p className="mt-1 text-3xl font-extrabold">
            <AnimatedNumber value={scenario.profit} format={inr} />
          </p>
          <p className="mt-1 text-sm font-semibold text-accent">{changed ? `${inrSigned(delta)} against today` : 'Same as today'}</p>
          <p className="mt-1 text-xs text-night-ink">{percent(scenario.margin)} margin · assumes every child keeps riding.</p>
        </div>
      </div>
    </Card>
  )
}
