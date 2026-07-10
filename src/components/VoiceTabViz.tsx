import { useEffect, useRef } from 'react';
import { onVoiceTrigger, type TrackId as EngineTrackId } from '../audio/engine';

// Matches buildNotes()'s ~4-octave melodic range (C3-B6, useSequencer.ts) down
// to the lowest drum voice (kick, MIDI 36) and up past the highest (hi-hat, 60)
// with headroom on both ends so nothing sits flush against an edge.
const MIDI_MIN = 24, MIDI_MAX = 108;

export interface VoiceTabVizProps {
  tracks: EngineTrackId[] | 'all';
  color: string; // resolved CSS color (or var()) for this tab's dots — see App.tsx
}

// Firefly-scatter activity indicator for a track tab: each note-on becomes a
// small dot that flashes in and fades, positioned left-to-right by pitch and
// sized by velocity. Dots are plain DOM nodes appended/removed imperatively
// (bypassing React state) so a fast run of notes never triggers a re-render —
// same reasoning as LfoScope's direct SVG-path mutation.
export function VoiceTabViz({ tracks, color }: VoiceTabVizProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onVoiceTrigger(e => {
      if (tracks !== 'all' && !tracks.includes(e.trackId)) return;
      const el = containerRef.current;
      if (!el) return;

      const x = Math.max(0, Math.min(1, (e.pitch - MIDI_MIN) / (MIDI_MAX - MIDI_MIN)));
      const size = 4 + Math.max(0, Math.min(1, e.velocity)) * 4;
      const jitterY = (Math.random() - 0.5) * 14;

      const dot = document.createElement('span');
      dot.className = 'voice-dot';
      dot.style.left = `${(x * 100).toFixed(1)}%`;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.marginTop = `${jitterY.toFixed(1)}px`;
      dot.style.background = color;
      dot.addEventListener('animationend', () => dot.remove());
      el.appendChild(dot);
    });
  }, [tracks, color]);

  return <div ref={containerRef} className="voice-tab-viz" />;
}
