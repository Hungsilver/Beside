import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiếng ồn nền cho phòng học — TỔNG HỢP bằng Web Audio, không tải tệp nào.
 *
 * Vì sao không dùng tệp mp3: repo chưa có tài sản âm thanh nào (`docs/BACKLOG.md`
 * 09/09), mà một vòng lặp mưa nghe không lộ mối nối thì nặng vài MB — đắt hơn
 * cả phần còn lại của app cộng lại, trên mạng di động Việt Nam. Nhiễu tổng hợp
 * tốn 0 byte, chạy được offline, và không bao giờ lặp lại chính nó.
 *
 * **Giới hạn phải nói thẳng với người dùng:** tiếng chỉ kêu khi app đang mở
 * trên màn hình. Khoá máy thì trình duyệt treo `AudioContext` — khác hẳn đồng
 * hồ (đồng hồ do server giữ mốc nên vẫn chạy tiếp).
 */

export const NOISE_PRESETS = [
  { id: 'rain', emoji: '🌧️', label: 'Mưa' },
  { id: 'wave', emoji: '🌊', label: 'Sóng' },
  { id: 'white', emoji: '🌫️', label: 'Ồn trắng' },
] as const;

export type NoiseId = (typeof NOISE_PRESETS)[number]['id'];

/**
 * Độ dài đệm nhiễu: 2 giây.
 *
 * Ngắn hơn thì tai nghe ra chu kỳ lặp; dài hơn chỉ tốn bộ nhớ vô ích. Phát lặp
 * với tốc độ hơi lệch 1.0 nên mối nối cũng không rơi đúng một chỗ mãi.
 */
const BUFFER_SECONDS = 2;

interface Graph {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Bộ dao động chậm điều biến âm lượng/bộ lọc — thứ tạo ra "nhịp" của sóng. */
  lfo: OscillatorNode | null;
}

export interface NoiseControls {
  /** Preset đang phát, `null` khi đang tắt. */
  playing: NoiseId | null;
  volume: number;
  setVolume: (v: number) => void;
  /** Bật preset, hoặc tắt nếu bấm lại đúng preset đang phát. */
  toggle: (id: NoiseId) => void;
  stop: () => void;
  /** Trình duyệt không có Web Audio — giao diện phải ẩn hẳn phần này đi. */
  supported: boolean;
}

export function useNoise(): NoiseControls {
  const [playing, setPlaying] = useState<NoiseId | null>(null);
  const [volume, setVolumeState] = useState(0.5);
  const graphRef = useRef<Graph | null>(null);
  const volumeRef = useRef(volume);

  const supported =
    typeof window !== 'undefined' &&
    typeof (window.AudioContext ?? window.webkitAudioContext) === 'function';

  const stop = useCallback(() => {
    const g = graphRef.current;
    graphRef.current = null;
    setPlaying(null);
    if (!g) return;

    /*
     * Hạ âm lượng trong 120ms rồi mới dừng.
     *
     * Cắt thẳng một luồng nhiễu đang chạy tạo ra tiếng "bụp" rất rõ — đó là
     * dạng sóng bị xén giữa chừng, không phải lỗi tưởng tượng.
     */
    try {
      const now = g.ctx.currentTime;
      g.gain.gain.cancelScheduledValues(now);
      g.gain.gain.setValueAtTime(g.gain.gain.value, now);
      g.gain.gain.linearRampToValueAtTime(0.0001, now + 0.12);
      g.source.stop(now + 0.14);
      g.lfo?.stop(now + 0.14);
      window.setTimeout(() => void g.ctx.close().catch(() => undefined), 260);
    } catch {
      // Nút đã dừng sẵn (bấm tắt hai lần rất nhanh) — không có gì để dọn thêm.
      void g.ctx.close().catch(() => undefined);
    }
  }, []);

  const toggle = useCallback(
    (id: NoiseId) => {
      if (playing === id) {
        stop();
        return;
      }
      stop();
      if (!supported) return;

      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      // iOS mở `AudioContext` ở trạng thái treo; phải đánh thức trong chính cử
      // chỉ chạm của người dùng, muộn hơn là trình duyệt từ chối.
      void ctx.resume().catch(() => undefined);

      const graph = buildGraph(ctx, id, volumeRef.current);
      graphRef.current = graph;
      setPlaying(id);
    },
    [playing, stop, supported],
  );

  const setVolume = useCallback((v: number) => {
    const safe = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    volumeRef.current = safe;
    setVolumeState(safe);
    const g = graphRef.current;
    if (!g) return;
    try {
      const now = g.ctx.currentTime;
      g.gain.gain.cancelScheduledValues(now);
      g.gain.gain.setTargetAtTime(safe * MASTER_CEILING, now, 0.05);
    } catch {
      /* context đã đóng */
    }
  }, []);

  // Rời màn hình là tắt tiếng. Thiếu dọn dẹp ở đây thì tiếng mưa còn kêu mãi
  // sau khi người dùng đã sang màn khác (CLAUDE.md R1 — dọn dẹp khi unmount).
  useEffect(() => stop, [stop]);

  return { playing, volume, setVolume, toggle, stop, supported };
}

// ---------------------------------------------------------------------------

/**
 * Trần âm lượng thật sự gửi ra loa.
 *
 * Thanh trượt 0–1 chỉ ánh xạ tới 0–0.35. Nhiễu băng rộng ở biên độ đầy nghe
 * to hơn nhạc cùng mức rất nhiều, và đây là thứ bật lên trong tai nghe.
 */
const MASTER_CEILING = 0.35;

function buildGraph(ctx: AudioContext, id: NoiseId, volume: number): Graph {
  const source = ctx.createBufferSource();
  source.buffer = makeNoiseBuffer(ctx, id === 'white' ? 'white' : 'brown');
  source.loop = true;
  // Lệch khỏi 1.0 để mối nối của vòng lặp không rơi đúng một nhịp mãi.
  source.playbackRate.value = 0.97;

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;

  let lfo: OscillatorNode | null = null;
  let tail: AudioNode = source;

  if (id === 'rain') {
    // Mưa: nhiễu nâu qua bộ lọc thông thấp — bỏ bớt phần chói, giữ tiếng rào rào.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    source.connect(hp);
    hp.connect(lp);
    tail = lp;
  } else if (id === 'wave') {
    /*
     * Sóng: nhiễu nâu, âm lượng lên xuống rất chậm (~0.08Hz ≈ 12 giây một
     * nhịp). Đó là toàn bộ khác biệt giữa "tiếng ù" và "tiếng sóng" — tai
     * người nhận ra con sóng bằng NHỊP, không phải bằng phổ tần.
     */
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    source.connect(lp);

    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    lp.connect(swell);

    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(swell.gain);
    lfo.start();

    tail = swell;
  }

  tail.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  // Lên dần trong 400ms, cùng lý do với lúc tắt.
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume * MASTER_CEILING), now + 0.4);

  return { ctx, source, gain, lfo };
}

/**
 * Đệm nhiễu một kênh.
 *
 * `white` là ngẫu nhiên đều. `brown` là tích phân của nhiễu trắng — năng lượng
 * dồn về tần số thấp, nghe giống mưa/sóng chứ không rít như nhiễu trắng thuần.
 * Phải chia lại biên độ sau khi tích phân, nếu không giá trị sẽ trôi ra ngoài
 * khoảng [-1, 1] và bị xén thành tiếng rè.
 */
function makeNoiseBuffer(ctx: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === 'white') {
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}
