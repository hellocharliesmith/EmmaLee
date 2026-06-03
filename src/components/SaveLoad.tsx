import { useState, useRef, useEffect } from 'react';
import type { SavedSong } from '../types';

interface Props {
  songs: SavedSong[];
  onSave: (name: string) => void;
  onLoad: (song: SavedSong) => void;
  onDelete: (id: string) => void;
}

export function SaveLoad({ songs, onSave, onLoad, onDelete }: Props) {
  const [showSave, setShowSave]       = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSave) { setName(''); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [showSave]);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim());
    setShowSave(false);
  }

  const pendingSong = songs.find(s => s.id === pendingDelete);

  return (
    <>
      <div className="sl-wrap">
        <button className="sl-btn" onClick={() => setShowSave(true)}>Save</button>

        {songs.length > 0 && (
          <div className="sl-dropdown-wrap">
            <button className="sl-btn sl-songs-btn" onClick={() => setShowDropdown(v => !v)}>
              Songs ({songs.length}) ▾
            </button>
            {showDropdown && (
              <>
                <div className="sl-backdrop" onClick={() => setShowDropdown(false)} />
                <div className="sl-dropdown">
                  {songs.map(song => (
                    <div key={song.id} className="sl-row">
                      <div className="sl-info">
                        <span className="sl-name">{song.name}</span>
                        <span className="sl-date">{new Date(song.savedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="sl-actions">
                        <button className="sl-load" onClick={() => { onLoad(song); setShowDropdown(false); }}>
                          Load
                        </button>
                        <button className="sl-del" onClick={() => { setPendingDelete(song.id); setShowDropdown(false); }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Save modal */}
      {showSave && (
        <div className="modal-backdrop" onClick={() => setShowSave(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Save Song</h3>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="Song name…"
              value={name}
              maxLength={60}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setShowSave(false);
              }}
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowSave(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleSave} disabled={!name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {pendingDelete && (
        <div className="modal-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete "{pendingSong?.name}"?</h3>
            <p className="modal-body">This can't be undone.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="modal-confirm modal-danger" onClick={() => { onDelete(pendingDelete); setPendingDelete(null); }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
