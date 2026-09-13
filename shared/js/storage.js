/* ================================================================
   storage.js — A: drive storage via File System Access API
   Falls back to localStorage if not connected.
   ================================================================ */

const GracefulStorage = (() => {
  let _dirHandle = null;  // FileSystemDirectoryHandle for session

  // ── CONNECT ──────────────────────────────────────────────────────
  // Call this once per session from a button click (requires user gesture)
  async function connectStorage() {
    if (!window.showDirectoryPicker) {
      console.warn('File System Access API not supported — using localStorage fallback.');
      return false;
    }
    try {
      _dirHandle = await window.showDirectoryPicker({
        id: 'graceful-storage',
        mode: 'readwrite',
        startIn: 'documents'
      });
      console.log('Connected to directory:', _dirHandle.name);
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') console.error('connectStorage error:', e);
      return false;
    }
  }

  function isConnected() {
    return !!_dirHandle;
  }

  // ── WRITE FILE ────────────────────────────────────────────────────
  async function writeFile(filename, data) {
    if (!_dirHandle) return false;
    try {
      const fileHandle = await _dirHandle.getFileHandle(filename, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      return true;
    } catch (e) {
      console.error('writeFile error:', e);
      return false;
    }
  }

  // ── READ FILE ─────────────────────────────────────────────────────
  async function readFile(filename) {
    if (!_dirHandle) return null;
    try {
      const fileHandle = await _dirHandle.getFileHandle(filename);
      const file       = await fileHandle.getFile();
      const text       = await file.text();
      return JSON.parse(text);
    } catch (e) {
      if (e.name !== 'NotFoundError') console.error('readFile error:', e);
      return null;
    }
  }

  // ── CLIENTS ───────────────────────────────────────────────────────
  // Save ALL client records to clients.json on A: drive
  async function saveClients() {
    // Collect from localStorage
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('graceful_client_')) {
        try { all[k] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
      }
    }
    const ok = await writeFile('graceful_clients.json', { savedAt: new Date().toISOString(), clients: all });
    if (ok) console.log('Clients saved to A: drive');
    return ok;
  }

  // Load clients.json from A: drive and merge into localStorage
  async function loadClients() {
    const data = await readFile('graceful_clients.json');
    if (!data || !data.clients) return false;
    Object.entries(data.clients).forEach(([k, v]) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
    });
    console.log('Clients loaded from A: drive, saved at', data.savedAt);
    return true;
  }

  // ── AUTO-SYNC ─────────────────────────────────────────────────────
  // Call this after any save to keep A: drive in sync
  async function sync() {
    if (!_dirHandle) return;
    await saveClients();
  }

  return { connectStorage, isConnected, writeFile, readFile, saveClients, loadClients, sync };
})();
