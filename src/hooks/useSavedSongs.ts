import { useState, useCallback } from 'react';
import type { SavedSong, SongState } from '../types';

const KEY = 'emma-lee:songs';

function loadFromStorage(): SavedSong[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

export function useSavedSongs() {
  const [songs, setSongs] = useState<SavedSong[]>(loadFromStorage);

  // Returns the new song's id — the id itself is generated synchronously
  // (only the setSongs write is deferred), so callers can immediately track
  // "this is now the loaded saved song" (see App.tsx's currentSongId, used to
  // make a later plain Save update this song in place instead of creating
  // yet another copy).
  const save = useCallback((name: string, state: SongState): string => {
    const song: SavedSong = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim() || 'Untitled',
      savedAt: Date.now(),
      state,
    };
    setSongs(prev => {
      const next = [song, ...prev];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
    return song.id;
  }, []);

  // Update an existing saved song's state in place (bumping savedAt) — used
  // when Save is hit on an already-saved song, instead of always minting a
  // fresh id via `save()`. Same read-modify-write localStorage pattern as
  // remove() above. No-op if the id isn't found (e.g. it was deleted elsewhere).
  const update = useCallback((id: string, state: SongState) => {
    setSongs(prev => {
      const next = prev.map(s => s.id === id ? { ...s, state, savedAt: Date.now() } : s);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSongs(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { songs, save, update, remove };
}
