import type { Marker as LeafletMarker } from 'leaflet'
import { ArrowDownRight, ArrowUpRight, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Marker } from 'react-leaflet'
import { BaseMap } from '../../components/map/BaseMap'
import { schoolIcon } from '../../components/map/icons'
import { RouteLine } from '../../components/map/layers'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Segmented } from '../../components/ui/controls'
import { Field, Input } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { cn } from '../../lib/cn'
import { measurePlan, type PlanMetrics } from '../../lib/engine/baseline'
import { optimise } from '../../lib/engine/plan'
import { inrSigned, kmValue } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { EASE_OUT, spring } from '../../lib/motion'
import type { FeeSlab, Priority, Settings } from '../../lib/types'
import { updateSettings } from '../../store/actions'
import { useStore } from '../../store/context'

type Errors = Partial<Record<keyof Settings, string>>
type Section = 'automation' | 'rules' | 'money' | 'school'

const PRIORITIES: { id: Priority; label: string; body: string }[] = [
  { id: 'profit', label: 'Lowest cost', body: 'Fewest stops and shortest driving, even if some children walk or ride longer.' },
  { id: 'balanced', label: 'Balanced', body: 'Keeps costs down without long walks or rides.' },
  { id: 'comfort', label: 'Shortest rides', body: 'Stops closer to home and less time on board, at a higher running cost.' },
]

const SECTION_OF: Partial<Record<keyof Settings, Section>> = {
  name: 'school',
  address: 'school',
  dieselPrice: 'money',
  schoolDays: 'money',
}

function validate(s: Settings): Errors {
  const errors: Errors = {}
  if (!s.name.trim()) errors.name = 'Enter the school name.'
  if (!/^\d{2}:\d{2}$/.test(s.startTime)) errors.startTime = 'Enter a start time.'
  if (!/^\d{2}:\d{2}$/.test(s.endTime)) errors.endTime = 'Enter an end time.'
  if (!(s.arrivalBufferMin >= 0 && s.arrivalBufferMin <= 60)) errors.arrivalBufferMin = 'Use 0 to 60 minutes.'
  if (!(s.speedBusKmh >= 5 && s.speedBusKmh <= 60)) errors.speedBusKmh = 'Use 5 to 60 km/h.'
  if (!(s.speedVanKmh >= 5 && s.speedVanKmh <= 60)) errors.speedVanKmh = 'Use 5 to 60 km/h.'
  if (!(s.maxRideMin >= 15 && s.maxRideMin <= 180)) errors.maxRideMin = 'Use 15 to 180 minutes.'
  if (!(s.maxStopRiders >= 1 && s.maxStopRiders <= 40)) errors.maxStopRiders = 'Use 1 to 40 children.'
  if (!(s.maxDetourMin >= 1 && s.maxDetourMin <= 60)) errors.maxDetourMin = 'Use 1 to 60 minutes.'
  if (!(s.dwellSec >= 0 && s.dwellSec <= 300)) errors.dwellSec = 'Use 0 to 300 seconds.'
  if (!(s.dieselPrice > 0)) errors.dieselPrice = 'Enter a price.'
  if (!(s.schoolDays >= 1 && s.schoolDays <= 31)) errors.schoolDays = 'Use 1 to 31 days.'
  return errors
}

export function SchoolSettingsPage() {
  const { state, view, update } = useStore()
  const toast = useToast()
  const [section, setSection] = useState<Section>('automation')
  const [draft, setDraft] = useState(state.settings)
  const [errors, setErrors] = useState<Errors>({})
  const [preview, setPreview] = useState<{ draft: Settings; metrics: PlanMetrics } | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings)
  const metricsNow = measurePlan(state)

  // Plan the draft in the background so the school sees the effect before saving.
  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      const next = { ...state, settings: draft }
      const rebuilds = draft.maxWalkMeters !== state.settings.maxWalkMeters || draft.priority !== state.settings.priority || draft.maxStopRiders !== state.settings.maxStopRiders
      const plan = optimise(next, { recluster: rebuilds, stability: !rebuilds, iterations: 350 })
      setPreview({ draft, metrics: measurePlan({ ...next, plan }) })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, state])

  const impact = dirty && preview?.draft === draft ? preview.metrics : null

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const setSlab = (index: number, patch: Partial<FeeSlab>) => set('feeSlabs', draft.feeSlabs.map((slab, i) => (i === index ? { ...slab, ...patch } : slab)))
  const addSlab = () => {
    const finite = draft.feeSlabs.filter((s) => s.upToKm !== null)
    const lastKm = finite[finite.length - 1]?.upToKm ?? 0
    const open = draft.feeSlabs[draft.feeSlabs.length - 1]
    set('feeSlabs', [...finite, { upToKm: lastKm + 5, monthly: open.monthly }, { ...open, monthly: open.monthly + 500 }])
  }
  const removeSlab = (index: number) => set('feeSlabs', draft.feeSlabs.filter((_, i) => i !== index))

  const save = (e: FormEvent) => {
    e.preventDefault()
    const found = validate(draft)
    setErrors(found)
    const first = Object.keys(found)[0] as keyof Settings | undefined
    if (first) {
      setSection(SECTION_OF[first] ?? 'rules')
      window.setTimeout(() => document.getElementById(`setting-${first}`)?.focus(), 60)
      return
    }
    update((s) => updateSettings(s, draft))
    toast({ tone: 'success', title: 'Settings saved', description: draft.autopilot ? 'The plan was updated to match.' : 'Autopilot is off: re-optimise when you are ready.' })
  }

  return (
    <form onSubmit={save} noValidate className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 pb-32 sm:px-6 lg:py-8">
      <PageHeader title="Settings" description="The rules the system plans by. Everything else is worked out for you." />

      <Segmented
        className="scrollbar-none mt-6 overflow-x-auto"
        label="Settings section"
        value={section}
        onChange={setSection}
        options={[
          { id: 'automation', label: 'Automation' },
          { id: 'rules', label: 'Rules' },
          { id: 'money', label: 'Money' },
          { id: 'school', label: 'School' },
        ]}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={section} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } }} exit={{ opacity: 0, transition: { duration: 0.08 } }} className="mt-5 flex flex-col gap-5">
          {section === 'automation' && (
            <Card className="pb-5">
              <CardHeader title="How much should it do by itself?" />
              <div className="mt-4 flex flex-col gap-5 px-5">
                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl bg-muted p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink">Autopilot</span>
                    <span className="block text-sm leading-relaxed text-ink-3">Re-plan by itself when the fleet or rules change. New requests are always placed automatically.</span>
                  </span>
                  <input type="checkbox" className="mt-0.5 size-5 cursor-pointer accent-primary" checked={draft.autopilot} onChange={(e) => set('autopilot', e.target.checked)} />
                </label>
                <fieldset>
                  <legend className="text-sm font-semibold text-ink">Plan for</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {PRIORITIES.map((option) => (
                      <label key={option.id} className={cn('flex cursor-pointer flex-col gap-1 rounded-2xl p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', draft.priority === option.id ? 'bg-primary/15' : 'bg-muted hover:bg-tonal')}>
                        <span className="flex items-center gap-2">
                          <input type="radio" name="priority" className="size-4 accent-primary" checked={draft.priority === option.id} onChange={() => set('priority', option.id)} />
                          <span className="text-sm font-bold text-ink">{option.label}</span>
                        </span>
                        <span className="text-xs leading-relaxed text-ink-3">{option.body}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </Card>
          )}

          {section === 'rules' && (
            <>
              <Card className="pb-5">
                <CardHeader title="For children" description="The planner never breaks these without you saying so." />
                <div className="mt-4 flex flex-col gap-4 px-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="setting-maxWalkMeters" className="text-sm font-semibold text-ink">
                        Longest walk to a boarding point
                      </label>
                      <output htmlFor="setting-maxWalkMeters" className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-bold text-primary tabular">
                        {formatDistance(draft.maxWalkMeters)}
                      </output>
                    </div>
                    <input id="setting-maxWalkMeters" type="range" min={100} max={1000} step={50} value={draft.maxWalkMeters} onChange={(e) => set('maxWalkMeters', Number(e.target.value))} className="mt-2 w-full cursor-pointer accent-primary" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field id="setting-maxRideMin" label="Longest ride (min)" error={errors.maxRideMin}>
                      {(p) => <Input {...p} type="number" min={15} max={180} value={draft.maxRideMin} onChange={(e) => set('maxRideMin', Number(e.target.value))} />}
                    </Field>
                    <Field id="setting-maxDetourMin" label="Longest detour (min)" error={errors.maxDetourMin} hint="Extra driving for one new child">
                      {(p) => <Input {...p} type="number" min={1} max={60} value={draft.maxDetourMin} onChange={(e) => set('maxDetourMin', Number(e.target.value))} />}
                    </Field>
                    <Field id="setting-maxStopRiders" label="Most at one stop" error={errors.maxStopRiders}>
                      {(p) => <Input {...p} type="number" min={1} max={40} value={draft.maxStopRiders} onChange={(e) => set('maxStopRiders', Number(e.target.value))} />}
                    </Field>
                  </div>
                </div>
              </Card>
              <Card className="pb-5">
                <CardHeader title="Timing" description="Pickup times are worked back from when vehicles reach school." />
                <div className="mt-4 grid gap-4 px-5 sm:grid-cols-2">
                  <Field id="setting-startTime" label="School starts" error={errors.startTime}>
                    {(p) => <Input {...p} type="time" value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />}
                  </Field>
                  <Field id="setting-endTime" label="School ends" error={errors.endTime}>
                    {(p) => <Input {...p} type="time" value={draft.endTime} onChange={(e) => set('endTime', e.target.value)} />}
                  </Field>
                  <Field id="setting-arrivalBufferMin" label="Arrive early by (minutes)" error={errors.arrivalBufferMin}>
                    {(p) => <Input {...p} type="number" min={0} max={60} value={draft.arrivalBufferMin} onChange={(e) => set('arrivalBufferMin', Number(e.target.value))} />}
                  </Field>
                  <Field id="setting-dwellSec" label="Time at each stop (seconds)" error={errors.dwellSec}>
                    {(p) => <Input {...p} type="number" min={0} max={300} step={5} value={draft.dwellSec} onChange={(e) => set('dwellSec', Number(e.target.value))} />}
                  </Field>
                  <Field id="setting-speedBusKmh" label="Average bus speed (km/h)" error={errors.speedBusKmh}>
                    {(p) => <Input {...p} type="number" min={5} max={60} value={draft.speedBusKmh} onChange={(e) => set('speedBusKmh', Number(e.target.value))} />}
                  </Field>
                  <Field id="setting-speedVanKmh" label="Average van speed (km/h)" error={errors.speedVanKmh}>
                    {(p) => <Input {...p} type="number" min={5} max={60} value={draft.speedVanKmh} onChange={(e) => set('speedVanKmh', Number(e.target.value))} />}
                  </Field>
                </div>
              </Card>
            </>
          )}

          {section === 'money' && (
            <Card className="pb-5">
              <CardHeader title="Costs and fees" description="Sample figures. Replace them with your own; analytics update straight away." />
              <div className="mt-4 grid gap-4 px-5 sm:grid-cols-2">
                <Field id="setting-dieselPrice" label="Diesel (₹ per litre)" error={errors.dieselPrice}>
                  {(p) => <Input {...p} type="number" min={1} step={0.5} value={draft.dieselPrice} onChange={(e) => set('dieselPrice', Number(e.target.value))} />}
                </Field>
                <Field id="setting-schoolDays" label="School days a month" error={errors.schoolDays}>
                  {(p) => <Input {...p} type="number" min={1} max={31} value={draft.schoolDays} onChange={(e) => set('schoolDays', Number(e.target.value))} />}
                </Field>
              </div>
              <fieldset className="mt-5 px-5">
                <legend className="text-sm font-semibold text-ink">Monthly fee by distance from school</legend>
                <ul className="mt-2 flex flex-col gap-2">
                  {draft.feeSlabs.map((slab, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-sm text-ink-3">{slab.upToKm === null ? 'Beyond' : 'Up to'}</span>
                      {slab.upToKm === null ? (
                        <span className="flex h-11 flex-1 items-center rounded-xl bg-muted px-3.5 text-sm text-ink-3">{draft.feeSlabs[i - 1]?.upToKm ?? 0} km</span>
                      ) : (
                        <Input aria-label={`Slab ${i + 1} distance in km`} type="number" min={0} value={slab.upToKm} onChange={(e) => setSlab(i, { upToKm: Number(e.target.value) })} className="flex-1" />
                      )}
                      <Input aria-label={`Slab ${i + 1} monthly fee in rupees`} type="number" min={0} step={50} value={slab.monthly} onChange={(e) => setSlab(i, { monthly: Number(e.target.value) })} className="flex-1" />
                      {slab.upToKm !== null && draft.feeSlabs.length > 2 ? (
                        <Button variant="ghost" size="icon" onClick={() => removeSlab(i)} aria-label={`Remove slab ${i + 1}`}>
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      ) : (
                        <span className="w-10 shrink-0" aria-hidden="true" />
                      )}
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" size="sm" className="mt-3" onClick={addSlab}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add a distance slab
                </Button>
              </fieldset>
            </Card>
          )}

          {section === 'school' && (
            <Card className="overflow-hidden pb-5">
              <CardHeader title="Your school" description="Drag the pin to move it. Every route is re-planned to reach the new spot." />
              <div className="mt-4 h-[320px]">
                <BaseMap center={draft.location} zoom={13} label="School location. Drag the school marker to move it.">
                  {[...view.routes.values()].map((r) => (
                    <RouteLine key={r.vehicle.id} route={r} emphasis="dim" />
                  ))}
                  <Marker
                    position={draft.location}
                    icon={schoolIcon()}
                    draggable
                    eventHandlers={{
                      dragend: (e) => {
                        const ll = (e.target as LeafletMarker).getLatLng()
                        set('location', { lat: ll.lat, lng: ll.lng })
                      },
                    }}
                    title="School. Drag to move."
                  />
                </BaseMap>
              </div>
              <div className="mt-4 grid gap-4 px-5 sm:grid-cols-2">
                <Field id="setting-name" label="School name" required error={errors.name}>
                  {(p) => <Input {...p} value={draft.name} onChange={(e) => set('name', e.target.value)} />}
                </Field>
                <Field id="setting-address" label="Address">
                  {(p) => <Input {...p} value={draft.address} onChange={(e) => set('address', e.target.value)} />}
                </Field>
              </div>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Appears only when there is something to save, with the effect right beside the button. */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
            transition={spring}
            className="on-dark fixed inset-x-3 bg-night text-white bottom-[76px] z-20 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl p-3.5 sm:inset-x-6 lg:bottom-5 lg:left-[calc(15rem+1.5rem)]"
            aria-live="polite"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">If you save these changes</p>
              {!impact ? (
                <p className="flex items-center gap-1.5 text-xs text-night-ink">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  Planning with your changes…
                </p>
              ) : (
                <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  <Effect label="Profit" delta={impact.profit - metricsNow.profit} format={inrSigned} higherIsBetter />
                  <Effect label="Distance" delta={impact.kmDaily - metricsNow.kmDaily} format={(d) => `${d > 0 ? '+' : '−'}${kmValue(Math.abs(d))}`} />
                  <Effect label="Seated" delta={impact.seated - metricsNow.seated} format={(d) => `${d > 0 ? '+' : '−'}${Math.abs(d)}`} higherIsBetter />
                </dl>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="night" onClick={() => setDraft(state.settings)}>
                Discard
              </Button>
              <Button type="submit">
                <Save className="size-4" aria-hidden="true" />
                Save settings
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}

function Effect({ label, delta, format, higherIsBetter }: { label: string; delta: number; format: (d: number) => string; higherIsBetter?: boolean }) {
  const meaningful = Math.abs(delta) >= 0.5
  const good = higherIsBetter ? delta > 0 : delta < 0
  return (
    <div className="flex items-center gap-1">
      <dt className="font-medium text-night-ink">{label}</dt>
      {meaningful ? (
        <dd className={cn('inline-flex items-center font-bold tabular', good ? 'text-success-bright' : 'text-danger-bright')}>
          {delta > 0 ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : <ArrowDownRight className="size-3.5" aria-hidden="true" />}
          {format(delta)}
        </dd>
      ) : (
        <dd className="font-semibold text-white">no change</dd>
      )}
    </div>
  )
}
