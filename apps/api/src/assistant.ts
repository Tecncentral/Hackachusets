import type { EvaluateRequest, EvaluateResponse } from '@scenebrief/contracts';
import { evaluateHybrid } from '@scenebrief/ai';
import { MockRules, MockKnowledgeReferences, normalizeStatement } from '@scenebrief/fixtures';
import { toAssistantRequest, fromAssistantResponse, AssistantResponseSchema } from './assistant-bridge.js';

// Platform-side client for the correction assistant (workstream 02). Outcomes never throw:
// a failing or disabled assistant must not affect capture or handoff.

// local: the correction assistant (@scenebrief/ai) in-process. http: the same assistant as the apps/assistant service.
export type AssistantClientMode = 'local' | 'mock' | 'unavailable' | 'http';
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

/** The correction assistant's deterministic rules (optionally model-phrased), called in-process. */
export class LocalAssistant implements AssistantClient {
  readonly mode = 'local' as const;
  readonly baseUrl = null;
  constructor(private timeoutMs = 8000) {}
  async evaluate(request: EvaluateRequest): Promise<AssistantOutcome> {
    try {
      const response = await withTimeout(evaluateHybrid(toAssistantRequest(request), {}), this.timeoutMs);
      return { status: 'completed', response: fromAssistantResponse(response) };
    } catch (error) {
      return { status: 'failed', error: isTimeout(error) ? `Assistant timed out after ${this.timeoutMs} ms.` : 'Assistant could not evaluate this snapshot.' };
    }
  }
  async health() { return { reachable: true, detail: 'In-process correction assistant (@scenebrief/ai).' }; }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const MAX_RESPONSE_BYTES = 200_000;

/** HTTP client for the apps/assistant service: POST {baseUrl}/evaluate, GET {baseUrl}/health. */
export class HttpAssistant implements AssistantClient {
  readonly mode = 'http' as const;
  constructor(readonly baseUrl: string, private timeoutMs = 8000, private fetchImpl: typeof fetch = fetch) {}

  async evaluate(request: EvaluateRequest): Promise<AssistantOutcome> {
    let body: string, response: Response;
    try { body = JSON.stringify(toAssistantRequest(request)); } catch { return { status: 'failed', error: 'Snapshot could not be converted to the assistant request.' }; }
    try {
      response = await this.fetchImpl(new URL('/evaluate', this.baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      return isTimeout(error) ? { status: 'failed', error: `Assistant timed out after ${this.timeoutMs} ms.` } : { status: 'unavailable', error: 'Assistant service unreachable.' };
    }
    if (response.status === 503) return { status: 'unavailable', error: 'Assistant reported it is unavailable.' };
    if (!response.ok) return { status: 'failed', error: `Assistant returned HTTP ${response.status}.` };
    try {
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) return { status: 'failed', error: 'Assistant response too large.' };
      const parsed = AssistantResponseSchema.safeParse(JSON.parse(body));
      // Do not echo the response body; it may contain patient text.
      if (!parsed.success) return { status: 'failed', error: 'Assistant response failed schema validation.' };
      try { return { status: 'completed', response: fromAssistantResponse(parsed.data) }; } catch { return { status: 'failed', error: 'Assistant response failed schema validation.' }; }
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
  constructor(readonly client: AssistantClient = new LocalAssistant()) {}
  get effectiveMode(): AssistantClientMode { return this.enabled ? this.client.mode : 'unavailable'; }
  status() { return { configuredMode: this.client.mode, enabled: this.enabled, effectiveMode: this.effectiveMode, baseUrl: this.client.baseUrl }; }
  async evaluate(request: EvaluateRequest): Promise<AssistantOutcome> {
    if (!this.enabled) return { status: 'unavailable', error: 'Assistant disabled.' };
    try { return await this.client.evaluate(request); } catch { return { status: 'failed', error: 'Assistant client error.' }; }
  }
}

export function assistantFromEnv(env: NodeJS.ProcessEnv): AssistantGateway {
  const mode = env.SCENEBRIEF_ASSISTANT_MODE ?? 'local';
  const timeout = Number(env.SCENEBRIEF_ASSISTANT_TIMEOUT_MS ?? 8000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000) throw new Error('SCENEBRIEF_ASSISTANT_TIMEOUT_MS must be an integer from 100 to 60000.');
  if (mode === 'local') return new AssistantGateway(new LocalAssistant(timeout));
  if (mode === 'mock') return new AssistantGateway(new MockAssistant());
  if (mode === 'unavailable') return new AssistantGateway(new UnavailableAssistant());
  if (mode === 'http') {
    const url = env.SCENEBRIEF_ASSISTANT_URL ?? 'http://127.0.0.1:3002';
    if (!URL.canParse(url)) throw new Error(`SCENEBRIEF_ASSISTANT_URL is not a valid URL: ${url}`);
    return new AssistantGateway(new HttpAssistant(url, timeout));
  }
  throw new Error(`SCENEBRIEF_ASSISTANT_MODE must be local, mock, unavailable or http (got ${mode}).`);
}
