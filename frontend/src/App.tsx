import { useState } from 'react';

type Achievement = {
  title: string;
  category: string;
  module: string;
  technicalApproach: string;
  contribution: string;
  impact: string;
  impactVerified: boolean;
  commitShas: string[];
  evidenceUrls: string[];
  resumeSentence: string;
};
type Analysis = {
  repo: string;
  author: string;
  commitCount: number;
  inspectedCount: number;
  truncated: boolean;
  result: { summary: string; limitations: string[]; items: Achievement[] };
};

function parseErrorResponse(text: string): string {
  try {
    const data = JSON.parse(text) as { message?: string | string[] };
    return Array.isArray(data.message) ? data.message.join('、') : (data.message || text);
  } catch { return text; }
}

export default function App() {
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function analyze() {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const until = new Date();
      const since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
      const response = await fetch('/api/reports/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: since.toISOString(), until: until.toISOString() }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(parseErrorResponse(text));
      setData(JSON.parse(text) as Analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally { setLoading(false); }
  }

  return <main>
    <header>
      <div className="brand">✦ GitPilot <span>AI Developer Achievements</span></div>
      <span className="tag">本地示例 · 只读 GitHub</span>
    </header>
    <section className="hero">
      <p className="eyebrow">AGENT WORKFLOW</p>
      <h1>把 Git 提交，变成可验证的工程成果</h1>
      <p>使用 AI Agent 自动读取 GitHub 代码变更，整理功能交付、技术方案和可追溯的贡献依据。</p>
      <button disabled={loading} onClick={analyze}>{loading ? '正在分析 Git 提交…' : '分析最近 7 天'}</button>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
    {data && <section className="report">
      <div className="section-heading"><h2>分析报告</h2><span>{data.repo} · {data.author}</span></div>
      <div className="stats">
        <div><strong>{data.commitCount}</strong><small>范围内提交</small></div>
        <div><strong>{data.inspectedCount}</strong><small>已检查 Diff</small></div>
        <div><strong>{data.result.items.length}</strong><small>识别工程成果</small></div>
      </div>
      <article className="summary">{data.result.summary}</article>
      {data.result.items.map((item, index) => <article key={index} className="achievement">
        <div className="title-line"><h3>{item.title}</h3><span className="pill">{item.category}</span></div>
        <p><b>模块：</b>{item.module}</p>
        <p><b>技术方案：</b>{item.technicalApproach}</p>
        <p><b>实际贡献：</b>{item.contribution}</p>
        <p><b>影响：</b>{item.impact} <em>{item.impactVerified ? '有直接依据' : '效果未经验证'}</em></p>
        <p><b>简历描述：</b>{item.resumeSentence}</p>
        <div className="links">{item.evidenceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer">Commit {item.commitShas[i].slice(0, 7)} ↗</a>)}</div>
      </article>)}
      {!!data.result.limitations.length && <article className="limitations"><h3>数据覆盖与验证限制</h3>
        <ul>{data.result.limitations.map((v, i) => <li key={i}>{v}</li>)}</ul></article>}
    </section>}
    <footer>GitPilot MVP · 仅供本地学习。生产部署前必须添加用户认证、限流和仓库授权。</footer>
  </main>;
}
