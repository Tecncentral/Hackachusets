import express from 'express';
import { ZodError } from 'zod';
import {
  evaluateHybrid,
  transcribe,
  transcriptionAvailability,
  providerFromEnv,
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

  // Accepts EITHER a raw audio body (Content-Type: audio/*) OR multipart/form-data
  // with an `audio` (or `file`) field — the shape the website uploads and the
  // platform forwards. Audio is held in memory for this request only, never logged
  // or stored. A live provider is used only when configured server-side.
  app.post(
    '/transcribe',
    express.raw({ type: ['audio/*', 'application/octet-stream', 'multipart/form-data'], limit: MAX_AUDIO_BYTES }),
    async (req, res, next) => {
      try {
        const contentType = req.headers['content-type'] ?? 'application/octet-stream';
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        let bytes = new Uint8Array(body);
        let mimeType = contentType;
        if (contentType.startsWith('multipart/form-data')) {
          // Parse with the built-in Web API; no extra dependency.
          const form = await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData();
          const file = form.get('audio') ?? form.get('file');
          if (!(file instanceof Blob)) {
            res.json({ transcript: '', mode: 'unavailable', warnings: ['No `audio` file field in the upload.'] });
            return;
          }
          bytes = new Uint8Array(await file.arrayBuffer());
          mimeType = file.type || 'application/octet-stream';
        }
        if (!/^(audio|video)\/|application\/octet-stream/.test(mimeType)) {
          res.status(415).json({ transcript: '', mode: 'unavailable', warnings: [`Unsupported audio type: ${mimeType}`] });
          return;
        }
        const result = await transcribe({ bytes, mimeType }, { provider: providerFromEnv() });
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
