// capture-schema-1
// Turns a capture note into JSON. The key stays in this function's environment.
// No key, no call: the app shows that capture isn't set up and saves nothing.
import schema from './capture-schema.json' with { type: 'json' };

const SCHEMA_ID = 'capture-schema-1';
const MAX_CHARS = 4000;
const MAX_TAGS = 100;
const RATE_PER_MINUTE = 15;

const RULES =
  "You can only create new tasks. If the note asks to update, complete, delete, or add a note on a task that already exists, set confidence to low and actions to an empty list. Do not invent a new task for that. If you are not sure what to add, set confidence to low and actions to an empty list. Never guess a task. The summary is one short sentence reading what they asked for, not a transcript. Dates are YYYY-MM-DD. A start date is the day an Open task becomes ready, and only an Open task has one. Hide until is a Waiting task's own date, and only a Waiting task has one. The due date is the deadline. Waiting on someone means status waiting. The start date has to be on or before the due date. Hide until may be after the due date. A repeat needs a due date. Use an existing tag name when one fits.";

const PROVIDERS = {
  gemini: { env: 'GEMINI_API_KEY', model: 'gemini-2.5-flash' },
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

async function readModel(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  const body = await res.json();
  if (body?.candidates) {
    const text = (body.candidates[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? '').join('');
    return JSON.parse(text);
  }
  const tool = (body?.content ?? []).find((part: { type?: string }) => part.type === 'tool_use');
  if (tool?.input) return tool.input;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return JSON.parse(content);
  return null;
}

async function callProvider(name: keyof typeof PROVIDERS, key: string, prompt: string): Promise<unknown> {
  const model = PROVIDERS[name].model;
  if (name === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema },
      }),
    });
    return readModel(res);
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
        tools: [{ name: 'capture', description: 'Proposed new tasks', input_schema: schema }],
        tool_choice: { type: 'tool', name: 'capture' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    return readModel(res);
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
  return readModel(res);
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

  try {
    const reply = await callProvider(name, key, promptFor(text, body.today, timeZone, tags));
    if (!reply || typeof reply !== 'object') return json({ error: 'provider_error' }, 502);
    return json(reply);
  } catch {
    return json({ error: 'provider_error' }, 502);
  }
});
