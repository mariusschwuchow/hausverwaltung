'use strict';
// ---- Zähler: Ablesungen, Plausibilitätsprüfung, Zählertausch, Verbrauch ----

const Meters = (() => {
  const ARTEN = ['Kaltwasser', 'Warmwasser', 'Wärme (Heizung)', 'Heizkostenverteiler', 'Strom', 'Gas', 'Sonstiges'];
  const EINHEITEN = ['m³', 'kWh', 'MWh', 'Einheiten'];

  const readings = (zaehlerId) => Store.all('ablesung')
    .filter((a) => a.zaehlerId === zaehlerId)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.stand - b.stand);

  function median(list) {
    if (!list.length) return null;
    const s = [...list].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // Prüft alle Ablesungen eines Zählers und liefert Zeilen mit Verbrauch und Hinweisen.
  function analyse(z) {
    const list = readings(z.id);
    const today = todayIso();
    const rows = list.map((r, i) => {
      const prev = list[i - 1];
      const row = { ...r, issues: [], delta: null, days: null, perDay: null };
      if (prev) {
        row.delta = r.stand - prev.stand;
        row.days = daysBetween(prev.datum, r.datum);
        row.perDay = row.days > 0 ? row.delta / row.days : null;
      }
      if (r.datum > today) row.issues.push({ level: 'error', text: 'Datum liegt in der Zukunft' });
      if (z.eingebaut && r.datum < z.eingebaut) row.issues.push({ level: 'error', text: `vor dem Einbau (${fmtDate(z.eingebaut)})` });
      if (z.ausgebaut && r.datum > z.ausgebaut) row.issues.push({ level: 'error', text: `nach dem Ausbau (${fmtDate(z.ausgebaut)})` });
      if (prev && r.stand < prev.stand) {
        row.issues.push({ level: 'error', text: `Stand ist niedriger als am ${fmtDate(prev.datum)} – Tippfehler oder nicht erfasster Zählertausch?` });
      }
      if (prev && row.days === 0 && r.stand !== prev.stand) row.issues.push({ level: 'warn', text: 'zwei unterschiedliche Stände am selben Tag' });
      if (prev && prev.stand >= 10 && r.stand >= prev.stand * 9) row.issues.push({ level: 'warn', text: 'Stand etwa 10-mal so hoch wie zuvor – Komma verrutscht?' });
      return row;
    });

    // Ausreißer: Tagesverbrauch im Vergleich zum Median aller Zeiträume (ab 7 Tagen).
    const rates = rows.filter((r) => r.days >= 7 && r.perDay >= 0).map((r) => r.perDay);
    const med = rates.length >= 3 ? median(rates) : null;
    if (med && med > 0) {
      for (const r of rows) {
        if (!(r.days >= 7) || r.perDay == null || r.perDay < 0 || r.issues.some((x) => x.level === 'error')) continue;
        const f = r.perDay / med;
        if (f > 3) r.issues.push({ level: 'warn', text: `Verbrauch ${fmtNum(f, 1)}-mal so hoch wie üblich` });
        else if (f < 1 / 3) r.issues.push({ level: 'warn', text: `Verbrauch nur ${fmtNum(f * 100, 0)} % des Üblichen` });
      }
    }
    if (!z.ausgebaut && list.length && daysBetween(list[list.length - 1].datum, today) > 400) {
      rows[rows.length - 1].issues.push({ level: 'warn', text: 'seit über einem Jahr nicht abgelesen' });
    }
    return { rows, median: med, issues: rows.flatMap((r) => r.issues.map((x) => ({ ...x, ablesung: r }))) };
  }

  // Alle Zähler einer Kette (Vorgänger und Nachfolger nach Zählertausch), älteste zuerst.
  function chain(z) {
    let first = z;
    const seen = new Set([z.id]);
    while (first.vorgaengerId && Store.get(first.vorgaengerId) && !seen.has(first.vorgaengerId)) {
      first = Store.get(first.vorgaengerId);
      seen.add(first.id);
    }
    const out = [first];
    const seen2 = new Set([first.id]);
    let cur = first;
    while (cur.nachfolgerId && Store.get(cur.nachfolgerId) && !seen2.has(cur.nachfolgerId)) {
      cur = Store.get(cur.nachfolgerId);
      seen2.add(cur.id);
      out.push(cur);
    }
    return out;
  }

  // Zählerstand an einem Datum, linear zwischen zwei Ablesungen interpoliert.
  function valueAt(list, date) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].datum === date) return list[i].stand;
      if (list[i].datum > date) {
        if (i === 0) return null;
        const a = list[i - 1];
        const b = list[i];
        return a.stand + (b.stand - a.stand) * daysBetween(a.datum, date) / daysBetween(a.datum, b.datum);
      }
    }
    return null;
  }

  // Verbrauch der ganzen Zählerkette im Zeitraum [von, bis].
  function verbrauch(z, von, bis) {
    let sum = 0;
    let complete = true;
    let any = false;
    for (const m of chain(z)) {
      const list = readings(m.id);
      if (!list.length) continue;
      const a = [von, m.eingebaut || list[0].datum].sort()[1];
      const b = [bis, m.ausgebaut || list[list.length - 1].datum].sort()[0];
      if (a >= b) continue;
      const va = valueAt(list, a);
      const vb = valueAt(list, b);
      if (va == null || vb == null) { complete = false; continue; }
      sum += vb - va;
      any = true;
    }
    const all = chain(z).flatMap((m) => readings(m.id)).map((r) => r.datum).sort();
    if (!all.length || all[0] > von || all[all.length - 1] < bis) complete = false;
    return any ? { wert: sum, complete } : null;
  }

  const ort = (z) => {
    const e = Store.get(z.einheitId);
    const o = Store.get(z.objektId || (e && e.objektId));
    return `${o ? o.name : '?'}${e ? ` · ${e.bezeichnung}` : ' · Allgemein'}`;
  };

  return { ARTEN, EINHEITEN, readings, analyse, chain, valueAt, verbrauch, ort };
})();
