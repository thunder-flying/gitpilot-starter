const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ReportsController } = require('../dist/reports.controller');

test('HTTP stream flushes progress before completion, returns errors and aborts on disconnect', async () => {
  let release;
  let mode = 'success';
  let disconnected;
  const disconnectedPromise = new Promise(resolve => { disconnected = resolve; });
  const service = { analyze: async (_since, _until, emit, signal) => {
    emit({ type: 'progress', message: '正在读取提交' });
    if (mode === 'error') throw Object.assign(new Error('upstream secret details'), { status: 402 });
    if (mode === 'disconnect') {
      await new Promise(resolve => signal.addEventListener('abort', () => { disconnected(); resolve(); }, { once: true }));
      return;
    }
    await new Promise(resolve => { release = resolve; });
    emit({ type: 'delta', text: '报告' });
    return { id: 'saved' };
  } };
  const controller = new ReportsController(service);
  controller.logger = { error() {} };
  const server = http.createServer((_req, res) => { void controller.stream({}, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(url, { method: 'POST' });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /progress/);
    assert.doesNotMatch(first, /result/);
    release();
    let rest = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    assert.match(rest, /"type":"delta"/);
    assert.match(rest, /"type":"result","data":\{"id":"saved"\}/);
    mode = 'error';
    const failure = await (await fetch(url, { method: 'POST' })).text();
    assert.match(failure, /余额不足/);
    assert.doesNotMatch(failure, /secret|"type":"result"/);
    mode = 'disconnect';
    const abort = new AbortController();
    const pending = await fetch(url, { method: 'POST', signal: abort.signal });
    await pending.body.getReader().read();
    abort.abort();
    await disconnectedPromise;
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
