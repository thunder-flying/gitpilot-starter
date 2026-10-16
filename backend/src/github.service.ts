import { Injectable } from '@nestjs/common';

interface CommitEntry {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface CommitDetail {
  sha: string;
  html_url: string;
  files?: CommitFile[];
  stats?: { total: number; additions: number; deletions: number };
}

@Injectable()
export class GithubService {
  private readonly owner = required('GITHUB_OWNER');
  private readonly repo = required('GITHUB_REPO');
  private readonly author = required('GITHUB_AUTHOR');
  private readonly token = process.env.GITHUB_TOKEN || '';

  repoName() { return `${this.owner}/${this.repo}`; }
  authorName() { return this.author; }
  commitUrl(sha: string) {
    return `https://github.com/${this.owner}/${this.repo}/commit/${sha}`;
  }

  private async githubGet<T>(path: string, params?: URLSearchParams): Promise<T> {
    const url = new URL(`https://api.github.com${path}`);
    if (params) url.search = params.toString();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GitPilot/0.1',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json() as Promise<T>;
  }

  async listCommits(since: string, until: string) {
    const commits: CommitEntry[] = [];
    let truncated = false;
    for (let page = 1; page <= 2; page++) {
      const params = new URLSearchParams({
        author: this.author,
        since,
        until,
        per_page: '100',
        page: String(page),
      });
      const chunk = await this.githubGet<CommitEntry[]>(
        `/repos/${this.owner}/${this.repo}/commits`, params,
      );
      commits.push(...chunk);
      if (chunk.length < 100) break;
      if (page === 2) truncated = true;
    }
    // Cap by intent: the MVP handles at most 40 commits per run.
    truncated ||= commits.length > 40;
    return {
      commits: commits.slice(0, 40).map((x) => ({
        sha: x.sha,
        message: x.commit.message.split('\n')[0],
        date: x.commit.author?.date ?? null,
        url: x.html_url,
      })),
      truncated,
    };
  }

  async getCommitDiff(sha: string) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid Git SHA');
    const data = await this.githubGet<CommitDetail>(
      `/repos/${this.owner}/${this.repo}/commits/${sha}`,
      new URLSearchParams({ per_page: '100', page: '1' }),
    );
    return {
      sha: data.sha,
      url: data.html_url,
      stats: data.stats,
      filesTruncated: (data.files?.length ?? 0) >= 100,
      files: (data.files ?? []).slice(0, 15).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: (f.patch || '[binary, omitted or too large]').slice(0, 1500),
      })),
      note: 'At most the first 15 files, 1500 patch characters each. Never infer unshown changes.',
    };
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !/^[a-zA-Z0-9_.-]+$/.test(value)) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return value;
}
