import { EvaluateResponseSchema, type EvaluateRequest, type EvaluateResponse } from '@scenebrief/contracts';
import { MockRules, MockKnowledgeReferences, normalizeStatement } from '@scenebrief/fixtures';

// Platform-side client for the correction assistant (workstream 02). Outcomes never throw:
// a failing or disabled assistant must not affect capture or handoff.

export type AssistantClientMode = 'mock' | 'unavailable' | 'http';
export type AssistantOutcome =
  | { status: 'completed'; response: EvaluateResponse }
  | { status: 'unavailable'; error: string }
  | { status: 'failed'; error: string };

export interface AssistantClient {
  readonly mode: AssistantClientMode;
  readonly baseUrl: string | null;
  evaluate(request: EvaluateRequest): Promise<AssistantOutcome>;
  health(): Promise<{ reachable: boolean; detail: string }>;
}

/** Explicitly unavailable: evaluation is skipped and recorded as such. */
export class UnavailableAssistant implements AssistantClient {
  readonly mode = 'unavailable' as const;
  readonly baseUrl = null;
  async evaluate(): Promise<AssistantOutcome> { return { status: 'unavailable', error: 'Assistant not configured.' }; }
  async health() { return { reachable: false, detail: 'Assistant not configured.' }; }
}

/** Deterministic fixture replay for exact demo statements. Not clinical reasoning; labeled mode "mock". */
export class MockAssistant implements AssistantClient {
  readonly mode = 'mock' as const;
  readonly baseUrl = null;
  async evaluate(request: EvaluateRequest): Promise<AssistantOutcome> {
    const sourceIds = new Set(request.sources.map(s => s.id));
    const feedback = request.observations.flatMap(o => MockRules
      .filter(rule => normalizeStatement(rule.trigger) === normalizeStatement(o.text))
      .map(rule => ({ ...rule.item, id: `mock-${rule.key}-${o.id}`, observationIds: [o.id], evidenceSourceIds: rule.item.evidenceSourceIds.filter(id => sourceIds.has(id)) })));
    const used = new Set(feedback.flatMap(f => f.knowledgeReferenceIds));
    return { status: 'completed', response: { incidentId: request.incidentId, revision: request.revision, mode: 'mock', feedback, knowledgeReferences: MockKnowledgeReferences.filter(k => used.has(k.id)) } };
  }
  async health() { return { reachable: true, detail: 'Mock assistant (fixture replay).' }; }
}

const MAX_RESPONSE_BYTES = 200_000;

/** HTTP client for the assistant service: POST {baseUrl}/evaluate, GET {baseUrl}/health. */
export class HttpAssistant implements AssistantClient {
  readonly mode = 'http' as const;
  constructor(readonly baseUrl: string, private timeoutMs = 8000, private fetchImpl: typeof fetch = fetch) {}

  async evaluate(request: EvaluateRequest): Promise<AssistantOutcome> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL('/evaluate', this.baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      return isTimeout(error) ? { status: 'failed', error: `Assistant timed out after ${this.timeoutMs} ms.` } : { status: 'unavailable', error: 'Assistant service unreachable.' };
    }
    if (response.status === 503) return { status: 'unavailable', error: 'Assistant reported it is unavailable.' };
    if (!response.ok) return { status: 'failed', error: `Assistant returned HTTP ${response.status}.` };
    try {
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) return { status: 'failed', error: 'Assistant response too large.' };
      const parsed = EvaluateResponseSchema.safeParse(JSON.parse(body));
      // Do not echo the response body; it may contain patient text.
      return parsed.success ? { status: 'completed', response: parsed.data } : { status: 'failed', error: 'Assistant response failed schema validation.' };
    } catch (error) {
      return isTimeout(error) ? { status: 'failed', error: `Assistant timed out after ${this.timeoutMs} ms.` } : { status: 'failed', error: 'Assistant response was not valid JSON.' };
    }
  }

  async health() {
    try {
      const response = await this.fetchImpl(new URL('/health', this.baseUrl), { signal: AbortSignal.timeout(Math.min(this.timeoutMs, 2000)) });
      return { reachable: response.ok, detail: `HTTP ${response.status}` };
    } catch { return { reachable: false, detail: 'Unreachable' }; }
  }
}

function isTimeout(error: unknown) { return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'); }

/** Wraps the configured client with a runtime on/off switch (demo control for "assistant disabled"). */
export class AssistantGateway {
  enabled = true;
  constructor(readonly client: AssistantClient = new MockAssistant()) {}
  get effectiveMode(): AssistantClientMode { return this.enabled ? this.client.mode : 'unavailable'; }
  status() { return { configuredMode: this.client.mode, enabled: this.enabled, effectiveMode: this.effectiveMode, baseUrl: this.client.baseUrl }; }
  async evaluate(request: EvaluateRequest): Promise<AssistantOutcome> {
    if (!this.enabled) return { status: 'unavailable', error: 'Assistant disabled.' };
    try { return await this.client.evaluate(request); } catch { return { status: 'failed', error: 'Assistant client error.' }; }
  }
}

export function assistantFromEnv(env: NodeJS.ProcessEnv): AssistantGateway {
  const mode = env.SCENEBRIEF_ASSISTANT_MODE ?? 'mock';
  if (mode === 'mock') return new AssistantGateway(new MockAssistant());
  if (mode === 'unavailable') return new AssistantGateway(new UnavailableAssistant());
  if (mode === 'http') {
    const url = env.SCENEBRIEF_ASSISTANT_URL ?? 'http://127.0.0.1:3002';
    if (!URL.canParse(url)) throw new Error(`SCENEBRIEF_ASSISTANT_URL is not a valid URL: ${url}`);
    const timeout = Number(env.SCENEBRIEF_ASSISTANT_TIMEOUT_MS ?? 8000);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000) throw new Error('SCENEBRIEF_ASSISTANT_TIMEOUT_MS must be an integer from 100 to 60000.');
    return new AssistantGateway(new HttpAssistant(url, timeout));
  }
  throw new Error(`SCENEBRIEF_ASSISTANT_MODE must be mock, unavailable or http (got ${mode}).`);
}
