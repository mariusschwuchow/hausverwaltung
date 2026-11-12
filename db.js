'use strict';
// ---- Speicher ----
// Alle Datensätze (Objekte, Einheiten, Mieter, Verträge, Zähler, Ablesungen,
// Zahlungen) liegen in IndexedDB und zusätzlich als Kopie in localStorage.
// Beim Start werden beide zusammengeführt (neuerer Stand gewinnt), damit nichts
// verloren geht, falls einer der beiden Speicher geleert wurde.
// Später lässt sich diese Schicht gegen eine Cloud-Datenbank tauschen, ohne
// dass sich der Rest der App ändern muss.

const Store = (() => {
  const DB_NAME = 'hausverwaltung';
  const DB_STORE = 'records';
  const LS_KEY = 'hausverwaltung-records-v1';
  const LS_BACKUP = 'hausverwaltung-last-backup';
  const LS_CHANGES = 'hausverwaltung-changes-since-backup';

  const records = new Map();
  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('IndexedDB nicht verfügbar'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => req.result.close();
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function dbRequest(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const result = fn(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(result && result.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }

  function readLocalCopy() {
    try { return JSON.parse(lsGet(LS_KEY)) || []; } catch { return []; }
  }
  const writeLocalCopy = () => lsSet(LS_KEY, JSON.stringify([...records.values()]));

  const newer = (a, b) => !b || String(a.updatedAt || '') > String(b.updatedAt || '');

  async function load() {
    let fromDb = [];
    try { fromDb = (await dbRequest('readonly', (s) => s.getAll())) || []; } catch (err) {
      console.warn('IndexedDB konnte nicht gelesen werden', err);
    }
    for (const r of [...readLocalCopy(), ...fromDb]) {
      if (r && r.id && r.type && newer(r, records.get(r.id))) records.set(r.id, r);
    }
    const dbById = new Map(fromDb.map((r) => [r.id, r]));
    const missing = [...records.values()].filter((r) => dbById.get(r.id) !== r);
    if (missing.length) {
      try { await dbRequest('readwrite', (s) => missing.forEach((r) => s.put(r))); } catch (err) {
        console.warn('IndexedDB konnte nicht geschrieben werden', err);
      }
    }
    writeLocalCopy();
  }

  function countChange(n = 1) {
    lsSet(LS_CHANGES, String((Number(lsGet(LS_CHANGES)) || 0) + n));
  }

  // Speichert in beiden Speichern. Erfolgreich, wenn mindestens einer klappt.
  async function putMany(list) {
    const now = new Date().toISOString();
    const prev = list.map((r) => records.get(r.id));
    for (const r of list) {
      if (!r.id) r.id = uid();
      if (!r.createdAt) r.createdAt = now;
      r.updatedAt = now;
      records.set(r.id, r);
    }
    let dbOk = false;
    try { await dbRequest('readwrite', (s) => list.forEach((r) => s.put(r))); dbOk = true; } catch (err) {
      console.warn('IndexedDB konnte nicht geschrieben werden', err);
    }
    const lsOk = writeLocalCopy();
    if (!dbOk && !lsOk) {
      list.forEach((r, i) => (prev[i] ? records.set(r.id, prev[i]) : records.delete(r.id)));
      throw new Error('Speichern fehlgeschlagen');
    }
    countChange(list.length);
    return list;
  }

  const put = async (r) => (await putMany([r]))[0];

  async function removeMany(ids) {
    ids.forEach((id) => records.delete(id));
    try { await dbRequest('readwrite', (s) => ids.forEach((id) => s.delete(id))); } catch (err) {
      console.warn('IndexedDB konnte nicht geschrieben werden', err);
    }
    writeLocalCopy();
    countChange(ids.length);
  }

  const all = (type) => [...records.values()].filter((r) => r.type === type);
  const get = (id) => (id ? records.get(id) : undefined);

  // ---- Sicherung ----
  function backupData() {
    return { app: 'hausverwaltung', version: 1, exportedAt: new Date().toISOString(), records: [...records.values()] };
  }

  function markBackup() {
    lsSet(LS_BACKUP, new Date().toISOString());
    lsSet(LS_CHANGES, '0');
  }

  async function restore(data) {
    const list = Array.isArray(data) ? data : data && data.records;
    if (!Array.isArray(list)) throw new Error('Keine gültige Sicherungsdatei');
    const take = list.filter((r) => r && r.id && r.type && newer(r, records.get(r.id)));
    take.forEach((r) => records.set(r.id, r));
    try { await dbRequest('readwrite', (s) => take.forEach((r) => s.put(r))); } catch (err) {
      console.warn('IndexedDB konnte nicht geschrieben werden', err);
    }
    writeLocalCopy();
    return { taken: take.length, skipped: list.length - take.length };
  }

  async function clearAll() {
    await removeMany([...records.keys()]);
  }

  function backupStatus() {
    return { last: lsGet(LS_BACKUP), changes: Number(lsGet(LS_CHANGES)) || 0, total: records.size };
  }

  async function requestPersistent() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try { return (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { return false; }
  }

  return { load, put, putMany, removeMany, all, get, backupData, markBackup, restore, clearAll, backupStatus, requestPersistent };
})();
