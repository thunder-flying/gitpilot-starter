-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL, -- 主键 ID
    "repo" TEXT NOT NULL, -- 仓库标识
    "author" TEXT NOT NULL, -- 作者
    "since" TIMESTAMP(3) NOT NULL, -- 统计起始时间
    "until" TIMESTAMP(3) NOT NULL, -- 统计结束时间
    "summary" TEXT NOT NULL, -- 周报摘要
    "result" JSONB NOT NULL, -- 周报结构化结果（JSON）
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    "updatedAt" TIMESTAMP(3) NOT NULL, -- 更新时间

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id"), -- 主键约束
);

-- CreateIndex
CREATE INDEX "WeeklyReport_updatedAt_idx" ON "WeeklyReport"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_repo_author_since_until_key" ON "WeeklyReport"("repo", "author", "since", "until");

-- Comments
COMMENT ON COLUMN "WeeklyReport"."id" IS '主键 ID';
COMMENT ON COLUMN "WeeklyReport"."repo" IS '仓库标识';
COMMENT ON COLUMN "WeeklyReport"."author" IS '作者';
COMMENT ON COLUMN "WeeklyReport"."since" IS '统计起始时间';
COMMENT ON COLUMN "WeeklyReport"."until" IS '统计结束时间';
COMMENT ON COLUMN "WeeklyReport"."summary" IS '周报摘要';
COMMENT ON COLUMN "WeeklyReport"."result" IS '周报结构化结果（JSON）';
COMMENT ON COLUMN "WeeklyReport"."createdAt" IS '创建时间';
COMMENT ON COLUMN "WeeklyReport"."updatedAt" IS '更新时间';
