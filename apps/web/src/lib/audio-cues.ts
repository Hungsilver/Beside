/**
 * Tiếng báo tổng hợp bằng Web Audio — tiếng tách khi lật và chuông khi hết giờ.
 *
 * Cùng lý do với tiếng ồn nền (ADR 2026-09-12): repo không có tài sản âm thanh,
 * và một tệp chuông nghe tử tế cũng vài trăm KB cho thứ kêu hai giây. Sóng
 * tổng hợp tốn 0 byte và chạy được offline.
 *
 * Dùng MỘT `AudioContext` dùng chung, tạo lúc cần đầu tiên: mỗi context là một
 * tài nguyên thật của hệ điều hành, mở mỗi lần kêu một cái thì sau vài phút
 * trình duyệt sẽ từ chối tạo thêm.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;

  if (ctx === null || ctx.state === 'closed') {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // iOS treo context khi app ẩn đi; đánh thức lại trước mỗi lần kêu.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/**
 * Tiếng "tách" của một tấm thẻ lật.
 *
 * Là một xung nhiễu rất ngắn qua bộ lọc dải hẹp — đó đúng là thứ tai nghe khi
 * hai mảnh nhựa cứng chạm nhau. Dùng sóng sin sẽ ra tiếng "tinh" như chuông
 * chứ không ra tiếng va chạm.
 */
export function playTick(volume = 0.35): void {
  const ac = context();
  if (!ac) return;

  try {
    const now = ac.currentTime;
    const length = Math.floor(ac.sampleRate * 0.03);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      // Tắt dần rất nhanh theo hàm mũ — va chạm không ngân.
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / length) * 9);
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;

    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2100;
    band.Q.value = 1.6;

    const gain = ac.createGain();
    gain.gain.value = clamp(volume) * 0.5;

    source.connect(band);
    band.connect(gain);
    gain.connect(ac.destination);
    source.start(now);
    source.stop(now + 0.05);
  } catch {
    /* thiết bị không phát được — không có gì để cứu */
  }
}

/**
 * Chuông báo hết giờ: ba tiếng đi lên, mỗi tiếng là hai sóng sin chồng nhau.
 *
 * Chồng thêm quãng tám ở trên làm tiếng sáng hơn hẳn một sóng sin trần — sóng
 * sin đơn nghe như tiếng máy đo nhịp tim chứ không như chuông.
 */
export function playChime(volume = 0.6): void {
  const ac = context();
  if (!ac) return;

  try {
    const now = ac.currentTime;
    const notes = [880, 1108.73, 1318.51]; // La5 · Đô#6 · Mi6
    notes.forEach((freq, i) => {
      const at = now + i * 0.18;
      for (const [f, level] of [
        [freq, 1],
        [freq * 2, 0.32],
      ] as const) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;

        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(clamp(volume) * 0.35 * level, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);

        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(at);
        osc.stop(at + 0.95);
      }
    });
  } catch {
    /* bỏ qua */
  }
}

/**
 * Rung máy. Chỉ Android có; iOS Safari không cài đặt `navigator.vibrate`.
 *
 * Gọi kèm chuông chứ không thay chuông: máy đang để im lặng thì rung là đường
 * báo duy nhất còn lại, mà máy đang bật tiếng thì chuông mới là thứ nghe thấy
 * từ phòng bên.
 */
export function buzz(pattern: number[] = [180, 90, 180]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* bỏ qua */
  }
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}
