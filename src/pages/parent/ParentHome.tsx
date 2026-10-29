import { ArrowRight, Bus, Info, Plus } from 'lucide-react'
import { ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState, Initials, PageHeader } from '../../components/ui/misc'
import { formatDistance } from '../../lib/geo'
import { href } from '../../lib/router'
import { useStore } from '../../store/context'
import { DEMO_PARENT } from '../../store/state'
import { AssignmentDetails, StatusBadge } from './AssignmentDetails'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function ParentHome() {
  const { state, result } = useStore()
  const children = state.students.filter((s) => s.parentId === DEMO_PARENT.id).sort((a, b) => a.registeredAt - b.registeredAt)

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={`${greeting()}, ${DEMO_PARENT.name.split(' ')[0]}`}
        title="School bus"
        description={`Request a seat on the ${state.settings.name} bus and see exactly where and when your child will be picked up.`}
        actions={
          <ButtonLink href={href('/parent/request')} size="lg">
            <Plus className="size-5" aria-hidden="true" />
            Request a bus seat
          </ButtonLink>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="children-heading">
          <h2 id="children-heading" className="sr-only">
            Your children
          </h2>
          {children.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bus />}
                title="No bus requests yet"
                action={
                  <ButtonLink href={href('/parent/request')}>
                    <Plus className="size-4" aria-hidden="true" />
                    Request a bus seat
                  </ButtonLink>
                }
              >
                Drop a pin at your home and your child is matched to the nearest bus route with a free seat. It takes about a minute.
              </EmptyState>
            </Card>
          ) : (
            <ul className="grid gap-4">
              {children.map((child) => {
                const assignment = result.byStudent.get(child.id)
                return (
                  <li key={child.id}>
                    <Card className="overflow-hidden animate-rise">
                      <div className="flex items-start gap-3 p-5 pb-4">
                        <Initials name={child.name} />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-bold text-ink">{child.name}</h3>
                          <p className="truncate text-sm text-ink-3">
                            {child.grade} · {child.address}
                          </p>
                        </div>
                        <StatusBadge assignment={assignment} />
                      </div>
                      <div className="px-5 pb-5">
                        <AssignmentDetails student={child} assignment={assignment} result={result} students={state.students} settings={state.settings} compact />
                      </div>
                      <a
                        href={href(`/parent/child/${child.id}`)}
                        className="flex items-center justify-between border-t border-line bg-muted/60 px-5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary-soft"
                      >
                        {assignment?.status === 'assigned' ? 'Bus details & live tracking' : 'View request'}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </a>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <Info className="size-4 text-primary" aria-hidden="true" />
              How seats are assigned
            </h2>
            <ul className="mt-3 flex flex-col gap-3 text-sm text-ink-2">
              <li>Your child gets the bus whose route passes closest to your home, within {formatDistance(state.settings.maxWalkMeters)} on foot.</li>
              <li>Seats go in request order, so an earlier request is never bumped by a later one.</li>
              <li>If the nearest buses are full, you join a queue and are seated automatically when a seat opens or the school adds a bus.</li>
              <li>Pickup times assume the bus reaches school {state.settings.arrivalBufferMin} minutes before the bell.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  )
}
