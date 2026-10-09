import { cookies } from 'next/headers'
import {
  DEMO_COOKIE,
  DEMO_STATE_COOKIE,
  demoCookieOptions,
  demoEnabled,
  issueDemoSession,
  openDemoState,
  sealDemoState,
  verifyDemoSession,
} from '@/lib/demo-session'
import {
  DEMO_PLANTS,
  demoCompany,
  demoContractSample,
  demoOrders,
  demoQuotes,
  demoReports,
  demoRequests,
  demoVisits,
  demoWorkOrders,
  type DemoPlant,
  type DemoReport,
} from '@/lib/portal-demo-data'

export { demoEnabled, issueDemoSession }

type DemoRequest = {
  id: string
  species: string | null
  quantity: string | null
  location_note: string | null
  message: string
  status: string
  created_at: string
}

type DemoState = {
  notes: Record<string, string>
  reports: DemoReport[]
  requests: DemoRequest[]
}

const EMPTY_STATE: DemoState = { notes: {}, reports: [], requests: [] }

async function readState(): Promise<DemoState> {
  const jar = await cookies()
  const parsed = await openDemoState<DemoState>(jar.get(DEMO_STATE_COOKIE)?.value)
  if (!parsed || typeof parsed !== 'object') return EMPTY_STATE
  return {
    notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
    reports: Array.isArray(parsed.reports) ? parsed.reports.slice(0, 8) : [],
    requests: Array.isArray(parsed.requests) ? parsed.requests.slice(0, 8) : [],
  }
}

async function writeState(state: DemoState) {
  const token = await sealDemoState(state)
  if (!token) return
  const jar = await cookies()
  jar.set(DEMO_STATE_COOKIE, token, demoCookieOptions())
}

export async function hasDemoPortalSession(): Promise<boolean> {
  if (!demoEnabled()) return false
  const jar = await cookies()
  return verifyDemoSession(jar.get(DEMO_COOKIE)?.value)
}

export async function demoPlants(): Promise<DemoPlant[]> {
  const state = await readState()
  return DEMO_PLANTS.map((plant) => ({
    ...plant,
    customer_note: state.notes[plant.id] ?? plant.customer_note,
  }))
}

export async function demoPortalSnapshot() {
  const [plants, state] = await Promise.all([demoPlants(), readState()])
  return {
    companyName: 'Demo Kantoor',
    company: demoCompany(),
    plants,
    visits: demoVisits(),
    workOrders: demoWorkOrders(),
    quotes: demoQuotes(),
    orders: demoOrders(),
    requests: [...state.requests, ...demoRequests()],
    reports: [...state.reports, ...demoReports()],
    contract: demoContractSample(),
  }
}

export async function saveDemoPlantNote(plantId: string, note: string) {
  const state = await readState()
  const next = note.trim().slice(0, 2000)
  if (next) state.notes[plantId] = next
  else delete state.notes[plantId]
  await writeState(state)
}

export async function saveDemoReport(report: DemoReport) {
  const state = await readState()
  state.reports = [report, ...state.reports].slice(0, 8)
  await writeState(state)
}

export async function saveDemoRequest(request: DemoRequest) {
  const state = await readState()
  state.requests = [request, ...state.requests].slice(0, 8)
  await writeState(state)
}
