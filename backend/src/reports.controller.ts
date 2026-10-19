import { Body, Controller, Get, Post } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) { }

  @Post('analyze')
  analyze(@Body() body: { since?: string; until?: string }) {
    return this.reports.analyze(body?.since ?? '', body?.until ?? '');
  }

  @Get()
  list() { return this.reports.list(); }
}
