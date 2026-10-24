import express from 'express';
import { z, ZodError } from 'zod';
import { IncidentId, TranscriptRequest, ReviewRequest, MatchRequest, SharingRequest, ResetRequest, AssistantToggleRequest } from '@scenebrief/contracts';
import { IncidentStore, StoreError } from './store.js';
import { renderHandoffHtml } from './handoff.js';

const PRINT_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export function createApp(store = new IncidentStore()) {
  const app = express(); app.use(express.json({ limit: '100kb' }));
  const tx = <T>(fn: () => Promise<T> | T) => store.transaction(fn);

  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'synthetic-demo', assistant: store.assistant.status() }));
  app.get('/api/assistant', async (_req, res) => res.json({ ...store.assistant.status(), health: store.assistant.enabled ? await store.assistant.client.health() : { reachable: false, detail: 'Disabled' } }));
  app.post('/api/demo/reset', async (req, res) => { const body = ResetRequest.parse(req.body ?? {}); res.json(await tx(() => store.reset(body.variant))); });
  // Demo control: disable/enable the assistant at runtime without losing in-memory state.
  app.post('/api/demo/assistant', (req, res) => { const body = AssistantToggleRequest.parse(req.body); store.assistant.enabled = body.enabled; res.json(store.assistant.status()); });

  app.get('/api/incidents/:id', (req, res) => {
    if (req.params.id !== IncidentId) return res.status(404).json({ error: 'Unknown incident' });
    res.json(store.snapshot());
  });
  app.use('/api/incidents/:id', (req, _res, next) => { if (req.params.id !== IncidentId) return next(new StoreError(404, 'Unknown incident')); next(); });

  // Legacy scaffold routes
  app.post('/api/incidents/:id/sharing', async (req, res) => { const body = SharingRequest.parse(req.body); res.json(await tx(() => store.sharing(body.sharing))); });
  app.post('/api/incidents/:id/match', async (req, res) => { const body = MatchRequest.parse(req.body); res.json(await tx(() => store.match(body.patientId))); });
  app.post('/api/incidents/:id/transcripts', async (req, res) => { const body = TranscriptRequest.parse(req.body); res.json(await tx(() => store.transcript(body))); });

  // Capture (each returns the full validated incident)
  app.post('/api/incidents/:id/observations', async (req, res) => res.json(await tx(() => store.addObservation(req.body))));
  app.post('/api/incidents/:id/measurements', async (req, res) => res.json(await tx(() => store.addMeasurement(req.body))));
  app.post('/api/incidents/:id/care-events', async (req, res) => res.json(await tx(() => store.addCareEvent(req.body))));
  app.post('/api/incidents/:id/timeline-events', async (req, res) => res.json(await tx(() => store.addTimelineEvent(req.body))));
  app.post('/api/incidents/:id/context-facts', async (req, res) => res.json(await tx(() => store.addContextFact(req.body))));
  app.post('/api/incidents/:id/environment-readings', async (req, res) => res.json(await tx(() => store.addEnvironmentReading(req.body))));
  app.post('/api/incidents/:id/corrections', async (req, res) => res.json(await tx(() => store.correct(req.body))));

  // Assistant proposals and the crew's decisions
  app.post('/api/incidents/:id/evaluations', async (req, res) => res.json(await store.evaluate(req.body)));
  app.post('/api/incidents/:id/feedback/:feedbackId/resolutions', async (req, res) => res.json(await tx(() => store.resolve(req.params.feedbackId, req.body))));

  // Handoff
  app.get('/api/incidents/:id/handoff-draft', (_req, res) => res.json(store.handoffDraft()));
  app.get('/api/incidents/:id/handoff-draft/print', (_req, res) => {
    res.set('Content-Security-Policy', PRINT_CSP).type('html').send(renderHandoffHtml(store.handoffDraft(), store.snapshot().sources, IncidentId));
  });
  app.post('/api/incidents/:id/handoffs', async (req, res) => { const body = ReviewRequest.parse(req.body); res.json(await tx(() => store.review(body.revision, body.reviewedBy))); });
  app.get('/api/incidents/:id/handoffs/:version', (req, res) => res.json(store.handoff(z.coerce.number().int().positive().parse(req.params.version))));
  app.get('/api/incidents/:id/handoffs/:version/print', (req, res) => {
    const handoff = store.handoff(z.coerce.number().int().positive().parse(req.params.version));
    res.set('Content-Security-Policy', PRINT_CSP).type('html').send(renderHandoffHtml(handoff, store.snapshot().sources, IncidentId));
  });

  app.use((_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));
  const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error instanceof StoreError ? error.status : error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
    const message = status === 500 ? 'Internal demo error' : error instanceof ZodError ? z.prettifyError(error) : error.message;
    if (status === 500) console.error(error instanceof Error ? error.message : 'Unknown error');
    res.status(status).json({ error: message });
  };
  app.use(errors); return app;
}
