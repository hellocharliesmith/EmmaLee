import { useRef, useEffect, useState } from 'react';
import { getAnalysers, getDSPLoad } from '../audio/engine';

const H = 80; // display height in CSS px

function dspColor(load: number) {
  if (load > 0.75) return '#ef4444';
  if (load > 0.5)  return '#d2a050';
  return '#6b7280';
}

// Canvas fillStyle/strokeStyle can't read CSS custom properties directly —
// resolve --accent to actual RGB once per draw so the waveform follows the
// active track's color.
function accentRgb(el: HTMLElement): [number, number, number] {
  const hex = getComputedStyle(el).getPropertyValue('--accent').trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [196, 132, 154]; // fallback: original rose accent
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function peakOf(data: Float32Array<ArrayBuffer>) {
  let mn = 0, mx = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < mn) mn = data[i];
    if (data[i] > mx) mx = data[i];
  }
  return { mn, mx };
}

interface Frame { minL: number; maxL: number; minR: number; maxR: number; }

export function WaveformMeter() {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const dataL     = useRef<Float32Array<ArrayBuffer> | null>(null);
  const dataR     = useRef<Float32Array<ArrayBuffer> | null>(null);
  const historyRef = useRef<Frame[]>([]);
  const [dsp, setDsp] = useState(0);

  useEffect(() => {
    const wrap   = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const w = wrap!.clientWidth;
      canvas!.width  = w * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width  = `${w}px`;
      canvas!.style.height = `${H}px`;
      historyRef.current = Array.from({ length: w }, () => ({ minL:0, maxL:0, minR:0, maxR:0 }));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      setDsp(getDSPLoad());

      const [aL, aR] = getAnalysers();
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;

      const dw = canvas!.width;
      const cw = dw / dpr;
      const hh = H / 2; // half height for each channel

      if (aL && aR) {
        const fftSize = aL.fftSize;
        if (!dataL.current || dataL.current.length !== fftSize)
          dataL.current = new Float32Array(new ArrayBuffer(fftSize * 4));
        if (!dataR.current || dataR.current.length !== fftSize)
          dataR.current = new Float32Array(new ArrayBuffer(fftSize * 4));
        aL.getFloatTimeDomainData(dataL.current);
        aR.getFloatTimeDomainData(dataR.current);
        const { mn: minL, mx: maxL } = peakOf(dataL.current);
        const { mn: minR, mx: maxR } = peakOf(dataR.current);
        const hist = historyRef.current;
        hist.push({ minL, maxL, minR, maxR });
        if (hist.length > cw) hist.shift();
      }

      // Background (matches --neutral-dark-950)
      ctx.fillStyle = '#131211';
      ctx.fillRect(0, 0, dw, H * dpr);

      ctx.save();
      ctx.scale(dpr, dpr);

      // Center divider
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(cw, hh); ctx.stroke();

      // dB guide lines (L channel — top half)
      [-6, -12].forEach(db => {
        const amp = Math.pow(10, db / 20);
        const y   = hh - amp * hh;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(`${db}`, 3, y - 2);
      });

      const hist = historyRef.current;
      const [ar, ag, ab] = accentRgb(wrap!);

      const c = ctx; // non-null alias for use inside inner functions
      function drawChannel(
        getTop: (f: Frame) => number,
        getBot: (f: Frame) => number,
        yOffset: number
      ) {
        c.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.1)`;
        for (let i = 0; i < hist.length; i++) {
          const t = getTop(hist[i]) * 1.05;
          const b = getBot(hist[i]) * 1.05;
          c.fillRect(i, yOffset + t, 1, Math.max(1, b - t));
        }
        const grad = c.createLinearGradient(0, yOffset, 0, yOffset + hh);
        grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.9)`);
        grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0.4)`);
        c.fillStyle = grad;
        for (let i = 0; i < hist.length; i++) {
          const t = getTop(hist[i]);
          const b = getBot(hist[i]);
          c.fillRect(i, yOffset + t, 1, Math.max(1, b - t));
        }
        c.strokeStyle = `rgba(${Math.min(255, ar + 32)}, ${Math.min(255, ag + 48)}, ${Math.min(255, ab + 42)}, 0.6)`;
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < hist.length; i++) {
          const y = yOffset + getTop(hist[i]);
          i === 0 ? c.moveTo(i, y) : c.lineTo(i, y);
        }
        c.stroke();
      }

      // L channel — top half (high amplitude = toward top = y small)
      drawChannel(
        f => hh - f.maxL * hh,   // top of L fill
        f => hh - f.minL * hh,   // bottom of L fill
        0
      );

      // R channel — bottom half (high amplitude = toward bottom = y large)
      drawChannel(
        f => f.minR * hh,         // top of R fill (minR is negative → negative offset from hh)
        f => f.maxR * hh,         // bottom of R fill
        hh
      );

      // Channel labels
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText('L', cw - 14, 10);
      ctx.fillText('R', cw - 14, hh + 10);

      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  const pct   = dsp * 100;
  const color = dspColor(dsp);
  const label = dsp === 0 ? '—' : pct < 1 ? '< 1%' : `${pct.toFixed(1)}%`;

  return (
    <div ref={wrapRef} className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="dsp-overlay">
        <span className="dsp-label">DSP</span>
        <div className="dsp-bar">
          <div className="dsp-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
        </div>
        <span className="dsp-pct" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}
