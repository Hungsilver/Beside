-- F13 "Đang trên đường về": một chuyến đi tới một địa điểm đã lưu.
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'ARRIVED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trips_coupleId_status_idx" ON "trips"("coupleId", "status");
CREATE INDEX "trips_userId_status_idx" ON "trips"("userId", "status");

ALTER TABLE "trips" ADD CONSTRAINT "trips_coupleId_fkey"
    FOREIGN KEY ("coupleId") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_placeId_fkey"
    FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
