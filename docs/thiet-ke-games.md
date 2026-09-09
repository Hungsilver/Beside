# Thiết kế — Tiến lên miền Nam & Cờ caro cho 2 người

> **Trạng thái (09/09): ĐÃ CODE XONG cả hai game.**
> Schema, API/WS và ADR đã chuyển sang `ARCHITECTURE.md` (§6.5–6.7, §7.1, §7.2, §7.4, §10)
> đúng theo R0. File này giữ lại phần **luật chơi chi tiết** — nguồn tra cứu khi sửa luật.

- Ngày: 2026-09-09
- Chức năng mới: **F10 — Tiến lên miền Nam**, **F11 — Cờ caro**
- Nền tảng dùng lại: NestJS · Prisma/Postgres · Socket.IO · React 19 · Web Push (đã có sẵn từ Phase 1–4)

---

## 1. Bốn quyết định đã chốt

| # | Điểm | Chốt | Hệ quả |
|---|---|---|---|
| Q1 | Chia bài Tiến lên | **13 lá mỗi người, 26 lá còn lại bỏ ra** | Ván ~4–6 phút. Không đếm được bài đối phương ⇒ luật "thối bài" mất ý nghĩa, càng hợp với Q2 |
| Q2 | Phạm vi luật | **Cơ bản + chặt heo** | Không làm: tới trắng, thối bài/đền, ăn tiền theo số lá còn lại → ghi `docs/BACKLOG.md` |
| Q3 | Đồng hồ | **30 giây mỗi lượt** | Xem §5 — cần cơ chế tạm dừng, nếu không sẽ phạt oan người bị iOS treo |
| Q4 | Luật caro | **Luật Việt Nam: đúng 5 quân mà bị chặn hai đầu thì không thắng; từ 6 quân trở lên thắng dù bị chặn** | Thêm 4 case biên so với gomoku thường |

### 1.1 Một lưu ý về Q3

Tôi đã khuyến nghị **không giới hạn thời gian**, chủ dự án chốt **30 giây**. Làm theo,
nhưng phải thiết kế quanh ràng buộc §1.3 của `ARCHITECTURE.md`:

> iOS Safari treo JavaScript ngay khi chuyển tab hoặc khoá màn hình.

Đồng hồ 30 giây chạy thẳng sẽ khiến **người khoá màn hình 40 giây bị xử thua oan** — và
đó là loại lỗi làm người ta bỏ tính năng luôn. Cách xử lý ở §5: **đồng hồ chỉ chạy khi
người tới lượt thật sự đang mở app**, ẩn app thì dừng lại. Nhịp 30 giây vẫn giữ nguyên
với hai người đang ngồi chơi thật.

### 1.2 Ngoài phạm vi

- Chơi với người lạ / phòng công khai — app này chỉ có 2 người trong một `couple`.
- Xem lại ván cũ theo từng nước (lưu `GameMove` nhưng chưa làm màn phát lại).
- Chat trong ván — F9 đã chốt không làm chat, ván bài không phải ngoại lệ.
- Máy chơi (AI) — không có nhu cầu, hai người chơi với nhau.

---

## 2. Nguyên tắc số một: server là trọng tài duy nhất

Game bài khác mọi tính năng đã làm ở chỗ **có thứ phải giấu**. Ba luật cứng:

1. **Bài trên tay không bao giờ rời server nguyên vẹn.** Mỗi lượt đọc state đều đi qua
   `toClientState(game, viewerId)` — người xem thấy bài của mình, còn của đối phương chỉ
   thấy **số lá**. Không có đường nào khác lấy được `state` thô.
2. **Mọi nước đi được kiểm ở server.** Client kiểm trước chỉ để báo lỗi cho nhanh; server
   kiểm lại từ đầu và không tin gì từ client ngoài `gameId` + nội dung nước đi.
3. **Xáo bài bằng `crypto.randomInt`**, Fisher–Yates. `Math.random()` đoán được trạng thái
   sau vài chục mẫu — với bài úp thì đó là lỗ hổng thật, không phải lý thuyết.

Đây là bản sao của R3 áp cho dữ liệu ván bài: kiểm quyền theo `coupleId` ở **tầng service**,
không tin client.

---

## 3. Mô hình dữ liệu

```prisma
enum GameKind {
  TIEN_LEN
  CARO
}

enum GameStatus {
  PLAYING
  FINISHED
  ABANDONED   // huỷ ghép đôi hoặc bỏ dở quá lâu
}

/// Một ván. Toàn bộ diễn biến nằm trong `state` (JSON) — mỗi loại game một khuôn,
/// xem §4. Cố tình KHÔNG tách bảng riêng cho bài/bàn cờ: hai game có hình dạng dữ
/// liệu khác hẳn nhau, ép chung một lược đồ quan hệ chỉ tạo ra bảng đầy cột NULL.
model Game {
  id       String     @id @default(uuid())
  coupleId String
  couple   Couple     @relation(fields: [coupleId], references: [id], onDelete: Cascade)
  kind     GameKind
  status   GameStatus @default(PLAYING)

  /// Trạng thái ván. CHỨA BÀI ÚP — không bao giờ trả thẳng ra client.
  state Json

  turnUserId String?
  turnUser   User?   @relation("GameTurn", fields: [turnUserId], references: [id])

  /// Mốc hết giờ của lượt hiện tại. NULL = đồng hồ đang TẠM DỪNG (§5).
  turnDeadlineAt DateTime?
  /// Còn lại bao nhiêu mili-giây khi tạm dừng. Chạy tiếp thì cộng từ đây.
  turnRemainingMs Int @default(30000)

  winnerId String?
  winner   User?   @relation("GameWinner", fields: [winnerId], references: [id])
  /// HET_BAI | DU_QUAN | HET_GIO | DAU_HANG | HOA | BO_DO
  endReason String?

  /// Khoá lạc quan chống hai người bấm cùng lúc. Xem §7.
  version Int @default(0)

  moves      GameMove[]
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  finishedAt DateTime?

  @@index([coupleId, kind, status])
  /// Cho job quét ván hết giờ: chỉ đụng vào ván đang chạy có đồng hồ.
  @@index([status, turnDeadlineAt])
  @@map("games")
}

/// Lịch sử nước đi. Không dùng để dựng lại state (state đã đủ), mà để:
/// hiện "nước vừa đánh", gỡ lỗi khi luật xử sai, và sau này làm màn phát lại.
model GameMove {
  id     BigInt @id @default(autoincrement())
  gameId String
  game   Game   @relation(fields: [gameId], references: [id], onDelete: Cascade)
  userId String
  /// Số thứ tự trong ván, bắt đầu từ 1.
  no      Int
  /// Tiến lên: {cards:[…]} hoặc {pass:true}. Caro: {r,c}.
  payload Json
  /// Nước đi do đồng hồ tự sinh, không phải người bấm.
  auto      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@unique([gameId, no])
  @@index([gameId, no])
  @@map("game_moves")
}
```

Bảng điểm **không lưu riêng** — đếm từ `Game.winnerId` là ra, và một cặp đôi thì số ván
đếm bằng tay cũng được. Thêm bảng tổng hợp chỉ tạo thêm một nguồn sự thật phải giữ đồng bộ.

---

## 4. Luật chơi

### 4.1 Mã hoá lá bài (dùng chung FE/BE)

```
rank:  0=3  1=4  2=5 … 9=Q  10=K  11=A  12=2(heo)
chất:  0=♠bích  1=♣chuồn  2=♦rô  3=♥cơ        (thứ tự miền Nam)

cardId = rank * 4 + suit        → 0..51
```

Nhờ cách đánh số này, **so hai lá chỉ là so `cardId`**: `3♠` = 0 (yếu nhất),
`2♥` = 51 (mạnh nhất). Không cần hàm so sánh riêng, không có chỗ để so sai chất.

### 4.2 Tiến lên miền Nam — các bộ

| Bộ | Cấu tạo | So với bộ cùng loại |
|---|---|---|
| Rác | 1 lá | so `cardId` |
| Đôi | 2 lá cùng rank | so lá cao nhất |
| Sám | 3 lá cùng rank | so lá cao nhất |
| Sảnh | ≥3 lá rank liên tiếp, **không có heo**, lẫn chất được | **phải cùng độ dài**, rồi so lá cao nhất |
| Đôi thông | 3 hoặc 4 đôi rank liên tiếp, **không có heo** | cùng số đôi, so đôi cao nhất |
| Tứ quý | 4 lá cùng rank | so rank |

Chỉ chặn được **bộ cùng loại và lớn hơn** — trừ các nước chặt ở §4.3.

### 4.3 Chặt heo

| Hàng chặt | Chặt được |
|---|---|
| 3 đôi thông | 1 con heo lẻ · 3 đôi thông nhỏ hơn |
| Tứ quý | 1 con heo lẻ · đôi heo · 3 đôi thông · tứ quý nhỏ hơn |
| 4 đôi thông | 1 con heo lẻ · đôi heo · 3 đôi thông · tứ quý · 4 đôi thông nhỏ hơn |

### 4.4 Diễn biến một ván (2 người)

1. Xáo, chia **13 lá mỗi người**, 26 lá còn lại bỏ ra và **không lưu** (không có gì để lộ).
2. Ván đầu: ai cầm **lá nhỏ nhất đã chia** đi trước, và **bộ đầu tiên bắt buộc chứa lá đó**.
   Ván sau: người thắng ván trước đi trước, không ràng buộc bộ.

   > Luật gốc nói "ai có 3♠", nhưng 13 lá mỗi người nghĩa là **26 lá bị bỏ ra — 3♠ có thể
   > không được chia cho ai cả**, và lúc đó không ván nào bắt đầu được. Phát hiện lúc viết
   > `deal.ts`; với bộ bài chia hết thì "lá nhỏ nhất" chính là 3♠, nên đây là cách nói tổng
   > quát của đúng luật ấy chứ không phải một luật khác.
3. Người ra bài đánh một bộ hợp lệ. Đối phương **chặn** (bộ cùng loại lớn hơn, hoặc nước
   chặt) hoặc **bỏ lượt**.
4. Bỏ lượt là mất vòng ngay — chỉ có hai người, không phải chờ ai khác. Người kia ăn vòng,
   bàn được dọn, và họ ra bài mới **tự do**.
5. Hết bài trước là thắng.

> Với 2 người, "vòng" đơn giản hơn hẳn bản 4 người: không cần theo dõi danh sách ai đã
> bỏ lượt, chỉ cần biết đối phương vừa bỏ hay không.

### 4.5 Cờ caro — luật Việt Nam

- Bàn **15×15**. Người tạo ván cầm **X** và đi trước ở ván đầu; ván sau đổi bên.
- Thắng khi có chuỗi ≥5 quân liên tiếp (ngang · dọc · hai đường chéo), với ngoại lệ:

| Chuỗi | Hai đầu | Kết quả |
|---|---|---|
| đúng 5 | cả hai bị chặn (quân đối phương **hoặc mép bàn**) | **chưa thắng** |
| đúng 5 | ít nhất một đầu là ô trống | **thắng** |
| ≥6 | bất kể | **thắng** |

- **Mép bàn tính là bị chặn.** Ghi rõ ở đây vì đây là chỗ hai người dễ cãi nhau nhất, và
  là case dễ quên nhất khi viết hàm kiểm tra.
- Bàn đầy mà chưa ai thắng → hoà.
- Không làm luật cấm "nước đôi ba" (double-three) — hiếm ai chơi trên giấy áp luật đó.

Thuật toán: sau mỗi nước, chỉ dò **4 hướng đi qua đúng ô vừa đánh**, lấy chiều dài chuỗi
tối đa. Không quét cả bàn — 225 ô thì quét cả bàn cũng chạy được, nhưng dò từ ô vừa đánh
vừa nhanh hơn vừa là chỗ duy nhất trạng thái có thể đổi.

---

## 5. Đồng hồ 30 giây — và cách không phạt oan người dùng

### 5.1 Cơ chế

- Đồng hồ là **của server**: `turnDeadlineAt` trong DB. Client chỉ vẽ lại phần đếm ngược,
  không bao giờ tự quyết là hết giờ.
- `turnDeadlineAt = NULL` nghĩa là **đang tạm dừng**, phần còn lại nằm ở `turnRemainingMs`.

### 5.2 Khi nào tạm dừng

| Sự kiện | Xử lý |
|---|---|
| Người tới lượt gửi `g:away` (tab ẩn / khoá màn hình) | Ghi lại phần còn lại, `turnDeadlineAt = NULL` |
| Socket của người tới lượt rớt | Như trên |
| Họ quay lại (`g:back` / nối lại socket) | `turnDeadlineAt = now + turnRemainingMs`, phát `g:clock` |
| Đối phương ẩn app | **Không ảnh hưởng** — không phải lượt của họ |
| Không ai đi nước nào suốt **30 phút** | Ván chuyển `ABANDONED` (§12) — trần chờ, để ván tạm dừng không treo vĩnh viễn |

Client bắt `visibilitychange` để gửi `g:away` **chủ động**, không đợi socket rớt: Socket.IO
mất ~20 giây mới nhận ra mất kết nối, mà 20 giây trên đồng hồ 30 giây là quá muộn.

### 5.3 Khi hết giờ thật

| Game | Xử lý | Vì sao |
|---|---|---|
| Tiến lên — đang phải chặn | Tự **bỏ lượt** | Đúng thứ người chơi sẽ làm nếu không chặn được |
| Tiến lên — đang được ra bài tự do (không được phép bỏ lượt) | Tự đánh **lá lẻ nhỏ nhất** | Ván phải đi tiếp; đánh lá nhỏ nhất là nước ít thiệt nhất |
| Caro | **Thua ván** | Không có nước "bỏ lượt" trong cờ; đây là luật đồng hồ cờ tiêu chuẩn |

Nước đi do đồng hồ sinh ra được đánh dấu `GameMove.auto = true` để màn hình nói rõ
"hết giờ, tự bỏ lượt" thay vì để người chơi tưởng đối phương tự đánh vậy.

### 5.4 Ai canh giờ

- Trong tiến trình: một `setTimeout` cho ván đang chạy — phản ứng đúng lúc, không tốn gì.
- **Cộng thêm** một cron `@nestjs/schedule` quét mỗi 5 giây các ván `PLAYING` có
  `turnDeadlineAt < now`. Đây là chốt chặn thật: `setTimeout` chết theo tiến trình, khởi
  động lại server là mất sạch — đúng bài học đã ghi trong ADR về nhắc lịch.

---

## 6. Hợp đồng API

### 6.1 REST — `/api/v1`

```
GET    /games                    ?kind&status — danh sách ván của couple
POST   /games                    {kind} → tạo ván mới
GET    /games/:id                state ĐÃ LỌC theo người xem
POST   /games/:id/moves          nước đi (xem 6.2)
POST   /games/:id/resign         đầu hàng
GET    /games/summary            bảng điểm: mỗi loại game, ai thắng mấy ván
```

- Mỗi loại game chỉ được có **một ván `PLAYING`** tại một thời điểm cho mỗi couple. Tạo
  ván mới khi ván cũ còn chạy → `409` kèm `gameId` đang chạy, để client mở thẳng vào đó.
- Toàn bộ kiểm quyền theo `coupleId` ở **tầng service** (R3). "Ván của cặp khác" và "ván
  không tồn tại" trả **cùng một 404** — giống cách `posts` và `events` đang làm.

### 6.2 Nước đi đi bằng REST, không bằng WebSocket

```
POST /games/:id/moves
  Tiến lên:  {cards: number[]}  |  {pass: true}
  Caro:      {r: number, c: number}
```

Nước đi là thao tác **cần biết chắc thành công hay thất bại, và thất bại vì lý do gì**
("bộ này không chặn được", "chưa tới lượt bạn"). REST có mã lỗi và cơ chế thử lại sẵn;
đẩy qua WebSocket thì phải tự dựng lại toàn bộ những thứ đó. Ván 30 giây một lượt không
cần tiết kiệm một nhịp mạng.

**WebSocket chỉ làm một việc: đẩy state mới về.**

### 6.3 WebSocket — namespace riêng `/rtg`

| Hướng | Sự kiện | Payload |
|---|---|---|
| C→S | `g:watch` | `{gameId}` — vào xem một ván |
| C→S | `g:away` / `g:back` | `{}` — tab ẩn / hiện lại (§5.2) |
| S→C | `g:state` | state **đã lọc riêng cho từng người** |
| S→C | `g:clock` | `{deadlineAt: number \| null}` |
| S→C | `g:over` | `{winnerId, endReason}` |
| S→C | `g:error` | `{code, message}` |

**Vì sao namespace riêng chứ không dùng `/rt` sẵn có:** `LocationsGateway` đang chạy ổn
định và là nơi nhạy cảm nhất về quyền riêng tư; nhét thêm luồng game vào đó là đặt hai
việc không liên quan vào chung một chỗ dễ vỡ. Đổi lại, máy người dùng mở socket thứ hai —
nhưng **chỉ khi đang ở màn game**, ai không chơi thì không tốn kết nối nào.

`g:state` **không phát theo room** như `loc:partner`: mỗi người thấy một state khác nhau
(bài trên tay), nên phải gửi riêng từng socket sau khi lọc.

### 6.4 Thông báo đẩy

Thêm `GAME_TURN` vào `PUSH_KINDS`: bắn cho đối phương khi đã tới lượt họ **mà họ đang
không mở app**. Đang mở app thì `g:state` đã tới nơi rồi, đẩy thêm chỉ là làm phiền.

---

## 7. Chống hai người bấm cùng lúc

`Game.version` là khoá lạc quan. Mỗi nước đi:

```sql
UPDATE games SET state=…, version = version + 1
WHERE id = … AND version = <giá trị vừa đọc>
```

Không có dòng nào bị đổi ⇒ có người khác đã đi trước ⇒ đọc lại và trả `409` kèm state mới.

Vì sao không dùng transaction Serializable: ADR ngày 2026-09-07 đã ghi lại bài học lúc ghép
đôi — Serializable làm giao dịch thua cuộc trả 500 vì hết `maxWait` của Prisma. Cùng một
vấn đề, dùng lại cùng một cách giải.

Trường hợp thật sự xảy ra: đồng hồ hết giờ **đúng lúc** người chơi bấm đánh. Cả hai cùng
ghi, một cái thua — và đó là kết quả đúng, ván không bao giờ đi hai nước cho một lượt.

---

## 8. Giao diện (390×844, mobile-first — R2)

### 8.1 Tiến lên — **bàn toàn màn hình, ưu tiên khổ NGANG** (làm lại 09/09)

Đây là màn duy nhất của app không nằm trong cột 430px của `<Screen>`: ván bài cần bề ngang.
Ở khổ dọc 390px, 13 lá cạnh nhau chỉ hở 26px mỗi lá; xoay ngang thì hở hơn 50px và lá to
gần gấp rưỡi.

```
khổ ngang 844×390
┌──────────────────────────────────────────────┐
│ ‹      Tới lượt bạn ⏱17      ⇅  ⤢  🏳️        │
│            [Mai Anh · 🂠×9]                   │
│                 ┌────┐┌────┐                 │  bàn giữa
│                 │ 8♠ ││ 8♥ │                 │
│                 └────┘└────┘                 │
│                 đôi · sẵn sàng               │
│   ╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮      ┌───────┐ │
│   │3││4││5││6││7││9││9││10││J│      │💡 Gợi ý│ │
│   ╰─╯╰─╯╰─╯╰─╯╰─╯╰─╯╰─╯╰──╯╰─╯      │Bỏ lượt│ │
│                                     │Đánh 2 │ │
└──────────────────────────────────────────────┘
```

**Xoay ngang.** Sảnh trò chơi gọi `requestLandscape()` ngay trong cú chạm mở ván
(`requestFullscreen()` + `screen.orientation.lock('landscape')`) — phải gọi ở đó vì cử chỉ
người dùng hết hiệu lực sau `await` đầu tiên, mà mở ván thì có gọi API. iOS Safari không có
API khoá xoay, và rất nhiều máy đang bật khoá xoay hệ thống, nên **không bao giờ dựng tấm
chắn "hãy xoay máy"**: khổ dọc vẫn chơi được đầy đủ, chỉ nhắc một dòng rồi tự ẩn sau 8 giây.

**Chọn bài.** Hai cách, cùng nhắm vào một việc: bớt số lần phải ngắm từng lá.

| Thao tác | Kết quả |
|---|---|
| Chạm một lá khi đang phải chặn | `autoPick()` chọn luôn cả bộ rẻ nhất chứa lá đó (bàn có đôi 8 → chạm một lá 9 lấy cả đôi 9) |
| Chạm một lá khi bàn trống | chỉ chọn đúng lá đó — lúc đó chỉ người chơi mới biết định ghép bộ gì |
| **Vuốt ngang** qua nhiều lá | nhặt tất cả các lá đi qua; chỉ THÊM, không bỏ chọn |
| Chạm lá đang chọn | bỏ lá đó ra |
| Nút **💡 Gợi ý** | duyệt lần lượt mọi bộ đi được (`listPlays()`), hàng chặt xếp cuối |

`listPlays()` / `autoPick()` nằm ở `packages/shared/src/tien-len-suggest.ts` — **hàm thuần**,
không chứa luật: nó dựng bộ ứng viên rồi hỏi `checkPlay()`. Nhờ đó cũng biết chính xác khi
nào người chơi bí thật để nói thẳng "đành bỏ lượt", thay cho `hasAnswer()` cũ (đã bỏ).

**Kích thước lá** do `apps/web/src/lib/fan-layout.ts` tính từ khung đo bằng `ResizeObserver`,
theo thứ tự ưu tiên: nằm gọn trong khung → hở đủ 26px để đọc được số ở góc (kể cả "10") →
hở đủ 16px để chạm trúng → còn dư chỗ thì lá to lên. Lá đang chọn **nhô lên 22px** đúng bằng
chiều cao phần chỉ số, và **không** được nâng thứ tự chồng lớp — nâng thì nó che mất chỉ số
của lá bên phải.

- Nút "Đánh" tắt cho tới khi các lá đang chọn tạo thành một bộ **chặn được bộ trên bàn**.
  Kiểm bằng chính hàm luật ở `packages/shared` — người chơi không phải đoán.
- Nút ⇅ đổi giữa xếp theo bậc và xếp theo chất.
- Đồng hồ nằm giữa thanh trên, đỏ và đập nhẹ khi còn ≤10 giây; **dừng thì nói rõ vì sao** —
  không để ai tưởng mình đang mất giờ.

### 8.1b Bấm là thấy ngay — bù độ trễ mạng

Bài **rời tay và rơi xuống bàn ngay lúc bấm**, không đợi server trả lời (state `sending` cục
bộ trong `TienLenTable`). Server vẫn là trọng tài duy nhất: nó từ chối thì bài quay về tay
kèm đúng câu lỗi của server.

Cố tình **không** đặt nước-đang-gửi vào cache của TanStack Query: cache còn là nơi socket đổ
state thật vào, trộn hai thứ vào một chỗ thì một gói tin đến muộn sẽ xoá mất nước vừa bấm.
Cùng lý do đó, mọi đường ghi vào cache đi qua `putGame()` — **bỏ qua state có `version` cũ
hơn thứ đang có**, vì state về từ hai đường (REST và socket) mà thứ tự tới nơi không ai bảo đảm.

Phía server, ba chỗ cắt được độ trễ thật:

| Chỗ | Trước | Sau |
|---|---|---|
| `POST /moves` | `await` phát socket rồi mới trả lời | trả lời ngay, phát socket chạy nền (`pushState`) |
| Phát state cho phòng | mỗi socket một lần `games.get()` = 2 truy vấn DB × số tab | nạp ván **một lần** rồi dựng bản riêng cho từng người |
| `load()` | `getContext()` rồi mới `findUnique()` | hai truy vấn chạy song song |

### 8.2 Caro

Bàn 15×15 trong 350px ⇒ mỗi ô **23px**, nhỏ hơn mức 44px mà R2 bắt buộc. Cách xử lý:

**Chạm hai bước.** Chạm lần một chỉ *ngắm* — ô đó được tô sáng và một ô phóng to hiện
ngay phía trên ngón tay; nước đi chỉ được gửi khi bấm nút **"Đặt quân" cỡ 44px** ở dưới.
Vừa giải quyết ô nhỏ, vừa chặn luôn chuyện đánh nhầm ô — mà đánh nhầm trong cờ thì không
có nút hoàn tác.

Kèm theo: chấm đánh dấu nước vừa đi của đối phương, và tô sáng chuỗi thắng khi kết thúc.

---

## 9. Các quyết định để đưa sang ADR khi chốt

| Quyết định | Lý do | Đánh đổi |
|---|---|---|
| `state` là một cột JSON, không tách bảng quan hệ | Bài và bàn cờ có hình dạng khác hẳn nhau; ép chung lược đồ chỉ tạo bảng đầy cột NULL | Không truy vấn được vào trong ván bằng SQL — chưa cần |
| Luật chơi nằm ở `packages/shared`, là **hàm thuần** | FE cần luật để tắt/bật nút "Đánh", BE cần luật để làm trọng tài. Hai bản sao là hai chỗ để lệch nhau. Hàm thuần thì unit test được 100% mà không cần DB | Luật đi xuống client ⇒ ai đọc mã nguồn cũng biết luật — vốn không phải bí mật; bí mật là **bài úp**, và nó không rời server |
| Nước đi qua **REST**, WebSocket chỉ đẩy state | Nước đi cần mã lỗi rõ ràng và cơ chế thử lại; ván 30s/lượt không cần tiết kiệm một nhịp mạng | Chậm hơn WebSocket một nhịp — không ai nhận ra ở nhịp 30 giây |
| Namespace WebSocket **riêng** `/rtg` | Không trộn luồng game vào gateway vị trí — nơi nhạy cảm nhất về quyền riêng tư và đang chạy ổn | Socket thứ hai, nhưng chỉ mở khi đang ở màn game |
| Đồng hồ **dừng khi người tới lượt ẩn app** | §1.3: iOS treo JS khi khoá màn hình. Không dừng thì 30 giây biến thành máy phạt oan | Có thể lợi dụng để "câu giờ" bằng cách tắt app — với hai người yêu nhau thì đây không phải mối lo |
| Xáo bài bằng `crypto.randomInt`, không `Math.random` | `Math.random` đoán được trạng thái sau vài chục mẫu — với bài úp đó là lỗ hổng thật | Chậm hơn không đáng kể |
| Đồng hồ có **cả** `setTimeout` lẫn cron 5 giây | `setTimeout` chết theo tiến trình; khởi động lại server là ván treo vĩnh viễn. Đúng bài học của job nhắc lịch | Một cron chạy suốt, gần như luôn không có việc gì |
| Mỗi loại game chỉ **một ván đang chạy** mỗi couple | Hai ván tiến lên song song giữa đúng hai người là vô nghĩa, mà lại đẻ ra câu hỏi "ván nào là ván đang chơi" ở mọi màn hình | Muốn bỏ ván cũ phải bấm đầu hàng |

---

## 10. Case biên bắt buộc kiểm (đầu vào cho bước test)

**Tiến lên** — 3♠ quyết định ai đi trước · bộ đầu ván đầu không chứa 3♠ → từ chối · sảnh có
heo → từ chối · sảnh chặn sảnh khác độ dài → từ chối · 3 đôi thông chặt heo lẻ ✓ nhưng chặt
đôi heo ✗ · tứ quý chặt đôi heo ✓ · đánh lá không có trong tay · đánh khi chưa tới lượt ·
hết giờ lúc đang được ra bài tự do · hai người bấm cùng lúc · hết bài đúng bằng nước chặt.

**Caro** — đánh vào ô đã có quân · đánh ngoài bàn · đúng 5 bị chặn hai đầu → chưa thắng ·
đúng 5 với một đầu là **mép bàn** và đầu kia bị chặn → chưa thắng · đúng 5 một đầu hở →
thắng · 6 quân bị chặn hai đầu → thắng · thắng theo cả hai đường chéo · bàn đầy → hoà ·
hết giờ → thua.

**Đồng hồ** — ẩn app rồi quay lại, phần còn lại phải đúng · socket rớt giữa lượt · khởi
động lại server lúc ván đang chạy · hết giờ đúng lúc đối phương vừa đánh xong.

---

## 11. Khối lượng & thứ tự đề nghị

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | `packages/shared`: luật caro thuần (`caro.ts`) + schema/hằng số (`game.schema.ts`) | ✅ **27 unit test** |
| 2 | Caro chạy đầu-cuối: migration `20260909100000_games`, `GamesModule`, gateway `/rtg`, cron đồng hồ, `GamesScreen` + `CaroScreen` | ✅ |
| 5 | Push `GAME_TURN`, bảng điểm, 4 test E2E 390×844 (CR-01…04) | ✅ (âm thanh: chốt không làm) |
| 3 | `packages/shared/src/tien-len.ts`: mã hoá lá bài, nhận diện bộ, so bộ, chặt heo | ✅ **57 unit test** |
| 4 | Tiến lên nối vào khung bước 2: `deal.ts` (7 test), `applyTienLenMove`, `TienLenTable` | ✅ |

### 11.1 Khung xương dùng chung — nơi thêm game thứ ba

- `GamesService.clientState()` — **chỗ lọc state duy nhất**. Bài trên tay không rời server
  qua bất kỳ đường nào khác.
- `applyCaroMove()` / `applyTienLenMove()` cùng gọi `commit()`, nên tự động có khoá lạc quan,
  lịch sử nước đi và đồng hồ.
- `GamesService.timeout()` là chỗ **duy nhất** hai game xử khác nhau: caro thua, tiến lên
  mất lượt.
- Web: `GameScreen` giữ khung (tải, socket, đồng hồ, đầu hàng), `CaroBoard` / `TienLenTable`
  chỉ lo bàn chơi.

**Làm caro trước** dù nó là phần nhỏ hơn: nó dựng xong toàn bộ khung xương — bảng `Game`,
API, WebSocket, đồng hồ, chống race — trên một bộ luật đủ đơn giản để nếu có sai thì biết
ngay là sai ở khung chứ không phải ở luật. Đến lượt Tiến lên thì chỉ còn phải đúng phần luật.

---

## 12. Ba điểm còn lại — đã chốt 09/09

| # | Chốt | Ghi chú |
|---|---|---|
| 1 | **Thẻ "Chơi cùng nhau" ở màn Nhà** → `/tro-choi` | Chủ dự án giao tôi quyết. Tab bar đã đủ 5 khe và ADR đã chốt bố cục đó, nên không đụng vào. Thẻ mới thay đúng chỗ thẻ "Sắp có" đang quảng cáo thông báo đẩy — thứ đã làm xong từ Phase 4, giờ là chữ thừa |
| 2 | **Ván bỏ dở 30 phút không ai đi → `ABANDONED`** | Ngắn hơn hẳn mức 7 ngày tôi đề nghị, nhưng khớp với Q3: chọn đồng hồ 30 giây nghĩa là chơi khi cả hai đang cùng online, không phải cờ qua thư. 30 phút cũng chính là **trần chờ** mà §5.2 còn thiếu — không có nó thì ván tạm dừng treo vĩnh viễn |
| 3 | **Không làm âm thanh** | Bỏ khỏi phạm vi bước 5 |

### 12.1 Hệ quả của quyết định 2 lên mô hình dữ liệu

Cần thêm cột `lastMoveAt` vào `Game`. Không dùng được `updatedAt`: ẩn app để tạm dừng đồng
hồ cũng là một lần ghi, nên `updatedAt` sẽ tự đẩy hạn huỷ ra xa mỗi lần người dùng khoá màn
hình — ván bỏ dở sẽ không bao giờ bị dọn.

```prisma
/// Nước đi gần nhất. Quá 30 phút không ai đi thì cron chuyển ván sang ABANDONED.
/// Ván vừa tạo mà chưa ai đánh cũng tính từ đây.
lastMoveAt DateTime @default(now())

@@index([status, lastMoveAt])
```

Màn chơi phải **nói rõ** "Ván tự huỷ nếu 30 phút không ai đi" — mất ván mà không biết vì
sao là chuyện khó chịu hơn hẳn bản thân việc mất ván.
