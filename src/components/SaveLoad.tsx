import { useState, useRef, useEffect } from 'react';
import type { SavedSong } from '../types';
import { DEMO_SONGS } from '../demoSongs';

interface Props {
  songs: SavedSong[];
  currentSongName: string;
  currentSongKind: 'demo' | 'saved' | 'new';
  onSave: (name: string) => void;
  onLoad: (song: SavedSong) => void;
  onDelete: (id: string) => void;
  onNewSong: () => void;
  onExport: (name: string) => void;
  onImport: (song: SavedSong) => void;
}

const KIND_LABEL: Record<Props['currentSongKind'], string> = {
  demo: 'Example song', saved: 'Your song', new: 'New, unsaved song',
};

export function SaveLoad({ songs, currentSongName, currentSongKind, onSave, onLoad, onDelete, onNewSong, onExport, onImport }: Props) {
  const [showSave, setShowSave]           = useState(false);
  const [showExport, setShowExport]       = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [importError, setImportError]     = useState<string | null>(null);
  const [name, setName] = useState('');
  const inputRef     = useRef<HTMLInputElement>(null);
  const exportRef    = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSave)   { setName(''); setTimeout(() => inputRef.current?.focus(),  40); }
    if (showExport) { setName(''); setTimeout(() => exportRef.current?.focus(), 40); }
  }, [showSave, showExport]);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim());
    setShowSave(false);
  }

  function handleExport() {
    if (!name.trim()) return;
    onExport(name.trim());
    setShowExport(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as SavedSong;
        if (!parsed.state || !parsed.name) throw new Error('Unrecognised file format');
        onImport({ ...parsed, id: crypto.randomUUID(), savedAt: Date.now() });
        setImportError(null);
      } catch {
        setImportError('Could not read that file — make sure it\'s an Emma Lee export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const pendingSong = songs.find(s => s.id === pendingDelete);

  return (
    <>
      <div className="sl-wrap">
        <input ref={fileInputRef} type="file" accept=".json,application/json"
          style={{ display: 'none' }} onChange={handleFileChange} />

        <div className="sl-dropdown-wrap">
          <button className="sl-btn sl-songs-btn" onClick={() => setShowDropdown(v => !v)}>
            <span className="sl-trigger-name">{currentSongName}</span>
            <span className="sl-trigger-caret">▾</span>
          </button>
          {showDropdown && (
            <>
              <div className="sl-backdrop" onClick={() => setShowDropdown(false)} />
              <div className="sl-dropdown sl-dropdown-full">

                {/* ── What's loaded right now ── */}
                <div className="sl-current">
                  <div className="sl-current-lbl">Now loaded</div>
                  <div className="sl-current-name">{currentSongName}</div>
                  <div className="sl-current-kind">{KIND_LABEL[currentSongKind]}</div>
                </div>

                {/* ── Actions ── */}
                <div className="sl-menu-actions">
                  <button className="sl-menu-action" onClick={() => { onNewSong(); setShowDropdown(false); }}>New</button>
                  <button className="sl-menu-action" onClick={() => { setShowDropdown(false); setShowSave(true); }}>Save</button>
                  <button className="sl-menu-action" onClick={() => { setShowDropdown(false); setShowExport(true); }}>Export</button>
                  <button className="sl-menu-action" onClick={() => { setShowDropdown(false); fileInputRef.current?.click(); }}>Import</button>
                </div>

                {/* ── Demo / example songs — always present, not deletable ── */}
                <div className="sl-section-label">Examples</div>
                {DEMO_SONGS.map(demo => (
                  <div key={demo.id} className={`sl-row sl-row-demo${demo.name === currentSongName ? ' sl-row-current' : ''}`}>
                    <div className="sl-info">
                      <span className="sl-name">{demo.name}</span>
                    </div>
                    <div className="sl-actions">
                      <button className="sl-load"
                        onClick={() => { onLoad({ ...demo, savedAt: 0 }); setShowDropdown(false); }}>
                        Load
                      </button>
                    </div>
                  </div>
                ))}

                {/* ── User-saved songs ── */}
                <div className="sl-section-label">Your songs</div>
                {songs.length === 0 && <div className="sl-empty">Nothing saved yet — hit Save to add one.</div>}
                {songs.map(song => (
                  <div key={song.id} className={`sl-row${song.name === currentSongName ? ' sl-row-current' : ''}`}>
                    <div className="sl-info">
                      <span className="sl-name">{song.name}</span>
                      <span className="sl-date">{new Date(song.savedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="sl-actions">
                      <button className="sl-load"
                        onClick={() => { onLoad(song); setShowDropdown(false); }}>
                        Load
                      </button>
                      <button className="sl-del"
                        onClick={() => { setPendingDelete(song.id); setShowDropdown(false); }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

              </div>
            </>
          )}
        </div>
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

      {/* Export modal */}
      {showExport && (
        <div className="modal-backdrop" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Export Song</h3>
            <p className="modal-body">Downloads a .json file with your song and all voice settings.</p>
            <input
              ref={exportRef}
              className="modal-input"
              placeholder="Song name…"
              value={name}
              maxLength={60}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleExport();
                if (e.key === 'Escape') setShowExport(false);
              }}
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowExport(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleExport} disabled={!name.trim()}>Download</button>
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
              <button className="modal-confirm modal-danger"
                onClick={() => { onDelete(pendingDelete); setPendingDelete(null); }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import error toast */}
      {importError && (
        <div className="modal-backdrop" onClick={() => setImportError(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Import failed</h3>
            <p className="modal-body">{importError}</p>
            <div className="modal-actions">
              <button className="modal-confirm" onClick={() => setImportError(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
