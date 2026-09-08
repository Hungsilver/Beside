import { describe, expect, it, vi } from 'vitest';
import { EventReminderJob } from './event-reminder.job';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { PushService } from '../push/push.service';

/**
 * Logic chọn thời điểm nhắc lịch chỉ kiểm được bằng unit test: nó phụ thuộc vào
 * "bây giờ là mấy giờ", mà bộ trace chạy qua HTTP thì không đổi được đồng hồ của
 * server. Ở đây `sweep(now)` nhận mốc thời gian làm tham số nên test được thẳng.
 */

const NOW = new Date('2026-09-08T10:00:00.000Z');
const AN = 'user-an';
const BINH = 'user-binh';

interface FakeEvent {
  id: string;
  title: string;
  emoji: string;
  startAt: Date;
  allDay: boolean;
  remindMinBefore: number | null;
  visibility: 'SHARED' | 'PRIVATE';
  createdById: string;
  coupleId: string;
  couple: { members: { id: string }[] };
}

function makeEvent(over: Partial<FakeEvent> = {}): FakeEvent {
  return {
    id: 'e1',
    title: 'Ăn tối',
    emoji: '🍽️',
    startAt: new Date('2026-09-08T11:00:00.000Z'),
    allDay: false,
    remindMinBefore: 60,
    visibility: 'SHARED',
    createdById: AN,
    coupleId: 'c1',
    couple: { members: [{ id: AN }, { id: BINH }] },
    ...over,
  };
}

/**
 * Prisma giả: chỉ dựng đúng hai hàm mà job dùng.
 *
 * `findMany` cố tình KHÔNG lọc lại theo điều kiện — vì đây là chỗ ta muốn kiểm
 * chính logic lọc trong bộ nhớ của job, không phải kiểm Prisma.
 */
function fakeDeps(events: FakeEvent[], opts: { alreadyClaimed?: Set<string> } = {}) {
  const claimed = opts.alreadyClaimed ?? new Set<string>();
  const updateMany = vi.fn(async ({ where }: { where: { id: string } }) => {
    if (claimed.has(where.id)) return { count: 0 };
    claimed.add(where.id);
    return { count: 1 };
  });

  const prisma = {
    event: { findMany: vi.fn(async () => events), updateMany },
  } as unknown as PrismaService;

  const sent: { userId: string; title: string; body: string; tag?: string }[] = [];
  const push = {
    isEnabled: () => true,
    sendToUser: vi.fn(async (userId: string, payload: { title: string; body: string; tag?: string }) => {
      sent.push({ userId, ...payload });
      return 1;
    }),
  } as unknown as PushService;

  return { prisma, push, sent, updateMany };
}

describe('EventReminderJob.sweep', () => {
  it('gửi khi đã tới mốc nhắc', async () => {
    // Hẹn 11:00, nhắc trước 60 phút → mốc nhắc là 10:00 = đúng bây giờ.
    const { prisma, push, sent } = fakeDeps([makeEvent()]);
    const n = await new EventReminderJob(prisma, push).sweep(NOW);

    expect(n).toBe(2); // gửi cho cả hai người
    expect(sent[0]?.title).toBe('🍽️ Ăn tối');
    expect(sent[0]?.body).toContain('18:00'); // 11:00 UTC = 18:00 giờ VN
  });

  it('CHƯA tới mốc nhắc thì không gửi', async () => {
    // Hẹn 12:00, nhắc trước 60 phút → mốc nhắc 11:00, còn 1 tiếng nữa.
    const { prisma, push } = fakeDeps([
      makeEvent({ startAt: new Date('2026-09-08T12:00:00.000Z') }),
    ]);
    expect(await new EventReminderJob(prisma, push).sweep(NOW)).toBe(0);
  });

  it('đúng mốc nhắc thì gửi, sớm hơn một phút thì chưa', async () => {
    const at1001 = new Date('2026-09-08T10:01:00.000Z');
    const early = fakeDeps([
      makeEvent({ startAt: new Date('2026-09-08T11:02:00.000Z') }), // mốc nhắc 10:02
    ]);
    expect(await new EventReminderJob(early.prisma, early.push).sweep(at1001)).toBe(0);

    const onTime = fakeDeps([
      makeEvent({ startAt: new Date('2026-09-08T11:01:00.000Z') }), // mốc nhắc 10:01
    ]);
    expect(await new EventReminderJob(onTime.prisma, onTime.push).sweep(at1001)).toBe(2);
  });

  it('VIỆC RIÊNG chỉ nhắc người tạo', async () => {
    const { prisma, push, sent } = fakeDeps([makeEvent({ visibility: 'PRIVATE' })]);
    const n = await new EventReminderJob(prisma, push).sweep(NOW);

    expect(n).toBe(1);
    expect(sent.map((s) => s.userId)).toEqual([AN]);
  });

  it('ĐÃ CÓ TIẾN TRÌNH KHÁC GIÀNH ĐƯỢC thì bỏ qua, không gửi trùng', async () => {
    // updateMany trả count = 0 ⇒ tiến trình API thứ hai đã đánh dấu trước.
    const { prisma, push } = fakeDeps([makeEvent()], { alreadyClaimed: new Set(['e1']) });
    expect(await new EventReminderJob(prisma, push).sweep(NOW)).toBe(0);
  });

  it('đánh dấu TRƯỚC khi gửi — nếu không, hai tiến trình cùng kịp gửi', async () => {
    const { prisma, push, updateMany } = fakeDeps([makeEvent()]);
    await new EventReminderJob(prisma, push).sweep(NOW);

    const order = (updateMany.mock.invocationCallOrder[0] ?? 0) as number;
    const pushOrder = ((push.sendToUser as unknown as { mock: { invocationCallOrder: number[] } })
      .mock.invocationCallOrder[0] ?? 0) as number;
    expect(order).toBeLessThan(pushOrder);
  });

  it('nhiều sự kiện: chỉ gửi cái đã tới mốc', async () => {
    const { prisma, push, sent } = fakeDeps([
      makeEvent({ id: 'a', title: 'Tới giờ' }),
      makeEvent({ id: 'b', title: 'Chưa tới', startAt: new Date('2026-09-08T20:00:00.000Z') }),
    ]);
    await new EventReminderJob(prisma, push).sweep(NOW);
    expect(new Set(sent.map((s) => s.title))).toEqual(new Set(['🍽️ Tới giờ']));
  });

  it('gộp thông báo theo sự kiện bằng tag', async () => {
    const { prisma, push, sent } = fakeDeps([makeEvent()]);
    await new EventReminderJob(prisma, push).sweep(NOW);
    expect(sent[0]?.tag).toBe('event:e1');
  });

  it('không gửi gì khi thông báo đẩy đang tắt', async () => {
    const { prisma, sent } = fakeDeps([makeEvent()]);
    const off = { isEnabled: () => false, sendToUser: vi.fn() } as unknown as PushService;
    const job = new EventReminderJob(prisma, off);
    await job.run();
    expect(sent).toHaveLength(0);
  });

  describe('câu chữ trong thông báo', () => {
    const bodyFor = async (over: Partial<FakeEvent>) => {
      const { prisma, push, sent } = fakeDeps([makeEvent(over)]);
      await new EventReminderJob(prisma, push).sweep(NOW);
      return sent[0]?.body ?? '';
    };

    it('nhắc trước 10 phút', async () => {
      expect(
        await bodyFor({
          startAt: new Date('2026-09-08T10:10:00.000Z'),
          remindMinBefore: 10,
        }),
      ).toBe('Còn 10 phút nữa — 17:10');
    });

    it('nhắc đúng giờ', async () => {
      expect(
        await bodyFor({ startAt: NOW, remindMinBefore: 0 }),
      ).toBe('Bắt đầu bây giờ (17:00)');
    });

    it('nhắc trước 2 tiếng', async () => {
      expect(
        await bodyFor({
          startAt: new Date('2026-09-08T12:00:00.000Z'),
          remindMinBefore: 120,
        }),
      ).toBe('Còn 2 tiếng nữa — 19:00');
    });

    it('sự kiện cả ngày đọc ngày theo UTC, không lệch sang hôm trước', async () => {
      // Ngày trôi nổi: 00:00 UTC ngày 09. Nếu đổi sang giờ VN thì thành 07:00
      // ngày 09 — vẫn đúng ngày; nhưng nếu ai đó lưu theo 00:00 giờ VN thì mốc
      // là 17:00 ngày 08 và câu chữ sẽ nói sai ngày.
      expect(
        await bodyFor({
          allDay: true,
          startAt: new Date('2026-09-09T00:00:00.000Z'),
          remindMinBefore: 1440,
        }),
      ).toBe('Cả ngày 09/09');
    });
  });
});
