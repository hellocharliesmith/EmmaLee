import { useState, useCallback } from 'react';
import type { SavedSong, SongState } from '../types';

const KEY = 'emma-lee:songs';

function loadFromStorage(): SavedSong[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

export function useSavedSongs() {
  const [songs, setSongs] = useState<SavedSong[]>(loadFromStorage);

  const save = useCallback((name: string, state: SongState) => {
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
  }, []);

  const remove = useCallback((id: string) => {
    setSongs(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { songs, save, remove };
}
