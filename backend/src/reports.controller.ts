import { Body, Controller, Get, HttpException, Logger, Post, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);
  constructor(private readonly reports: ReportsService) { }

  @Post('analyze')
  analyze(@Body() body: { since?: string; until?: string }) {
    return this.reports.analyze(body?.since ?? '', body?.until ?? '');
  }

  @Post('analyze/stream')
  async stream(@Body() body: { since?: string; until?: string }, @Res() response: ServerResponse) {
    const abort = new AbortController();
    const onClose = () => abort.abort();
    response.on('close', onClose);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const send = (event: unknown) => {
      if (!response.destroyed && !response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) response.write(': heartbeat\n\n');
    }, 15000);
    try {
      const data = await this.reports.analyze(body?.since ?? '', body?.until ?? '', send, abort.signal);
      if (!abort.signal.aborted) send({ type: 'result', data });
    } catch (error) {
      if (!abort.signal.aborted) {
        this.logger.error(error instanceof Error ? error.message : 'Analysis failed');
        send({ type: 'error', message: analysisErrorMessage(error) });
      }
    } finally {
      clearInterval(heartbeat);
      response.off('close', onClose);
      response.end();
    }
  }

  @Get()
  list() { return this.reports.list(); }
}

function analysisErrorMessage(error: unknown): string {
  if (error instanceof HttpException) return error.message;
  const status = (error as { status?: number } | null)?.status;
  if (status === 402) return 'DeepSeek API 余额不足，请充值后重试。';
  if (status === 401) return 'DeepSeek API Key 无效，请检查配置并重启后端。';
  if (status === 429) return '模型服务请求受限，请检查额度或稍后重试。';
  if (error instanceof Error && /timeout|timed out/i.test(error.name + error.message)) {
    return '模型服务连接超时，请检查网络后重试。';
  }
  return '分析失败，请检查后端日志后重试。';
}
