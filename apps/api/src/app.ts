import express from 'express';
import { ZodError } from 'zod';
import { IncidentId, TranscriptRequest, ReviewRequest, MatchRequest, SharingRequest } from '@scenebrief/contracts';
import { IncidentStore, StoreError } from './store.js';
export function createApp(store = new IncidentStore()) {
 const app = express(); app.use(express.json({ limit: '100kb' }));
 app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'synthetic-demo' }));
 app.post('/api/demo/reset', async (_req, res) => res.json(await store.transaction(() => store.reset())));
 app.get('/api/incidents/:id', (req, res) => {
  if (req.params.id !== IncidentId) return res.status(404).json({ error: 'Unknown incident' });
  res.json(store.snapshot());
 });
 app.use('/api/incidents/:id', (req, _res, next) => { if (req.params.id !== IncidentId) return next(new StoreError(404, 'Unknown incident')); next(); });
 app.post('/api/incidents/:id/sharing', async (req, res) => { const body = SharingRequest.parse(req.body); res.json(await store.transaction(() => store.sharing(body.sharing))); });
 app.post('/api/incidents/:id/match', async (req, res) => { const body = MatchRequest.parse(req.body); res.json(await store.transaction(() => store.match(body.patientId))); });
 app.post('/api/incidents/:id/transcripts', async (req, res) => { const body = TranscriptRequest.parse(req.body); res.json(await store.transaction(() => store.transcript(body))); });
 app.post('/api/incidents/:id/handoffs', async (req, res) => { const body = ReviewRequest.parse(req.body); res.json(await store.transaction(() => store.review(body.revision, body.reviewedBy))); });
 app.use((_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));
 const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof StoreError ? error.status : error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 500 ? 'Internal demo error' : error.message });
 };
 app.use(errors); return app;
}
