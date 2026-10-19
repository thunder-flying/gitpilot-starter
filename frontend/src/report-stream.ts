export type ReportEvent =
  | { type: 'progress'; message: string }
  | { type: 'delta'; text: string }
  | { type: 'result'; data: unknown }
  | { type: 'error'; message: string };

export async function readReportStream(response: Response, onEvent: (event: ReportEvent) => void) {
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try { message = JSON.parse(text).message || text; } catch { /* Proxy errors may be plain text. */ }
    throw new Error(message || `请求失败（${response.status}）`);
  }
  if (!response.body) throw new Error('浏览器无法读取流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Handle CRLF only after framing so a CR/LF split across chunks remains valid.
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const event = JSON.parse(data) as ReportEvent;
        if (event.type === 'error') throw new Error(event.message);
        onEvent(event);
        if (event.type === 'result') { finished = true; break; }
      }
      if (done && !finished) throw new Error('分析连接已中断，请重试。');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const itemFields = ['title', 'category', 'module', 'technicalApproach', 'contribution', 'impact', 'resumeSentence'] as const;
export type DraftAchievement = Partial<Record<typeof itemFields[number], string>>;
export type DraftReport = { summary: string; limitations: string[]; items: DraftAchievement[] };
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Parse the received prefix without inventing missing text or merging separate objects.
// This is for display only; the server still validates the complete report before saving.
function partialJson(source: string): JsonValue | undefined {
  let position = 0;
  const whitespace = () => { while (/\s/.test(source[position] ?? '') && position < source.length) position++; };
  function string(): { value: string; complete: boolean } {
    const start = ++position;
    while (position < source.length) {
      if (source[position] === '\\') { position += 2; continue; }
      if (source[position] === '"') {
        const raw = source.slice(start, position++);
        return { value: JSON.parse(`"${raw}"`) as string, complete: true };
      }
      position++;
    }
    let raw = source.slice(start);
    // Drop only the unfinished escape, preserving all preceding text.
    while (raw) {
      try { return { value: JSON.parse(`"${raw}"`) as string, complete: false }; }
      catch { raw = raw.slice(0, -1); }
    }
    return { value: '', complete: false };
  }
  function value(depth: number): JsonValue | undefined {
    whitespace();
    if (depth > 24 || position >= source.length) return undefined;
    if (source[position] === '"') return string().value;
    if (source[position] === '{') {
      position++;
      const object: Record<string, JsonValue> = Object.create(null);
      while (position < source.length) {
        whitespace();
        if (source[position] === '}') { position++; break; }
        if (source[position] !== '"') break;
        const key = string();
        whitespace();
        if (!key.complete || source[position] !== ':') break;
        position++;
        const child = value(depth + 1);
        if (child === undefined) break;
        object[key.value] = child;
        whitespace();
        if (source[position] !== ',') {
          if (source[position] === '}') position++;
          break;
        }
        position++;
      }
      return object;
    }
    if (source[position] === '[') {
      position++;
      const array: JsonValue[] = [];
      while (position < source.length) {
        whitespace();
        if (source[position] === ']') { position++; break; }
        const child = value(depth + 1);
        if (child === undefined) break;
        array.push(child);
        whitespace();
        if (source[position] !== ',') {
          if (source[position] === ']') position++;
          break;
        }
        position++;
      }
      return array;
    }
    const token = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(position));
    if (!token) return undefined;
    position += token[0].length;
    return JSON.parse(token[0]) as JsonValue;
  }
  try { return value(0); } catch { return undefined; }
}

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function reportPreview(json: string): DraftReport {
  const value = partialJson(json);
  if (!isObject(value)) return { summary: '', limitations: [], items: [] };
  return {
    summary: typeof value.summary === 'string' ? value.summary : '',
    limitations: Array.isArray(value.limitations) ? value.limitations.filter((v): v is string => typeof v === 'string') : [],
    items: Array.isArray(value.items) ? value.items.filter(isObject).map(item => {
      const draft: DraftAchievement = {};
      for (const key of itemFields) if (typeof item[key] === 'string') draft[key] = item[key];
      return draft;
    }) : [],
  };
}
