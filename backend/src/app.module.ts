import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubService } from './github.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from './prisma.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [ReportsController],
  providers: [GithubService, ReportsService, PrismaService],
})
export class AppModule {}
