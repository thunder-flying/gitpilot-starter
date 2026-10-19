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

const labels: Record<string, string> = {
  summary: '摘要', title: '成果', module: '模块', technicalApproach: '技术方案',
  contribution: '实际贡献', impact: '影响（待校验）', resumeSentence: '简历描述',
};

// Preview only human-readable string fields. Incomplete JSON is never treated as a saved report.
export function reportPreview(json: string): { label: string; text: string }[] {
  const fields: { label: string; text: string }[] = [];
  const pattern = /"(summary|title|module|technicalApproach|contribution|impact|resumeSentence)"\s*:\s*"((?:[^"\\]|\\[\s\S])*)(?:"|$)/g;
  for (const match of json.matchAll(pattern)) {
    let raw = match[2];
    // A network chunk can stop in the middle of a JSON escape sequence.
    let text = '';
    while (raw) {
      try { text = JSON.parse(`"${raw}"`) as string; break; }
      catch { raw = raw.slice(0, -1); }
    }
    if (text) fields.push({ label: labels[match[1]], text });
  }
  return fields;
}
