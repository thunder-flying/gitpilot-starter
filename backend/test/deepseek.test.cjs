const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ReportsService } = require('../dist/reports.service');

test('DeepSeek uses chat completions, executes tools and validates JSON before saving', async () => {
  const sha = 'a'.repeat(40);
  const requests = [];
  let invalid = false;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    requests.push({ url: req.url, data, authorization: req.headers.authorization });
    const toolResult = data.messages.some(m => m.role === 'tool');
    const message = toolResult || invalid
      ? { role: 'assistant', content: JSON.stringify(invalid ? { summary: 123 } : {
        summary: '测试报告', limitations: [], items: [{ title: '功能', category: 'feature',
          module: 'api', technicalApproach: '实现接口', contribution: '增加接口', impact: '未验证',
          impactVerified: true, commitShas: [sha, 'b'.repeat(40)], resumeSentence: '实现接口' }],
      }) }
      : { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function',
        function: { name: 'inspect_commit', arguments: JSON.stringify({ sha }) } }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: 'mock', object: 'chat.completion', created: 1,
      model: 'mock-model', choices: [{ index: 0, message,
        finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = Object.fromEntries(['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${server.address().port}`, DEEPSEEK_MODEL: 'mock-model' });
  let saves = 0;
  const github = { listCommits: async () => ({ commits: [{ sha }], truncated: false }),
    getCommitDiff: async () => ({ sha, files: [] }), repoName: () => 'test/repo',
    authorName: () => 'test', commitUrl: value => `https://github.com/test/repo/commit/${value}` };
  const prisma = { weeklyReport: { upsert: async ({ create }) => { saves++; return { id: 'saved', ...create }; } } };
  try {
    const service = new ReportsService(github, prisma);
    const since = new Date(Date.now() - 86400000).toISOString();
    const until = new Date().toISOString();
    const result = await service.analyze(since, until);
    assert.equal(result.inspectedCount, 1);
    assert.deepEqual(result.result.items[0].commitShas, [sha]);
    assert.equal(result.result.items[0].impactVerified, false);
    assert.equal(saves, 1);
    for (const request of requests) {
      assert.equal(request.url, '/chat/completions');
      assert.equal(request.authorization, 'Bearer test-key');
      assert.equal(request.data.model, 'mock-model');
      assert.deepEqual(request.data.response_format, { type: 'json_object' });
      assert.deepEqual(request.data.thinking, { type: 'disabled' });
    }
    invalid = true;
    await assert.rejects(service.analyze(since, until));
    assert.equal(saves, 1, 'invalid reports must never be saved');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise(resolve => server.close(resolve));
  }
});
