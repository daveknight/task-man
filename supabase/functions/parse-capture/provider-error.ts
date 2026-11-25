// Provider failures are logged here. The API key, the Authorization header, and the user's note are not.
const LOG_LIMIT = 2000;

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Blank or missing GEMINI_MODEL keeps the default. Callers must not log the override. */
export function resolveGeminiModel(override: string | undefined): string {
  const trimmed = override?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_GEMINI_MODEL;
}

/** Thrown after the provider body is already logged. Carries no body, key, or model name. */
export class ModelUnavailable extends Error {
  constructor() {
    super('model_unavailable');
    this.name = 'ModelUnavailable';
  }
}

function hasModelName(body: string): boolean {
  if (/\bmodels\/[A-Za-z0-9][A-Za-z0-9._-]*/.test(body)) return true;
  return /\bmodel\b[^A-Za-z0-9]{0,80}[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)+/i.test(body);
}

/** The provider retired this model, or answered 404 and named one. Other failures stay ordinary. */
export function isModelUnavailable(status: number, body: string): boolean {
  if (/\bmodels?\b/i.test(body) && /no longer available/i.test(body)) return true;
  return status === 404 && hasModelName(body);
}

type ProviderResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

function clip(detail: string): string {
  return detail.length > LOG_LIMIT ? detail.slice(0, LOG_LIMIT) : detail;
}

function redact(detail: string, secrets: readonly string[]): string {
  const hidden = secrets.filter((secret) => secret.length > 0).sort((a, b) => b.length - a.length);
  return hidden.reduce((out, secret) => out.split(secret).join('[redacted]'), detail);
}

function logProviderFailure(provider: string, status: number, detail: string, secrets: readonly string[]): void {
  console.error(provider, status, clip(redact(detail, secrets)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parsed model reply, or undefined when this is not a Gemini, Claude, or OpenAI reply. Throws if embedded JSON is invalid. */
function replyFromBody(body: unknown): unknown {
  if (!isRecord(body)) return undefined;
  if (body.candidates) {
    const first = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
    const content = isRecord(first) ? first.content : undefined;
    const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
    const joined = parts.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('');
    return JSON.parse(joined);
  }
  if (Array.isArray(body.content)) {
    const tool = body.content.find((part) => isRecord(part) && part.type === 'tool_use');
    if (isRecord(tool) && tool.input) return tool.input;
  }
  const first = Array.isArray(body.choices) ? body.choices[0] : undefined;
  const message = isRecord(first) ? first.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content === 'string') return JSON.parse(content);
  return undefined;
}

export async function readProviderReply(provider: string, res: ProviderResponse, secrets: readonly string[] = []): Promise<unknown> {
  const raw = await res.text();
  if (!res.ok) {
    logProviderFailure(provider, res.status, raw, secrets);
    if (isModelUnavailable(res.status, raw)) throw new ModelUnavailable();
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logProviderFailure(provider, res.status, raw, secrets);
    return null;
  }
  let reply: unknown;
  try {
    reply = replyFromBody(parsed);
  } catch {
    logProviderFailure(provider, res.status, raw, secrets);
    return null;
  }
  if (reply == null) {
    logProviderFailure(provider, res.status, raw, secrets);
    return null;
  }
  return reply;
}

/** A thrown call has no response body. Log the provider name and the error message, with the same cap. */
export function logThrownProviderError(provider: string, error: unknown, secrets: readonly string[] = []): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(provider, clip(redact(message, secrets)));
}
