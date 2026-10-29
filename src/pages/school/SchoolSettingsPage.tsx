import type { Marker as LeafletMarker } from 'leaflet'
import { ArrowDownRight, ArrowUpRight, Save } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Marker } from 'react-leaflet'
import { BaseMap } from '../../components/map/BaseMap'
import { schoolIcon } from '../../components/map/icons'
import { CoverageLayer, RouteLine } from '../../components/map/layers'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, Input } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { computeAssignments } from '../../lib/assign'
import { formatDistance } from '../../lib/geo'
import type { SchoolSettings } from '../../lib/types'
import { useStore } from '../../store/context'

type Errors = Partial<Record<keyof SchoolSettings, string>>

function validate(s: SchoolSettings): Errors {
  const errors: Errors = {}
  if (!s.name.trim()) errors.name = 'Enter the school name.'
  if (!/^\d{2}:\d{2}$/.test(s.startTime)) errors.startTime = 'Enter a start time.'
  if (!(s.arrivalBufferMin >= 0 && s.arrivalBufferMin <= 60)) errors.arrivalBufferMin = 'Use 0 to 60 minutes.'
  if (!(s.avgSpeedKmh >= 5 && s.avgSpeedKmh <= 60)) errors.avgSpeedKmh = 'Use 5 to 60 km/h.'
  return errors
}

export function SchoolSettingsPage() {
  const { state, result, dispatch } = useStore()
  const toast = useToast()
  const [draft, setDraft] = useState(state.settings)
  const [errors, setErrors] = useState<Errors>({})
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings)

  // Preview what saving would do to seat assignments.
  const preview = useMemo(() => (dirty ? computeAssignments({ ...state, settings: draft }) : result), [dirty, state, draft, result])
  const seated = (r: typeof result) => [...r.byStudent.values()].filter((a) => a.status === 'assigned').length
  const now = seated(result)
  const after = seated(preview)

  const set = <K extends keyof SchoolSettings>(key: K, value: SchoolSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const found = validate(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.getElementById(`setting-${Object.keys(found)[0]}`)?.focus()
      return
    }
    dispatch({ type: 'settings/update', patch: draft })
    toast({ tone: 'success', title: 'Settings saved', description: after !== now ? `${Math.abs(after - now)} students ${after > now ? 'gained' : 'lost'} a seat.` : 'Assignments are unchanged.' })
  }

  return (
    <form onSubmit={save} noValidate className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
      <PageHeader title="Transport settings" description="These rules drive automatic seat assignment and the pickup times parents see." />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="pb-5">
            <CardHeader title="School" />
            <div className="mt-4 grid gap-4 px-5">
              <Field id="setting-name" label="School name" required error={errors.name}>
                {(p) => <Input {...p} value={draft.name} onChange={(e) => set('name', e.target.value)} />}
              </Field>
              <Field id="setting-address" label="Address">
                {(p) => <Input {...p} value={draft.address} onChange={(e) => set('address', e.target.value)} />}
              </Field>
            </div>
          </Card>

          <Card className="pb-5">
            <CardHeader title="Timing" description="Pickup times are worked back from when buses reach school." />
            <div className="mt-4 grid gap-4 px-5 sm:grid-cols-3">
              <Field id="setting-startTime" label="School starts" error={errors.startTime}>
                {(p) => <Input {...p} type="time" value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />}
              </Field>
              <Field id="setting-arrivalBufferMin" label="Arrive early by (min)" error={errors.arrivalBufferMin}>
                {(p) => <Input {...p} type="number" min={0} max={60} value={draft.arrivalBufferMin} onChange={(e) => set('arrivalBufferMin', Number(e.target.value))} />}
              </Field>
              <Field id="setting-avgSpeedKmh" label="Avg. bus speed (km/h)" error={errors.avgSpeedKmh}>
                {(p) => <Input {...p} type="number" min={5} max={60} value={draft.avgSpeedKmh} onChange={(e) => set('avgSpeedKmh', Number(e.target.value))} />}
              </Field>
            </div>
          </Card>

          <Card className="pb-5">
            <CardHeader title="Walking distance" description="The furthest a child is expected to walk from home to the bus route." />
            <div className="mt-4 px-5">
              <div className="flex items-center justify-between">
                <label htmlFor="setting-maxWalkMeters" className="text-sm font-semibold text-ink">
                  Maximum walk
                </label>
                <output htmlFor="setting-maxWalkMeters" className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-bold text-primary tabular">
                  {formatDistance(draft.maxWalkMeters)}
                </output>
              </div>
              <input
                id="setting-maxWalkMeters"
                type="range"
                min={200}
                max={2000}
                step={50}
                value={draft.maxWalkMeters}
                onChange={(e) => set('maxWalkMeters', Number(e.target.value))}
                className="mt-3 w-full cursor-pointer accent-primary"
              />
              <div className="mt-1 flex justify-between text-xs text-ink-3">
                <span>200 m</span>
                <span>2 km</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader title="School location" description="Drag the school pin to move it. Every route is re-planned to end at the new spot." />
            <div className="mt-4 h-[380px] border-t border-line">
              <BaseMap center={draft.location} zoom={12} label="School location. Drag the school marker to move it.">
                <CoverageLayer routes={[...preview.routes.values()]} meters={draft.maxWalkMeters} />
                {[...preview.routes.values()].map((r) => (
                  <RouteLine key={r.bus.id} route={r} emphasis="dim" />
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
          </Card>

          <Card className="p-5" aria-live="polite">
            <h2 className="text-[15px] font-bold text-ink">Effect on seat assignments</h2>
            {dirty ? (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-3xl font-extrabold text-ink tabular">{after}</span>
                <div className="text-sm text-ink-2">
                  students seated after saving
                  {after !== now && (
                    <span className={`ml-2 inline-flex items-center gap-0.5 font-bold ${after > now ? 'text-success-ink' : 'text-danger-ink'}`}>
                      {after > now ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownRight className="size-4" aria-hidden="true" />}
                      {after > now ? '+' : '−'}
                      {Math.abs(after - now)} vs now
                    </span>
                  )}
                  {after === now && <span className="ml-2 text-ink-3">(no change)</span>}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-3">
                {now} of {state.students.length} students seated. Change a setting to preview the effect before saving.
              </p>
            )}
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-end gap-2 border-t border-line bg-bg/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        {dirty && <span className="mr-auto text-sm font-medium text-ink-3">Unsaved changes</span>}
        <Button variant="secondary" onClick={() => setDraft(state.settings)} disabled={!dirty}>
          Discard
        </Button>
        <Button type="submit" disabled={!dirty}>
          <Save className="size-4" aria-hidden="true" />
          Save settings
        </Button>
      </div>
    </form>
  )
}
