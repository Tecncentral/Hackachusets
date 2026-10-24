import express from 'express';
import { ZodError } from 'zod';
import {
  evaluateHybrid,
  transcribe,
  transcriptionAvailability,
  EvaluateRequest,
} from '@scenebrief/ai';

// Optional standalone assistant service.
//
// The platform can import @scenebrief/ai DIRECTLY (no network hop) — that is the
// default integration path in this scaffold. This service exists for the case
// where a separate process is wanted. It owns NO incident state: it evaluates an
// immutable snapshot passed in the request and returns proposals.
//
// Endpoints (shared logical contract):
//   GET  /health
//   POST /evaluate     { incidentId, revision, observations, measurements, sources, careEvents, protocolContext }
//   POST /transcribe   multipart audio -> { transcript, mode, warnings }

const MAX_JSON = '256kb';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

export function createAssistantApp() {
  const app = express();
  app.use(express.json({ limit: MAX_JSON }));

  app.get('/health', (_req, res) => {
    const audio = transcriptionAvailability();
    res.json({ ok: true, mode: 'assistant', transcription: audio });
  });

  app.post('/evaluate', async (req, res, next) => {
    try {
      const parsed = EvaluateRequest.parse(req.body);
      // No live model wired by default -> rules-only. A server with a validated
      // model would pass it here; model output is re-validated inside evaluateHybrid.
      const result = await evaluateHybrid(parsed, {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Raw audio body (the UI can also post multipart; a thin raw path keeps the
  // service dependency-free). requestId travels in a header for the raw path.
  app.post(
    '/transcribe',
    express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_AUDIO_BYTES }),
    async (req, res, next) => {
      try {
        const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
        const mimeType = req.headers['content-type'] ?? 'application/octet-stream';
        // No provider wired by default -> explicit unavailable state (not a fabricated transcript).
        const result = await transcribe({ bytes, mimeType });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  app.use((_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

  const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: status === 400 ? error.message : 'Internal assistant error' });
  };
  app.use(errors);
  return app;
}
