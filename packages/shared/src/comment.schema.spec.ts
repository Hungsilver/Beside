import { describe, expect, it } from 'vitest';
import {
  COMMENT_MAX,
  commentQuerySchema,
  createCommentSchema,
  MAX_COMMENTS_PER_POST,
} from './comment.schema';

describe('createCommentSchema', () => {
  it('happy path', () => {
    const r = createCommentSchema.safeParse({ body: 'Tấm này đẹp quá 🥰' });
    expect(r.success && r.data.body).toBe('Tấm này đẹp quá 🥰');
  });

  it('cắt khoảng trắng thừa hai đầu', () => {
    const r = createCommentSchema.safeParse({ body: '   nhớ em   ' });
    expect(r.success && r.data.body).toBe('nhớ em');
  });

  it('chuỗi rỗng bị từ chối', () => {
    expect(createCommentSchema.safeParse({ body: '' }).success).toBe(false);
  });

  it('toàn khoảng trắng cũng bị từ chối — cắt xong là rỗng', () => {
    const r = createCommentSchema.safeParse({ body: '  \n\t  ' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('Chưa nhập');
  });

  it('thiếu trường body bị từ chối', () => {
    expect(createCommentSchema.safeParse({}).success).toBe(false);
  });

  it('đúng trần độ dài thì được', () => {
    expect(createCommentSchema.safeParse({ body: 'a'.repeat(COMMENT_MAX) }).success).toBe(true);
  });

  it('quá trần một ký tự bị từ chối', () => {
    const r = createCommentSchema.safeParse({ body: 'a'.repeat(COMMENT_MAX + 1) });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain(String(COMMENT_MAX));
  });

  it('trần tính SAU khi cắt khoảng trắng', () => {
    // Gõ đủ trần rồi thừa vài dấu cách ở cuối thì không được coi là quá dài —
    // nếu không, người dùng bị chặn mà bộ đếm trên màn hình vẫn hiện đúng trần.
    const r = createCommentSchema.safeParse({ body: `${'a'.repeat(COMMENT_MAX)}   ` });
    expect(r.success).toBe(true);
  });

  it('giữ nguyên xuống dòng ở giữa', () => {
    const r = createCommentSchema.safeParse({ body: 'dòng 1\ndòng 2' });
    expect(r.success && r.data.body).toBe('dòng 1\ndòng 2');
  });
});

describe('commentQuerySchema', () => {
  it('không truyền gì thì lấy mặc định', () => {
    const r = commentQuerySchema.safeParse({});
    expect(r.success && r.data.limit).toBe(20);
    expect(r.success && r.data.cursor).toBeUndefined();
  });

  it('limit đến từ query string là chuỗi, phải ép được về số', () => {
    const r = commentQuerySchema.safeParse({ limit: '5' });
    expect(r.success && r.data.limit).toBe(5);
  });

  it('limit ngoài dải bị từ chối', () => {
    expect(commentQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(commentQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('limit không phải số nguyên bị từ chối', () => {
    expect(commentQuerySchema.safeParse({ limit: '2.5' }).success).toBe(false);
  });

  it('con trỏ quá dài bị từ chối — không để ai nhồi chuỗi tuỳ ý vào truy vấn', () => {
    expect(commentQuerySchema.safeParse({ cursor: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('trần số bình luận', () => {
  it('là một con số hữu hạn, đủ rộng cho hai người dùng thật', () => {
    expect(MAX_COMMENTS_PER_POST).toBeGreaterThan(50);
    expect(Number.isInteger(MAX_COMMENTS_PER_POST)).toBe(true);
  });
});
