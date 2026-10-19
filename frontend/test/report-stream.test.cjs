const { test } = require('node:test');
const assert = require('node:assert/strict');

test('SSE parser handles fragmented UTF-8, heartbeats and multiple events per chunk', async () => {
  const { readReportStream } = await import('../src/report-stream.ts');
  const text = ': heartbeat\r\n\r\ndata: {"type":"progress","message":"读取提交"}\r\n\r\ndata: {"type":"delta","text":"中文"}\n\ndata: {"type":"result","data":{"id":"ok"}}\n\n';
  const bytes = new TextEncoder().encode(text);
  const events = [];
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } }));
  await readReportStream(response, event => events.push(event));
  assert.equal(events[0].message, '读取提交');
  assert.equal(events[1].text, '中文');
  assert.equal(events[2].data.id, 'ok');
});

test('errors and prematurely closed streams are reported instead of completing', async () => {
  const { readReportStream } = await import('../src/report-stream.ts');
  await assert.rejects(readReportStream(new Response('data: {"type":"error","message":"余额不足"}\n\n'), () => {}), /余额不足/);
  await assert.rejects(readReportStream(new Response('data: {"type":"delta","text":"partial"}\n\n'), () => {}), /中断/);
});

test('draft preview renders partial JSON strings as readable report text', async () => {
  const { reportPreview } = await import('../src/report-stream.ts');
  assert.deepEqual(reportPreview('{"summary":"报告\\n第一行","items":[{"title":"新功能","technicalApproach":"还在生成'), [
    { label: '摘要', text: '报告\n第一行' }, { label: '成果', text: '新功能' }, { label: '技术方案', text: '还在生成' },
  ]);
  assert.deepEqual(reportPreview('{"summary":"中文\\u4e'), [{ label: '摘要', text: '中文' }]);
});
