-- F14 Theo dõi chu kỳ kinh nguyệt. Dữ liệu sức khoẻ: mặc định KHÔNG chia sẻ.
CREATE TYPE "CycleShareLevel" AS ENUM ('OFF', 'SUMMARY', 'FULL');

CREATE TABLE "cycle_settings" (
    "userId" TEXT NOT NULL,
    "shareLevel" "CycleShareLevel" NOT NULL DEFAULT 'OFF',
    "avgCycleDays" INTEGER,
    "avgPeriodDays" INTEGER,
    "remindMe" BOOLEAN NOT NULL DEFAULT true,
    "remindPartner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_settings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "period_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "period_entries_userId_startDate_key" ON "period_entries"("userId", "startDate");
CREATE INDEX "period_entries_userId_startDate_idx" ON "period_entries"("userId", "startDate");

ALTER TABLE "cycle_settings" ADD CONSTRAINT "cycle_settings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "period_entries" ADD CONSTRAINT "period_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
