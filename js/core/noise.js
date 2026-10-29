(function () {
  'use strict';
  // 哄睡声音：现场生成白噪音、粉红噪音、棕色噪音和嘘嘘声，不用音频文件，也没有版权问题。
  // 生成几秒能无缝循环的一段，做成 WAV，页面上用 <audio loop> 放
  const Baby = globalThis.Baby || (globalThis.Baby = {});

  const KINDS = [
    { id: 'white', name: '白噪音', about: '沙沙的，像电视没信号' },
    { id: 'pink', name: '粉红噪音', about: '柔和一些，像下雨' },
    { id: 'brown', name: '棕色噪音', about: '低沉的轰轰声，像瀑布' },
    { id: 'shush', name: '嘘嘘声', about: '一阵一阵的「嘘——」' },
  ];
  const RATE = 22050;
  const SECONDS = 4;
  // 嘘嘘声每 2 秒一下：前 70% 是「嘘——」，后面轻轻的
  const SHUSH_PERIOD = 2;
  const SHUSH_ON = 0.7;
  const SHUSH_LOW = 0.12;
  // 循环接头处交叉淡入淡出的秒数，接上时听不出咔哒声
  const FADE = 0.25;

  /** 线性同余的伪随机数，-1～1；同一个 seed 出来的一样 */
  function random(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return (s / 4294967296) * 2 - 1;
    };
  }

  /** 生成能无缝循环的一段，样本在 -1～1 之间，最响的地方是 0.9 */
  function samples(kind, { rate = RATE, seconds = SECONDS, seed = 7 } = {}) {
    const n = Math.round(rate * seconds);
    const extra = Math.round(rate * FADE);
    const raw = new Float32Array(n + extra);
    const rnd = random(seed);
    // 粉红噪音用 Paul Kellet 的滤波；棕色噪音是白噪音积分；嘘嘘声去掉低频，听着更尖
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    let last = 0;
    let prev = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const w = rnd();
      if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        raw[i] = last;
      } else if (kind === 'shush') {
        raw[i] = w - prev;
        prev = w;
      } else {
        raw[i] = w;
      }
    }
    for (let i = 0; i < extra; i += 1) {
      const t = i / extra;
      raw[i] = raw[i] * t + raw[n + i] * (1 - t);
    }
    const out = raw.slice(0, n);
    if (kind === 'shush') {
      const period = rate * SHUSH_PERIOD;
      for (let i = 0; i < n; i += 1) {
        const ph = (i % period) / period;
        out[i] *= ph < SHUSH_ON ? SHUSH_LOW + (1 - SHUSH_LOW) * Math.sin((Math.PI * ph) / SHUSH_ON) ** 0.6 : SHUSH_LOW;
      }
    }
    let peak = 0;
    for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < n; i += 1) out[i] = (out[i] / peak) * 0.9;
    return out;
  }

  /** 16 位单声道 PCM 的 WAV 文件内容 */
  function wav(data, rate = RATE) {
    const bytes = new Uint8Array(44 + data.length * 2);
    const v = new DataView(bytes.buffer);
    const tag = (at, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(at + i, s.charCodeAt(i)); };
    tag(0, 'RIFF');
    v.setUint32(4, 36 + data.length * 2, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    tag(36, 'data');
    v.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i += 1) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), true);
    return bytes;
  }

  Baby.noise = { KINDS, RATE, SECONDS, SHUSH_PERIOD, SHUSH_ON, samples, wav };
})();
