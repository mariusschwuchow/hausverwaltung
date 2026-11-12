'use strict';
// ---- Mieten, Mietkonto, Kontoauszug-Import, Zahlungsabgleich ----

const Finance = (() => {
  // Gültige Staffel für einen Monat: die letzte mit "ab" <= Monat.
  function staffel(v, ym) {
    const list = [...(v.staffeln || [])].filter((s) => s.ab).sort(byKey('ab'));
    let found = null;
    for (const s of list) if (s.ab <= ym) found = s;
    return found;
  }

  const gesamt = (s) => s ? round2((s.kalt || 0) + (s.nk || 0) + (s.hk || 0)) : 0;

  // Sollmiete eines Monats. Beginn oder Ende mitten im Monat werden tagesgenau anteilig gerechnet.
  function soll(v, ym) {
    if (!v.beginn || ym < v.beginn.slice(0, 7)) return null;
    if (v.ende && ym > v.ende.slice(0, 7)) return null;
    const s = staffel(v, ym);
    if (!s) return null;
    const dim = daysInMonth(ym);
    let first = 1;
    let last = dim;
    if (v.beginn.slice(0, 7) === ym) first = Number(v.beginn.slice(8, 10));
    if (v.ende && v.ende.slice(0, 7) === ym) last = Number(v.ende.slice(8, 10));
    const f = Math.max(0, last - first + 1) / dim;
    const kalt = round2((s.kalt || 0) * f);
    const nk = round2((s.nk || 0) * f);
    const hk = round2((s.hk || 0) * f);
    return { kalt, nk, hk, gesamt: round2(kalt + nk + hk), anteilig: f < 1 };
  }

  const isActive = (v, date = todayIso()) => v.beginn && v.beginn <= date && (!v.ende || v.ende >= date);
  const zahlungen = (vertragId) => Store.all('zahlung').filter((z) => z.vertragId === vertragId);

  // Mietkonto bis einschließlich "until" (Standard: aktueller Monat).
  function konto(v, until = currentMonth()) {
    const months = new Set();
    // "kontoAb": Mietkonto erst ab diesem Monat führen (z. B. bei übernommenen Verträgen ohne alte Zahlungen).
    const start = [v.beginn ? v.beginn.slice(0, 7) : '', v.kontoAb || ''].sort()[1];
    if (start) {
      const end = v.ende && v.ende.slice(0, 7) < until ? v.ende.slice(0, 7) : until;
      monthsRange(start, end).forEach((m) => months.add(m));
    }
    const pays = zahlungen(v.id).filter((z) => !v.kontoAb || !z.monat || z.monat >= v.kontoAb);
    pays.forEach((z) => z.monat && months.add(z.monat));
    let saldo = 0;
    return [...months].sort().map((m) => {
      const s = m <= until ? soll(v, m) : null;
      const sollBetrag = s ? s.gesamt : 0;
      const ps = pays.filter((z) => z.monat === m);
      const ist = round2(ps.reduce((a, z) => a + z.betrag, 0));
      saldo = round2(saldo + ist - sollBetrag);
      return { monat: m, soll: sollBetrag, anteilig: s && s.anteilig, ist, diff: round2(ist - sollBetrag), saldo, zahlungen: ps };
    });
  }

  function saldo(v) {
    const k = konto(v);
    return k.length ? k[k.length - 1].saldo : 0;
  }

  // ---- CSV ----
  function decode(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch {
      return new TextDecoder('windows-1252').decode(buffer); // viele Bank-CSVs
    }
  }

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const sample = text.split(/\r?\n/).slice(0, 30).join('\n');
    const count = (ch) => sample.split(ch).length;
    const delim = [';', '\t', ','].reduce((a, b) => (count(b) > count(a) ? b : a));
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) { row.push(cell.trim()); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim()); cell = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell.trim());
    if (row.some((x) => x !== '')) rows.push(row);
    return rows;
  }

  function headerRow(rows) {
    const i = rows.findIndex((r) => r.some((c) => /betrag|umsatz|amount/i.test(c)) && r.some((c) => /datum|buchung|date|tag/i.test(c)));
    return i === -1 ? 0 : i;
  }

  const PATTERNS = {
    datum: [/^buchungstag$/i, /buchungsdatum/i, /^buchung$/i, /^datum$/i, /valuta|wertstellung/i, /datum|date/i],
    betrag: [/^betrag/i, /umsatz/i, /betrag|amount/i],
    name: [/beg(ü|ue)nstigter.*zahlungspflichtiger|zahlungspflichtiger.*beg(ü|ue)nstigter/i, /zahlungsbeteiligter/i, /auftraggeber|zahlungspflichtiger/i, /beg(ü|ue)nstigter|empf(ä|ae)nger/i, /^name/i, /name/i],
    zweck: [/verwendungszweck/i, /beschreibung|zweck|purpose/i, /buchungstext/i],
    iban: [/iban/i, /kontonummer|konto-nr/i],
  };

  function guessMapping(header) {
    const map = {};
    const used = new Set();
    for (const [field, pats] of Object.entries(PATTERNS)) {
      for (const p of pats) {
        const i = header.findIndex((h, idx) => !used.has(idx) && p.test(h));
        if (i !== -1) { map[field] = i; used.add(i); break; }
      }
    }
    return map;
  }

  function parseAmount(s) {
    if (s == null) return NaN;
    let t = String(s).replace(/[\s€EUR]/gi, '');
    let neg = false;
    if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); }
    const lc = t.lastIndexOf(',');
    const ld = t.lastIndexOf('.');
    if (lc > ld) t = t.replace(/\./g, '').replace(',', '.');
    else if (ld > lc && lc !== -1) t = t.replace(/,/g, '');
    const n = parseFloat(t);
    return neg ? -n : n;
  }

  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  // Zahlungen ab dem 25. eines Monats gelten als Miete für den Folgemonat.
  const monatFuer = (datum) => (Number(datum.slice(8, 10)) >= 25 ? addMonths(datum.slice(0, 7), 1) : datum.slice(0, 7));

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

  // Sucht den passenden Vertrag für eine Zahlung. Gibt nur ein eindeutiges Ergebnis zurück.
  function match(z) {
    const text = words(`${z.name} ${z.zweck}`);
    const scored = Store.all('vertrag')
      .filter((v) => isActive(v, z.datum) || isActive(v, addDays(z.datum, 10)))
      .map((v) => {
        let score = 0;
        const mieter = (v.mieterIds || []).map(Store.get).filter(Boolean);
        if (z.iban && mieter.some((m) => m.iban && norm(m.iban) === norm(z.iban))) score += 100;
        const begriffe = String(v.suchbegriffe || '').split(',').map((b) => words(b).trim()).filter(Boolean);
        if (begriffe.some((b) => text.includes(b))) score += 80;
        if (mieter.some((m) => m.nachname && words(m.nachname).length > 2 && text.includes(words(m.nachname)))) score += 50;
        const s = soll(v, monatFuer(z.datum));
        if (s && Math.abs(s.gesamt - z.betrag) < 0.005) score += 30;
        return { v, score };
      })
      .filter((x) => x.score >= 50)
      .sort((a, b) => b.score - a.score);
    if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
    return scored[0].v;
  }

  return { staffel, gesamt, soll, isActive, zahlungen, konto, saldo, decode, parseCsv, headerRow, guessMapping, parseAmount, parseDate, monatFuer, match };
})();
