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
  assert.deepEqual(reportPreview('{"summary":"报告\\n第一行","items":[{"title":"新功能","technicalApproach":"还在生成'), {
    summary: '报告\n第一行', limitations: [], items: [{ title: '新功能', technicalApproach: '还在生成' }],
  });
  assert.deepEqual(reportPreview('{"summary":"中文\\u4e'), { summary: '中文', limitations: [], items: [] });
});

test('partial reports preserve card boundaries regardless of field order or escaped content', async () => {
  const { reportPreview } = await import('../src/report-stream.ts');
  const draft = { summary: '包含 "title": "不要当成成果" 与 } 字符',
    limitations: ['只检查部分提交'], items: [
      { module: 'API', title: '第一项', contribution: '新增接口', category: 'feature' },
      { technicalApproach: '第二种方案', title: '第二项', impactVerified: true, evidenceUrls: ['https://untrusted.example'] },
    ] };
  const json = JSON.stringify(draft);
  const finalPreview = reportPreview(json);
  assert.deepEqual(finalPreview.items, [
    { module: 'API', title: '第一项', contribution: '新增接口', category: 'feature' },
    { technicalApproach: '第二种方案', title: '第二项' },
  ]);
  for (let i = 1; i <= json.length; i++) {
    const partial = reportPreview(json.slice(0, i));
    assert.ok(partial.items.length <= 2);
    partial.items.forEach((item, index) => {
      for (const [key, value] of Object.entries(item)) assert.ok(finalPreview.items[index][key].startsWith(value));
    });
    assert.ok(finalPreview.summary.startsWith(partial.summary));
  }
});

test('trailing escapes preserve already received text and limitations stream independently', async () => {
  const { reportPreview } = await import('../src/report-stream.ts');
  assert.equal(reportPreview('{"summary":"已生成\\').summary, '已生成');
  assert.deepEqual(reportPreview('{"limitations":["尚未检查完","下一条还在生成').limitations, ['尚未检查完', '下一条还在生成']);
  assert.deepEqual(reportPreview('{"items":[{"title":"一"},{"module":"二').items, [{ title: '一' }, { module: '二' }]);
});
