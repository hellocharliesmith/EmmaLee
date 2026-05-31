import { useRef, useEffect, useState } from 'react';
import { getAnalyser, getDSPLoad } from '../audio/engine';

const H = 80; // display height in CSS px

// dB lines to draw — amplitude = 10^(dB/20)
const DB_LINES: { db: number; label: string; alpha: number }[] = [
  { db:   0, label: '0',   alpha: 0.25 },
  { db:  -6, label: '-6',  alpha: 0.15 },
  { db: -12, label: '-12', alpha: 0.10 },
  { db: -18, label: '-18', alpha: 0.08 },
];

function dbToAmp(db: number) { return Math.pow(10, db / 20); }

function dspColor(load: number) {
  if (load > 0.75) return '#ef4444';
  if (load > 0.5)  return '#d2a050';
  return '#6b7280';
}

export function WaveformMeter() {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const dataRef   = useRef<Float32Array<ArrayBuffer> | null>(null);
  const [dsp, setDsp] = useState(0);

  // Scrolling history: one {min, max} entry per CSS-pixel column
  const historyRef = useRef<{ min: number; max: number }[]>([]);

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
      // Reset history to new width
      historyRef.current = Array.from({ length: w }, () => ({ min: 0, max: 0 }));
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ── Draw loop ─────────────────────────────────────────────────────────
    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      if (document.hidden) return; // pause when tab not visible

      // Update DSP load display (sampled every frame, updated in React state)
      setDsp(getDSPLoad());

      const analyser = getAnalyser();
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;

      const dw = canvas!.width;   // device pixels
      const dh = canvas!.height;
      const cw = dw / dpr;        // CSS pixels
      void dh; // used indirectly via dpr

      // Read audio data
      if (analyser) {
        if (!dataRef.current || dataRef.current.length !== analyser.fftSize) {
          dataRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        }
        analyser.getFloatTimeDomainData(dataRef.current);

        let mn = 0, mx = 0;
        const d = dataRef.current;
        for (let i = 0; i < d.length; i++) {
          if (d[i] < mn) mn = d[i];
          if (d[i] > mx) mx = d[i];
        }

        const hist = historyRef.current;
        hist.push({ min: mn, max: mx });
        if (hist.length > cw) hist.shift();
      }

      // ── Background ──────────────────────────────────────────────────────
      ctx.fillStyle = '#0d0f12';
      ctx.fillRect(0, 0, dw, dh);

      // ── dB grid lines ───────────────────────────────────────────────────
      ctx.save();
      ctx.scale(dpr, dpr);

      DB_LINES.forEach(({ db, label, alpha }) => {
        const amp = dbToAmp(db);
        const y0  = H / 2 - amp * H / 2;
        const y1  = H / 2 + amp * H / 2;

        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth   = 1;
        ctx.setLineDash(db === 0 ? [] : [3, 4]);
        ctx.beginPath();
        if (db === 0) {
          ctx.moveTo(0, H / 2); ctx.lineTo(cw, H / 2);
        } else {
          ctx.moveTo(0, y0); ctx.lineTo(cw, y0);
          ctx.moveTo(0, y1); ctx.lineTo(cw, y1);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        if (db !== 0) {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 1.5})`;
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText(label, 4, y0 - 2);
        }
      });

      // ── Waveform ─────────────────────────────────────────────────────────
      const hist = historyRef.current;
      const halfH = H / 2;

      // Glow layer (wider, transparent)
      ctx.fillStyle = 'rgba(196, 132, 154, 0.12)';
      for (let i = 0; i < hist.length; i++) {
        const { min, max } = hist[i];
        const yTop = halfH - max * halfH * 1.08;
        const yBot = halfH - min * halfH * 1.08;
        ctx.fillRect(i, yTop, 1, Math.max(1, yBot - yTop));
      }

      // Main fill — vertical gradient for depth
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0,   'rgba(196, 132, 154, 0.55)');
      grad.addColorStop(0.5, 'rgba(212, 148, 168, 0.95)');
      grad.addColorStop(1,   'rgba(196, 132, 154, 0.55)');
      ctx.fillStyle = grad;
      for (let i = 0; i < hist.length; i++) {
        const { min, max } = hist[i];
        const yTop = halfH - max * halfH;
        const yBot = halfH - min * halfH;
        ctx.fillRect(i, yTop, 1, Math.max(1, yBot - yTop));
      }

      // Bright edge lines (top + bottom of waveform envelope)
      ctx.strokeStyle = 'rgba(228, 180, 196, 0.7)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const y = halfH - hist[i].max * halfH;
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const y = halfH - hist[i].min * halfH;
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.stroke();

      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const pct   = Math.round(dsp * 100);
  const color = dspColor(dsp);

  return (
    <div ref={wrapRef} className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="dsp-overlay">
        <span className="dsp-label">DSP</span>
        <div className="dsp-bar">
          <div className="dsp-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
        </div>
        <span className="dsp-pct" style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
}
