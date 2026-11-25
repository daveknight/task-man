// capture-schema-2
// Turns a capture note into JSON. The key stays in this function's environment.
// No key, no call: the app shows that capture isn't set up and saves nothing.
// The note, today's date, the time zone, and tag names are the only board facts sent on.
import schema from './capture-schema.json' with { type: 'json' };
import { logThrownProviderError, ModelUnavailable, readProviderReply, resolveGeminiModel } from './provider-error.ts';

const SCHEMA_ID = 'capture-schema-2';
const MAX_CHARS = 4000;
const MAX_TAGS = 100;
const RATE_PER_MINUTE = 15;

const RULES =
  'You can create a task, update an existing task, or add a note to an existing task. You are not shown the task list. You never receive task titles, descriptions, or ids. For an update or a note, set match to a short title hint such as follow up with Dan. Never include an id. Do not decide whether a task exists. Do not set confidence to low only because the list is hidden. If you are not sure what to do, set confidence to low and actions to an empty list. Never guess a task. Do not create a task when the note asks to update one or to add a note. If the note only asks to complete, delete, or flag a task, or to change its subtasks, set confidence to low and actions to an empty list. The summary is one short sentence reading what they asked for, not a transcript. Dates are YYYY-MM-DD. A start date is the day an Open task becomes ready, and only an Open task has one. Hide until is the date on a Waiting task, and only a Waiting task has one. The due date is the deadline. Waiting on someone means status waiting. The start date has to be on or before the due date. Hide until may be after the due date. A repeat needs a due date. Use an existing tag name when one fits. An update lists only the fields that change. Note text is added to the description and does not replace it.';

const PROVIDERS = {
  gemini: { env: 'GEMINI_API_KEY', model: 'gemini-3.8-flash' },
  claude: { env: 'ANTHROPIC_API_KEY', model: 'claude-haiku-4-5' },
  openai: { env: 'OPENAI_API_KEY', model: 'gpt-4.1-mini' },
} as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const hits = new Map<string, number[]>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function payload(header: string | null): { sub?: string; role?: string } | null {
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const part = header.slice(7).trim().split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= RATE_PER_MINUTE) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

function promptFor(text: string, today: string, timeZone: string, tags: string[]): string {
  const [year, month, day] = today.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year!, (month ?? 1) - 1, day)).getUTCDay()] ?? '';
  return [
    `Today is ${weekday}, ${today}. The time zone is ${timeZone}.`,
    RULES,
    `Existing tags: ${tags.length > 0 ? tags.join(', ') : 'none'}.`,
    '',
    text,
  ].join('\n');
}

function providerName(value: unknown): keyof typeof PROVIDERS {
  return value === 'claude' || value === 'openai' || value === 'gemini' ? value : 'gemini';
}

function modelFor(name: keyof typeof PROVIDERS): string {
  if (name === 'gemini') return resolveGeminiModel(Deno.env.get('GEMINI_MODEL'));
  return PROVIDERS[name].model;
}

async function callProvider(name: keyof typeof PROVIDERS, key: string, model: string, prompt: string, secrets: readonly string[]): Promise<unknown> {
  if (name === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema },
      }),
    });
    return readProviderReply(name, res, secrets);
  }
  if (name === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: 0,
        tools: [{ name: 'capture', description: 'Proposed creates, updates, and notes', input_schema: schema }],
        tool_choice: { type: 'tool', name: 'capture' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    return readProviderReply(name, res, secrets);
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: { name: 'capture', strict: false, schema } },
    }),
  });
  return readProviderReply(name, res, secrets);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'provider_error' }, 405);

  const claims = payload(req.headers.get('Authorization'));
  if (!claims?.sub || claims.role !== 'authenticated') return json({ error: 'unauthorized' }, 401);
  if (limited(claims.sub)) return json({ error: 'rate_limited' }, 429);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object') return json({ error: 'provider_error' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'provider_error' }, 400);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: 'empty' }, 400);
  if (text.length > MAX_CHARS) return json({ error: 'too_long' }, 413);
  if (typeof body.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.today)) return json({ error: 'provider_error' }, 400);
  const timeZone = typeof body.timeZone === 'string' && body.timeZone.length <= 100 ? body.timeZone : 'UTC';
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '').map((tag) => tag.trim().slice(0, 30)).slice(0, MAX_TAGS)
    : [];

  const name = providerName(body.provider);
  const key = Deno.env.get(PROVIDERS[name].env);
  if (!key) return json({ error: 'not_configured', schema: SCHEMA_ID }, 501);

  const model = modelFor(name);
  // Logs drop the model along with the key and the note. The response names the model only when it is unavailable.
  const secrets = [key, `Bearer ${key}`, text, model];
  try {
    const reply = await callProvider(name, key, model, promptFor(text, body.today, timeZone, tags), secrets);
    if (!reply || typeof reply !== 'object') return json({ error: 'provider_error' }, 502);
    return json(reply);
  } catch (error) {
    if (error instanceof ModelUnavailable) return json({ error: 'model_unavailable', model }, 502);
    logThrownProviderError(name, error, secrets);
    return json({ error: 'provider_error' }, 502);
  }
});
