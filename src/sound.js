/**
 * 合成按键音：短噪声脉冲 + 带通滤波，模拟机械轴“咔哒”声。
 * 无外部音频资源，全部由 WebAudio 实时合成。
 */
let ctx = null;
let noiseBuf = null;
let enabled = true;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 0.06);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setSoundEnabled(on) {
  enabled = on;
  if (on) ensure();
}

/** 播放一次轴体触发声；pitch 微微随机，避免连续打字机械感过强 */
export function playClick(down = true) {
  if (!enabled || !ensure()) return;
  const t = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (down ? 2600 : 1500) * (0.94 + Math.random() * 0.12);
  bp.Q.value = 1.1;

  const gain = ctx.createGain();
  const peak = down ? 0.16 : 0.07;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (down ? 0.05 : 0.07));

  src.connect(bp).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.09);
}
