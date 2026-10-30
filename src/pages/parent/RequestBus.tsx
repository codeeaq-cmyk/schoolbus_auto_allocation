import type { Marker as LeafletMarker } from 'leaflet'
import { ArrowLeft, ArrowRight, Check, CircleCheck, Crosshair, Hand, LoaderCircle, LocateFixed, MapPinned, Search, Send, Sparkles } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import { BaseMap, FitBounds, FlyTo, MapClick } from '../../components/map/BaseMap'
import { homeIcon, pickupIcon } from '../../components/map/icons'
import { CoverageLayer, RouteLine, SchoolMarker, StopMarkers } from '../../components/map/layers'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { GRADES } from '../../lib/constants'
import { pointKey } from '../../lib/distance'
import { effectiveWalk } from '../../lib/engine/boarding'
import { explainSeat, roadDescription } from '../../lib/engine/explain'
import { placeStudent, seatCounts } from '../../lib/engine/plan'
import { buildPlanView } from '../../lib/engine/view'
import { formatDistance, haversine } from '../../lib/geo'
import { EASE_OUT, spring } from '../../lib/motion'
import { href, navigate } from '../../lib/router'
import { hasRoadData, roadLevelNear } from '../../lib/roads'
import { fetchRoute, reverseGeocode, searchPlaces, type Place } from '../../lib/services'
import type { LatLng, RoutePath, Student } from '../../lib/types'
import { addStudent, updateStudent } from '../../store/actions'
import { useStore } from '../../store/context'
import { DEMO_PARENT, uid } from '../../store/state'
import { BoardingPass, WaitlistCard } from './BoardingPass'

type FormKey = 'name' | 'grade' | 'parentName' | 'parentPhone' | 'home'
type Errors = Partial<Record<FormKey, string>>

const STEPS = ['Your child', 'Your home', 'Your plan']

const slide: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 22 * direction }),
  center: { opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE_OUT } },
  exit: (direction: number) => ({ opacity: 0, x: -14 * direction, transition: { duration: 0.12 } }),
}

function Stepper({ step, onJump }: { step: number; onJump: (index: number) => void }) {
  return (
    <ol className="mt-5 flex items-center" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < step
        const current = i === step
        return (
          <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <button
              type="button"
              disabled={!done}
              onClick={() => onJump(i)}
              aria-current={current ? 'step' : undefined}
              className={cn('flex items-center gap-2 rounded-lg text-xs font-bold transition-colors', done ? 'cursor-pointer text-primary' : current ? 'text-ink' : 'text-ink-3')}
            >
              <span className={cn('relative grid size-7 shrink-0 place-items-center rounded-full text-xs transition-colors duration-300', done || current ? 'text-white' : 'bg-muted text-ink-3')}>
                {(done || current) && <motion.span layout layoutId={`step-${i}`} className="gradient-primary absolute inset-0 rounded-full" transition={spring} />}
                <span className="relative">{done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : i + 1}</span>
              </span>
              <span className={cn(!current && 'hidden sm:inline')}>{label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <motion.span className="gradient-primary block h-full origin-left rounded-full" initial={false} animate={{ scaleX: done ? 1 : 0 }} transition={{ duration: 0.4, ease: EASE_OUT }} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const PLANNING = ['Checking the road outside your home', 'Finding your boarding point', 'Saving your seat']

/** A short moment that shows the planner doing its work, then the pass appears. */
function PlanningOverlay({ waitlisted }: { waitlisted: boolean }) {
  const [done, setDone] = useState(0)
  const reduced = useReducedMotion()
  useEffect(() => {
    const timer = window.setInterval(() => setDone((d) => d + 1), reduced ? 80 : 330)
    return () => window.clearInterval(timer)
  }, [reduced])
  const lines = waitlisted ? [PLANNING[0], PLANNING[1], 'Adding you to the queue'] : PLANNING
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-20 grid place-items-center rounded-[inherit] bg-surface/95 p-8 backdrop-blur-sm" role="status" aria-live="polite">
      <ul className="flex w-full max-w-xs flex-col gap-4">
        {lines.map((line, i) => {
          const finished = i < done
          const active = i === done
          return (
            <motion.li key={line} initial={{ opacity: 0 }} animate={{ opacity: i <= done ? 1 : 0.35 }} className="flex items-center gap-3 text-sm font-semibold text-ink">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-200', finished ? 'bg-success text-white' : 'bg-muted text-ink-3')}>
                {finished ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : active ? <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" /> : null}
              </span>
              {line}
            </motion.li>
          )
        })}
      </ul>
    </motion.div>
  )
}

function SectionNote({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{children}</p>
}

export function RequestBus({ editId }: { editId: string | null }) {
  const { state, view: currentView, update } = useStore()
  const toast = useToast()
  const editing = editId ? state.students.find((s) => s.id === editId && s.parentId === DEMO_PARENT.id) : undefined

  const [step, setStep] = useState(editing ? 1 : 0)
  const [direction, setDirection] = useState(1)
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    grade: editing?.grade ?? '',
    parentName: editing?.parentName ?? DEMO_PARENT.name,
    parentPhone: editing?.parentPhone ?? DEMO_PARENT.phone,
  })
  const [home, setHome] = useState<LatLng | null>(editing?.home ?? null)
  const [address, setAddress] = useState(editing?.address ?? '')
  const [addressEdited, setAddressEdited] = useState(Boolean(editing))
  const [lookingUp, setLookingUp] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [chosenStop, setChosenStop] = useState<string | null>(editing?.pinnedStopId ?? null)
  const [roadPaths, setRoadPaths] = useState<Record<string, RoutePath>>({})
  const geocodeAbort = useRef<AbortController | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const change = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  const placeHome = (p: LatLng, knownAddress?: string) => {
    setHome(p)
    setChosenStop(null)
    if (errors.home) setErrors((e) => ({ ...e, home: undefined }))
    if (knownAddress) {
      setAddress(knownAddress)
      setAddressEdited(false)
      return
    }
    if (addressEdited) return
    geocodeAbort.current?.abort()
    const controller = new AbortController()
    geocodeAbort.current = controller
    setLookingUp(true)
    reverseGeocode(p, controller.signal).then((label) => {
      if (controller.signal.aborted) return
      setLookingUp(false)
      if (label) setAddress(label)
    })
  }

  const runSearch = async () => {
    if (query.trim().length < 3) {
      setSearchError('Type at least 3 characters.')
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const results = await searchPlaces(`${query.trim()}, Thiruvananthapuram`, state.settings.location)
      setPlaces(results)
      if (results.length === 0) setSearchError('No matches. Try a landmark or area name, or tap the map.')
    } catch {
      setSearchError("Address search isn't reachable right now. Tap the map to place your pin instead.")
      setPlaces(null)
    } finally {
      setSearching(false)
    }
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setSearchError("This browser can't share its location. Tap the map instead.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        placeHome(p)
        setFlyTarget(p)
        const km = haversine(p, state.settings.location) / 1000
        if (km > 30) toast({ tone: 'info', title: `You're ${Math.round(km)} km from school`, description: 'The demo covers Thiruvananthapuram, so this spot shows as out of range.' })
      },
      () => {
        setLocating(false)
        setSearchError('Location permission was denied. Search for your address or tap the map.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Live preview: the real planner places this child as the newest request.
  const preview = useMemo(() => {
    if (!home) return null
    const draft: Student = {
      id: editing?.id ?? 'draft',
      name: form.name.trim() || 'Your child',
      grade: form.grade || 'Class',
      parentId: DEMO_PARENT.id,
      parentName: form.parentName,
      parentPhone: form.parentPhone,
      home,
      address,
      registeredAt: editing?.registeredAt ?? Number.MAX_SAFE_INTEGER,
      pinnedVehicleId: editing?.pinnedVehicleId ?? null,
      pinnedStopId: chosenStop,
      feeOverride: editing?.feeOverride ?? null,
    }
    const next = { ...state, students: [...state.students.filter((s) => s.id !== draft.id), draft] }
    const plan = placeStudent(next, draft)
    const nextView = buildPlanView({ ...next, plan, paths: { ...state.paths, ...roadPaths } })
    return { draft, view: nextView, student: nextView.students.get(draft.id)! }
  }, [home, form, address, editing, chosenStop, state, roadPaths])

  const view = preview?.view ?? currentView
  const routes = [...view.routes.values()]
  const seated = preview?.student.status === 'seated' ? preview.student : null
  const focusId = seated?.vehicle.id ?? null

  // Once the pin settles, fetch the real road for the route it changed.
  const changedRoute = seated && !seated.route.roadSnapped ? seated.route : null
  const changedKey = changedRoute?.key
  useEffect(() => {
    if (!changedRoute) return
    const controller = new AbortController()
    const { vehicle, key } = changedRoute
    const timer = window.setTimeout(() => {
      const waypoints = [vehicle.start.position, ...changedRoute.stops.map((s) => s.stop.position), state.settings.location, ...(vehicle.end ? [vehicle.end.position] : [])]
      fetchRoute(waypoints, vehicle.type, controller.signal)
        .then((road) => setRoadPaths((paths) => ({ ...paths, [vehicle.id]: { key, ...road } })))
        .catch(() => undefined)
    }, 500)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // Only a different set of stops needs a new road.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedKey])

  const walk = effectiveWalk(state.settings)
  const alternatives = useMemo(() => {
    if (!home) return []
    // When nothing is close, show further stops too: a longer walk may be better than waiting.
    const range = preview?.student.status === 'waitlisted' ? state.settings.maxWalkMeters * 2.5 : walk * 1.5
    const counts = seatCounts(state.plan)
    return state.plan.stops
      .map((stop) => {
        const carrier = state.plan.routes.map((r) => ({ route: r, vehicle: state.vehicles.find((v) => v.id === r.vehicleId) })).find(({ route, vehicle }) => vehicle && route.stopIds.includes(stop.id) && (counts.get(vehicle.id) ?? 0) < vehicle.seats)
        return { stop, meters: haversine(home, stop.position), vehicle: carrier?.vehicle }
      })
      .filter((option) => option.meters <= range)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 5)
  }, [home, state.plan, state.vehicles, state.settings.maxWalkMeters, walk, preview?.student.status])

  const roadHere = home && hasRoadData(home) ? roadDescription(roadLevelNear(home)) : null

  const nextFromChild = () => {
    const found: Errors = {}
    if (form.name.trim().length < 2) found.name = "Enter your child's full name."
    if (!form.grade) found.grade = 'Choose a class.'
    if (form.parentName.trim().length < 2) found.parentName = 'Enter your name.'
    if (form.parentPhone.replace(/\D/g, '').length < 10) found.parentPhone = 'Enter a phone number with at least 10 digits.'
    setErrors(found)
    const first = (['name', 'grade', 'parentName', 'parentPhone'] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`field-${first}`)?.focus()
      return
    }
    goTo(1)
  }

  const nextFromHome = () => {
    if (!home) {
      setErrors((e) => ({ ...e, home: 'Tap the map where you live, search above, or use your location.' }))
      document.getElementById('field-home')?.focus()
      return
    }
    goTo(2)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step === 0) return nextFromChild()
    if (step === 1) return nextFromHome()
    setSubmitting(true)
    const wait = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 1250
    window.setTimeout(() => {
      const payload = {
        name: form.name.trim(),
        grade: form.grade,
        parentName: form.parentName.trim(),
        parentPhone: form.parentPhone.trim(),
        home: home!,
        address: address.trim() || 'Pinned on map',
        pinnedStopId: chosenStop,
      }
      const id = editing?.id ?? uid('stu')
      if (editing) update((s) => updateStudent(s, id, payload))
      else update((s) => addStudent(s, { id, parentId: DEMO_PARENT.id, registeredAt: Date.now(), pinnedVehicleId: null, feeOverride: null, ...payload }))
      navigate(`/parent/child/${id}?new=1`)
    }, wait)
  }

  if (editId && !editing) {
    return (
      <EmptyState icon={<MapPinned />} title="This request isn't available" action={<ButtonLink href={href('/parent')}>Back to my children</ButtonLink>}>
        It may have been cancelled, or the demo data was reset.
      </EmptyState>
    )
  }

  const fitPoints = editing ? [editing.home, state.settings.location] : [state.settings.location, ...state.plan.stops.map((s) => s.position)]
  const panelWidth = typeof window !== 'undefined' && window.innerWidth >= 1024 ? 490 : undefined

  return (
    <div className="relative flex flex-1 flex-col lg:h-[calc(100dvh-4rem)] lg:flex-none">
      <div className="relative h-[42vh] min-h-[280px] shrink-0 lg:absolute lg:inset-0 lg:h-auto">
        <BaseMap center={state.settings.location} zoom={13} label="Pick your home location. Click or tap the map to drop a pin, then drag it to adjust.">
          <FitBounds points={fitPoints} fitKey="request" paddingLeft={panelWidth} />
          <FlyTo target={flyTarget} />
          <MapClick
            onClick={(p) => {
              placeHome(p)
              if (step === 0) goTo(1)
            }}
          />
          <CoverageLayer routes={routes} meters={state.settings.maxWalkMeters} />
          {routes.map((route) => (
            <RouteLine key={route.vehicle.id} route={route} emphasis={!focusId ? 'normal' : route.vehicle.id === focusId ? 'focus' : 'dim'} />
          ))}
          {routes.map((route) => (
            <StopMarkers key={route.vehicle.id} route={route} dim={!!focusId && route.vehicle.id !== focusId} compact={route.vehicle.id !== focusId} />
          ))}
          <SchoolMarker position={state.settings.location} name={state.settings.name} />
          {home && seated && (
            <>
              <Polyline positions={[home, seated.position]} pathOptions={{ color: '#15163a', weight: 2.5, dashArray: '2 7', lineCap: 'round', interactive: false }} />
              <Marker position={seated.position} icon={pickupIcon(routeColor(seated.vehicle.colorSlot))} keyboard={false} />
            </>
          )}
          {home && (
            <Marker
              key={pointKey(home)}
              position={home}
              icon={homeIcon(true)}
              draggable
              zIndexOffset={800}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as LeafletMarker).getLatLng()
                  placeHome({ lat: ll.lat, lng: ll.lng })
                },
              }}
              title="Your home. Drag to adjust."
            />
          )}
        </BaseMap>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center lg:left-[500px]">
          <motion.div key={home ? 'drag' : 'tap'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 rounded-full bg-night/90 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
            {home ? <Hand className="size-4" aria-hidden="true" /> : <Crosshair className="size-4 text-accent" aria-hidden="true" />}
            {home ? 'Drag the pin to your exact gate' : 'Tap the map where you live'}
          </motion.div>
        </div>
        <div className="glass pointer-events-none absolute bottom-8 right-16 z-10 hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-2 lg:flex">
          <span className="h-3 w-5 rounded-sm bg-primary/25" aria-hidden="true" />
          Within {formatDistance(state.settings.maxWalkMeters)} of a route
        </div>
      </div>

      <motion.form
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
        className="glass-strong relative z-10 -mt-5 flex min-w-0 flex-1 flex-col rounded-t-3xl lg:absolute lg:bottom-4 lg:left-4 lg:top-4 lg:mt-0 lg:w-[460px] lg:flex-none lg:rounded-3xl"
      >
        <div className="px-5 pt-5 sm:px-6">
          <a href={href('/parent')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
            My children
          </a>
          {!editing && <Stepper step={step} onJump={goTo} />}
        </div>

        <div className="scrollbar-soft relative flex-1 overflow-x-hidden px-5 pb-5 pt-5 sm:px-6 lg:overflow-y-auto">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div key={step} custom={direction} variants={slide} initial="enter" animate="center" exit="exit">
              {step === 0 && (
                <>
                  <h1 className="text-2xl font-extrabold tracking-tight text-ink">Who's riding?</h1>
                  <SectionNote>Just the basics. The rest is worked out for you.</SectionNote>
                  <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_150px]">
                    <Field id="field-name" label="Child's full name" required error={errors.name}>
                      {(p) => <Input {...p} value={form.name} onChange={(e) => change('name', e.target.value)} autoComplete="off" placeholder="e.g. Maya Nair" />}
                    </Field>
                    <Field id="field-grade" label="Class" required error={errors.grade}>
                      {(p) => (
                        <Select {...p} value={form.grade} onChange={(e) => change('grade', e.target.value)}>
                          <option value="">Choose…</option>
                          {GRADES.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field id="field-parentName" label="Your name" required error={errors.parentName}>
                      {(p) => <Input {...p} value={form.parentName} onChange={(e) => change('parentName', e.target.value)} autoComplete="name" />}
                    </Field>
                    <Field id="field-parentPhone" label="Phone" required error={errors.parentPhone}>
                      {(p) => <Input {...p} type="tel" inputMode="tel" value={form.parentPhone} onChange={(e) => change('parentPhone', e.target.value)} autoComplete="tel" />}
                    </Field>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <h1 className="text-2xl font-extrabold tracking-tight text-ink">{editing ? 'Where do you live now?' : 'Where do you live?'}</h1>
                  <SectionNote>Tap the map, or find your address here. The shaded area is within walking distance of a route.</SectionNote>
                  <div className="mt-5 flex flex-col gap-3">
                    <div role="search" className="flex flex-col gap-2">
                      <label htmlFor="place-search" className="text-sm font-semibold text-ink">
                        Find your address
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                          <Input
                            id="place-search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                // Search instead of moving to the next step.
                                e.preventDefault()
                                runSearch()
                              }
                            }}
                            placeholder="Area, street or landmark"
                            className="pl-9"
                            autoComplete="off"
                          />
                        </div>
                        <Button variant="secondary" onClick={() => runSearch()} disabled={searching} aria-label="Search address">
                          {searching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
                        </Button>
                        <Button variant="secondary" onClick={useMyLocation} disabled={locating} aria-label="Use my current location" title="Use my current location">
                          {locating ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="size-4" aria-hidden="true" />}
                        </Button>
                      </div>
                      {searchError && <p className="text-sm text-warning-ink">{searchError}</p>}
                      <AnimatePresence initial={false}>
                        {places && places.length > 0 && (
                          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-1 overflow-hidden" aria-label="Search results">
                            {places.map((place) => (
                              <li key={place.id}>
                                <button
                                  type="button"
                                  className="flex w-full cursor-pointer flex-col items-start rounded-xl bg-muted px-3.5 py-2.5 text-left transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"
                                  onClick={() => {
                                    placeHome(place.position, [place.label, place.detail].filter(Boolean).join(', '))
                                    setFlyTarget(place.position)
                                    setPlaces(null)
                                  }}
                                >
                                  <span className="text-sm font-semibold text-ink">{place.label}</span>
                                  <span className="text-xs text-ink-3">{place.detail}</span>
                                </button>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>

                    <div
                      id="field-home"
                      tabIndex={-1}
                      className={cn(
                        'rounded-2xl px-4 py-3.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        errors.home ? 'bg-danger-soft font-semibold text-danger-ink' : home ? 'bg-primary-soft text-ink' : 'bg-muted text-ink-3',
                      )}
                    >
                      {errors.home ??
                        (home ? (
                          <span className="flex items-center gap-2.5">
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="gradient-primary grid size-7 shrink-0 place-items-center rounded-full text-white">
                              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                            </motion.span>
                            <span>
                              <span className="block font-bold">Pin placed</span>
                              <span className="block text-xs text-ink-2">{roadHere ?? 'Outside the area we have road data for'}</span>
                            </span>
                          </span>
                        ) : (
                          'No pin yet. Tap the map where you live.'
                        ))}
                    </div>

                    <Field label="Address or landmark" hint={lookingUp ? 'Looking up the address…' : 'Helps the driver. Add a house number or landmark.'}>
                      {(p) => (
                        <Input
                          {...p}
                          value={address}
                          onChange={(e) => {
                            setAddress(e.target.value)
                            setAddressEdited(true)
                          }}
                          placeholder="House no., street, landmark"
                        />
                      )}
                    </Field>
                  </div>
                </>
              )}

              {step === 2 && preview && (
                <section aria-labelledby="preview-heading" aria-live="polite">
                  <h1 id="preview-heading" className="text-2xl font-extrabold tracking-tight text-ink">
                    {seated ? "Here's your plan" : 'Almost there'}
                  </h1>
                  <SectionNote>{seated ? 'Your seat is ready to confirm. Move the pin on the map and this updates instantly.' : 'No seat can be offered here just yet.'}</SectionNote>
                  <div className="mt-4">{seated ? <BoardingPass student={seated} compact onCard /> : preview.student.status === 'waitlisted' ? <WaitlistCard student={preview.student} settings={state.settings} /> : null}</div>

                  {seated && (
                    <details className="group mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-ink-2">
                      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-ink">
                        <Sparkles className="size-4 text-primary" aria-hidden="true" />
                        Why this stop and vehicle?
                      </summary>
                      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                        {explainSeat(seated).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {alternatives.length > 0 && (
                    <fieldset className="mt-4">
                      <legend className="text-sm font-bold text-ink">Boarding point</legend>
                      <div className="mt-2 flex flex-col gap-2">
                        <StopChoice checked={chosenStop === null} onChange={() => setChosenStop(null)} title="Picked for you" detail={seated ? `${seated.stop.name} · ${formatDistance(seated.walkMeters)} walk` : 'Wait for a seat nearby'} recommended />
                        {alternatives.map(({ stop, meters, vehicle }) => (
                          <StopChoice key={stop.id} checked={chosenStop === stop.id} onChange={() => setChosenStop(stop.id)} title={stop.name} detail={`${formatDistance(meters)} walk · ${vehicle ? `seat free on ${vehicle.label}` : 'no free seat right now'}`} />
                        ))}
                      </div>
                    </fieldset>
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 sm:px-6">
          {step > (editing ? 1 : 0) && (
            <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={submitting}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
            {step === 0 && (
              <>
                Next: your home
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
            {step === 1 && (
              <>
                See my plan
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
            {step === 2 && (
              <>
                {seated ? <CircleCheck className="size-5" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                {editing ? 'Save new location' : seated ? 'Confirm my seat' : 'Join the waitlist'}
              </>
            )}
          </Button>
        </div>

        <AnimatePresence>{submitting && <PlanningOverlay waitlisted={!seated} />}</AnimatePresence>
      </motion.form>
    </div>
  )
}

function StopChoice({ checked, onChange, title, detail, recommended }: { checked: boolean; onChange: () => void; title: string; detail: string; recommended?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', checked ? 'bg-primary/15' : 'bg-muted hover:bg-tonal')}>
      <input type="radio" name="boarding-point" className="mt-0.5 size-4 cursor-pointer accent-primary" checked={checked} onChange={onChange} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
          {title}
          {recommended && <Sparkles className="size-3.5 text-primary" aria-hidden="true" />}
        </span>
        <span className="block text-xs text-ink-3">{detail}</span>
      </span>
    </label>
  )
}
