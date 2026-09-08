import { describe, expect, it, vi } from 'vitest';
import type { MilestoneItem } from '@beside/shared';
import { MilestoneReminderJob } from './milestone-reminder.job';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { PushService } from '../push/push.service';
import type { MilestonesService } from './milestones.service';

/**
 * Job nhắc mốc chỉ nhắc ở đúng bốn nấc: còn 7 / 3 / 1 / 0 ngày. Nhắc mỗi ngày
 * thì phiền, nhắc một lần thì quên — nên phải kiểm đúng bốn nấc đó, và kiểm cả
 * những nấc KHÔNG được nhắc.
 */

const NOW = new Date('2026-09-08T01:00:00.000Z'); // 08:00 giờ VN
const AN = 'user-an';
const BINH = 'user-binh';

function item(over: Partial<MilestoneItem> = {}): MilestoneItem {
  return {
    id: null,
    kind: 'AUTO_DAYS',
    title: '1.000 ngày bên nhau',
    emoji: '💖',
    date: '2026-09-15T00:00:00.000Z',
    daysLeft: 7,
    subtitle: null,
    ...over,
  };
}

function fakeDeps(
  items: MilestoneItem[],
  opts: { couples?: { id: string; members: { id: string }[] }[]; throwFor?: string } = {},
) {
  const couples = opts.couples ?? [{ id: 'c1', members: [{ id: AN }, { id: BINH }] }];

  const prisma = {
    couple: { findMany: vi.fn(async () => couples) },
  } as unknown as PrismaService;

  const sent: { userId: string; title: string; body: string; tag?: string }[] = [];
  const push = {
    isEnabled: () => true,
    sendToUser: vi.fn(
      async (userId: string, payload: { title: string; body: string; tag?: string }) => {
        sent.push({ userId, ...payload });
        return 1;
      },
    ),
  } as unknown as PushService;

  const milestones = {
    upcoming: vi.fn(async (userId: string) => {
      if (opts.throwFor === userId) throw new Error('couple hỏng dữ liệu');
      return items;
    }),
  } as unknown as MilestonesService;

  return { prisma, push, milestones, sent };
}

describe('MilestoneReminderJob.sweep', () => {
  it('gửi ở mốc còn 7 ngày, cho CẢ HAI người', async () => {
    const { prisma, push, milestones, sent } = fakeDeps([item({ daysLeft: 7 })]);
    const n = await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);

    expect(n).toBe(2);
    expect(sent.map((s) => s.userId).sort()).toEqual([AN, BINH]);
    expect(sent[0]?.title).toBe('💖 1.000 ngày bên nhau');
    expect(sent[0]?.body).toBe('Còn 7 ngày nữa');
  });

  it.each([
    [3, 'Còn 3 ngày nữa'],
    [1, 'Ngày mai rồi — chuẩn bị gì chưa?'],
    [0, 'Là hôm nay đó 💕'],
  ])('gửi ở mốc còn %i ngày với câu chữ riêng', async (daysLeft, body) => {
    const { prisma, push, milestones, sent } = fakeDeps([item({ daysLeft })]);
    await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);
    expect(sent[0]?.body).toBe(body);
  });

  it.each([2, 4, 5, 6, 10, 30, 100])(
    'KHÔNG gửi ở mốc còn %i ngày — nhắc mỗi ngày thì phiền',
    async (daysLeft) => {
      const { prisma, push, milestones } = fakeDeps([item({ daysLeft })]);
      const n = await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);
      expect(n).toBe(0);
    },
  );

  it('nhiều mốc cùng lúc thì gửi từng cái', async () => {
    const { prisma, push, milestones, sent } = fakeDeps([
      item({ daysLeft: 7, title: 'Mốc xa' }),
      item({ daysLeft: 0, title: 'Mốc hôm nay' }),
      item({ daysLeft: 5, title: 'Không nhắc' }),
    ]);
    await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);

    const titles = new Set(sent.map((s) => s.title));
    expect(titles).toEqual(new Set(['💖 Mốc xa', '💖 Mốc hôm nay']));
  });

  it('gộp theo mốc + ngày để chạy lại trong cùng ngày không xếp chồng', async () => {
    const { prisma, push, milestones, sent } = fakeDeps([
      item({ daysLeft: 0, title: 'Sinh nhật Bình', date: '2026-09-08T00:00:00.000Z' }),
    ]);
    await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);
    expect(sent[0]?.tag).toBe('milestone:Sinh nhật Bình:2026-09-08');
  });

  it('MỘT COUPLE HỎNG DỮ LIỆU không chặn couple khác', async () => {
    const { prisma, push, milestones, sent } = fakeDeps([item({ daysLeft: 0 })], {
      couples: [
        { id: 'c1', members: [{ id: 'hong' }] },
        { id: 'c2', members: [{ id: AN }, { id: BINH }] },
      ],
      throwFor: 'hong',
    });
    const n = await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);

    expect(n).toBe(2);
    expect(sent.every((s) => s.userId !== 'hong')).toBe(true);
  });

  it('couple chưa có thành viên nào thì bỏ qua, không lỗi', async () => {
    const { prisma, push, milestones } = fakeDeps([item({ daysLeft: 0 })], {
      couples: [{ id: 'c1', members: [] }],
    });
    await expect(
      new MilestoneReminderJob(prisma, push, milestones).sweep(NOW),
    ).resolves.toBe(0);
  });

  it('không gửi gì khi thông báo đẩy đang tắt', async () => {
    const { prisma, milestones, sent } = fakeDeps([item({ daysLeft: 0 })]);
    const off = { isEnabled: () => false, sendToUser: vi.fn() } as unknown as PushService;
    await new MilestoneReminderJob(prisma, off, milestones).run();
    expect(sent).toHaveLength(0);
  });

  it('tính danh sách MỘT LẦN cho mỗi couple, không tính lại cho từng người', async () => {
    // Mốc là của chung nên hai người thấy y hệt nhau — gọi hai lần là tốn gấp đôi.
    const { prisma, push, milestones } = fakeDeps([item({ daysLeft: 0 })]);
    await new MilestoneReminderJob(prisma, push, milestones).sweep(NOW);
    expect(
      (milestones.upcoming as unknown as { mock: { calls: unknown[] } }).mock.calls,
    ).toHaveLength(1);
  });
});
