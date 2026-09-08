-- Trạng thái hiện tại của một người với một hàng rào (Phase 4, F6).
-- Cần bảng riêng chứ không suy từ GeofenceEvent gần nhất: mỗi điểm vị trí gửi lên
-- đều phải trả lời "đang ở trong hay ngoài", mà truy vấn "sự kiện mới nhất theo
-- từng địa điểm" là câu khó và tốn. Bảng này chỉ vài dòng mỗi người.
-- CreateTable
CREATE TABLE "geofence_states" (
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "inside" BOOLEAN NOT NULL DEFAULT false,
    "candidateSince" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofence_states_pkey" PRIMARY KEY ("userId","placeId")
);

-- AddForeignKey
ALTER TABLE "geofence_states" ADD CONSTRAINT "geofence_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_states" ADD CONSTRAINT "geofence_states_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

