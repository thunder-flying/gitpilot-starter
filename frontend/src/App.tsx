import { useEffect, useMemo, useRef, useState } from 'react';
import { readReportStream, reportPreview } from './report-stream';

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

export default function App() {
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const preview = useMemo(() => reportPreview(draft), [draft]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function analyze() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    setData(null);
    setDraft('');
    setStatus('正在连接分析服务…');
    let text = '';
    let frame = 0;
    try {
      const until = new Date();
      const since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
      const response = await fetch('/api/reports/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ since: since.toISOString(), until: until.toISOString() }),
        signal: controller.signal,
      });
      await readReportStream(response, event => {
        if (event.type === 'progress') setStatus(event.message);
        if (event.type === 'delta') {
          text += event.text;
          setStatus('正在生成报告…');
          if (!frame) frame = requestAnimationFrame(() => { setDraft(text); frame = 0; });
        }
        if (event.type === 'result') {
          setData(event.data as Analysis);
          setStatus('分析完成，报告已保存');
        }
      });
    } catch (err) {
      if (controller.signal.aborted) setStatus('已停止分析');
      else {
        setStatus('分析未完成');
        setError(err instanceof Error ? err.message : '请求失败');
      }
    } finally {
      cancelAnimationFrame(frame);
      setDraft(text);
      activeRequest.current = null;
      setLoading(false);
    }
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
      {loading && <button className="cancel" onClick={() => activeRequest.current?.abort()}>停止分析</button>}
      {status && <p role="status" aria-live="polite" className="stream-status">{status}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
    {!data && preview.length > 0 && <section className="draft" aria-label="报告生成预览" aria-busy={loading}>
      <div className="section-heading"><h2>{loading ? '报告正在生成' : '未完成的报告'}</h2><span>预览内容 · 尚未校验保存</span></div>
      <article className="summary">{preview.map((field, index) => <p key={index}><b>{field.label}：</b>{field.text}</p>)}</article>
    </section>}
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
