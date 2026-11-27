import type { ServerResponse } from 'node:http';

/** Writes a web Response onto a Node response, including a streamed body. */
export async function writeNodeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers = new Map<string, string[]>();
  response.headers.forEach((value, key) => {
    const list = headers.get(key) ?? [];
    list.push(value);
    headers.set(key, list);
  });
  const flat: Record<string, string | string[]> = {};
  for (const [key, values] of headers) flat[key] = values.length === 1 ? values[0]! : values;
  res.writeHead(response.status, flat);
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(Buffer.from(value))) await new Promise((resolve) => res.once('drain', resolve));
  }
  res.end();
}
