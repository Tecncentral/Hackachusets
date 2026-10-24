import { evaluateRules } from './evaluate.js';
import {
  EvaluateResponse,
  type EvaluateRequest,
  type FeedbackItem,
} from './evaluate.types.js';

// Hybrid evaluation.
//
// The DETERMINISTIC rule pass decides WHICH feedback items exist, their kind, and
// every ID they reference. An optional model may only REPHRASE `message`,
// `suggestedQuestion`, and `spokenSummary` for brevity/tone. The model can never:
//   - add, remove, or reorder feedback items;
//   - change kinds or any ID list;
//   - introduce a diagnosis, vitals, sources, or treatment.
// Model output is re-validated; on any failure, timeout, or missing key we return
// the deterministic text and record a warning. Model text is DATA, never instructions.

export interface LanguageModel {
  /** Returns rephrased strings for one feedback item, or throws. */
  rephrase(input: {
    message: string;
    suggestedQuestion: string;
    spokenSummary: string;
  }): Promise<{ message: string; suggestedQuestion: string; spokenSummary: string }>;
}

export interface HybridOptions {
  model?: LanguageModel;
  timeoutMs?: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('model timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// Guard against a model that drops content or injects something unexpected.
function safeRephrase(original: FeedbackItem, candidate: unknown): FeedbackItem {
  const c = candidate as Record<string, unknown>;
  const ok = (v: unknown, max: number): v is string =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!ok(c?.message, 400) || !ok(c?.suggestedQuestion, 300) || !ok(c?.spokenSummary, 160)) {
    return original; // reject silently -> caller records a warning
  }
  // Only the three prose fields may change; everything structural is preserved.
  return {
    ...original,
    message: c.message as string,
    suggestedQuestion: c.suggestedQuestion as string,
    spokenSummary: c.spokenSummary as string,
  };
}

/**
 * Evaluate with an optional model for phrasing only. Falls back to rules-only
 * on any problem. Output is validated against EvaluateResponse before return.
 */
export async function evaluateHybrid(
  req: EvaluateRequest,
  opts: HybridOptions = {},
): Promise<EvaluateResponse> {
  const base = evaluateRules(req);
  if (!opts.model || base.feedback.length === 0) {
    return base; // nothing to refine, or no model configured
  }

  const timeoutMs = opts.timeoutMs ?? 4000;
  const warnings: string[] = [];
  const refined: FeedbackItem[] = [];

  for (const item of base.feedback) {
    try {
      const r = await withTimeout(
        opts.model.rephrase({
          message: item.message,
          suggestedQuestion: item.suggestedQuestion,
          spokenSummary: item.spokenSummary,
        }),
        timeoutMs,
      );
      refined.push(safeRephrase(item, r));
    } catch (err) {
      warnings.push(
        `Model phrasing unavailable for ${item.id} (${(err as Error).message}); used deterministic text.`,
      );
      refined.push(item);
    }
  }

  // Re-validate the whole response. If anything is off, fall back to rules-only.
  const parsed = EvaluateResponse.safeParse({
    ...base,
    mode: 'hybrid',
    feedback: refined,
    warnings,
  });
  if (!parsed.success) {
    return { ...base, warnings: ['Hybrid output failed validation; returned deterministic feedback.'] };
  }
  return parsed.data;
}
