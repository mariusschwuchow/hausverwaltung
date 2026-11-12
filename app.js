'use strict';

// ---- Bezeichnungen ----
const objektName = (id) => (Store.get(id) || {}).name || '?';
const mieterName = (m) => (m ? [m.nachname, m.vorname].filter(Boolean).join(', ') : '?');
const vertragMieter = (v) => (v.mieterIds || []).map(Store.get).filter(Boolean).map(mieterName).join(' / ') || '–';
const einheitLabel = (e) => (e ? `${objektName(e.objektId)} · ${e.bezeichnung}` : '?');
const vertragLabel = (v) => `${einheitLabel(Store.get(v.einheitId))} – ${vertragMieter(v)}`;
const activeVertrag = (einheitId, date = todayIso()) => Store.all('vertrag').find((v) => v.einheitId === einheitId && Finance.isActive(v, date));
const einheitenVon = (objektId) => Store.all('einheit').filter((e) => e.objektId === objektId).sort(byKey('bezeichnung'));
const zaehlerVon = ({ objektId, einheitId }) => Store.all('zaehler').filter((z) => (einheitId ? z.einheitId === einheitId : z.objektId === objektId && !z.einheitId));
const link = (route, id, text) => `<a href="#/${route}/${esc(id)}">${esc(text)}</a>`;
const signed = (n) => `<span class="${n < -0.005 ? 'neg' : n > 0.005 ? 'pos' : ''}">${fmtEur(n)}</span>`;

// ---- Bausteine ----
function btn(label, action, data = {}, cls = 'secondary') {
  const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button type="button" class="${cls}" data-action="${action}"${attrs}>${label}</button>`;
}

function table(headers, rows, empty = 'Noch keine Einträge.') {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  const th = headers.map((h) => `<th class="${h.cls || ''}">${h.label}</th>`).join('');
  const tr = rows.map((r) => `<tr class="${r.cls || ''}">${(r.cells || r).map((c, i) => `<td class="${headers[i].cls || ''}">${c ?? ''}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

const card = (title, body, actions = '') => `<section class="card"><header><h2>${title}</h2><div class="actions">${actions}</div></header>${body}</section>`;
const header = (title, sub = '', actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const facts = (list) => `<dl class="facts">${list.filter((x) => x[1] != null && x[1] !== '').map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

let toastTimer = null;
function toast(msg, level = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${level}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, level === 'info' ? 3500 : 7000);
}

// ---- Formulare ----
const ARTEN_EINHEIT = ['Wohnung', 'Gewerbe', 'Stellplatz', 'Sonstiges'];
const opts = (list) => list.map((x) => (typeof x === 'string' ? { value: x, label: x } : x));
const einheitOptions = () => Store.all('einheit').map((e) => ({ value: e.id, label: einheitLabel(e) })).sort(byKey('label'));
const vertragOptions = () => Store.all('vertrag').map((v) => ({ value: v.id, label: vertragLabel(v) + (Finance.isActive(v) ? '' : ' (beendet)') })).sort(byKey('label'));

const FORMS = {
  objekt: {
    title: 'Objekt',
    fields: () => [
      { name: 'name', label: 'Bezeichnung', required: true, placeholder: 'z. B. Musterstraße 12' },
      { name: 'strasse', label: 'Straße und Hausnummer' },
      { name: 'plz', label: 'PLZ' },
      { name: 'ort', label: 'Ort' },
      { name: 'baujahr', label: 'Baujahr', type: 'number' },
      { name: 'gesamtflaeche', label: 'Gesamtwohnfläche (m²)', type: 'number', step: '0.01', hint: 'leer = Summe der Einheiten' },
      { name: 'notiz', label: 'Notiz', type: 'textarea' },
    ],
  },
  einheit: {
    title: 'Einheit',
    fields: () => [
      { name: 'objektId', label: 'Objekt', type: 'select', required: true, options: Store.all('objekt').map((o) => ({ value: o.id, label: o.name })) },
      { name: 'bezeichnung', label: 'Bezeichnung', required: true, placeholder: 'z. B. Whg. 1 / EG links' },
      { name: 'art', label: 'Art', type: 'select', options: opts(ARTEN_EINHEIT) },
      { name: 'lage', label: 'Lage', placeholder: 'z. B. 1. OG rechts' },
      { name: 'flaeche', label: 'Wohnfläche (m²)', type: 'number', step: '0.01' },
      { name: 'mea', label: 'Miteigentumsanteil (MEA)', type: 'number', step: '0.01', hint: 'z. B. 125 für 125/1000' },
      { name: 'zimmer', label: 'Zimmer', type: 'number', step: '0.5' },
      { name: 'notiz', label: 'Notiz', type: 'textarea' },
    ],
  },
  mieter: {
    title: 'Mieter',
    fields: () => [
      { name: 'vorname', label: 'Vorname' },
      { name: 'nachname', label: 'Nachname / Firma', required: true },
      { name: 'email', label: 'E-Mail', type: 'email' },
      { name: 'telefon', label: 'Telefon' },
      { name: 'iban', label: 'IBAN', hint: 'für den automatischen Zahlungsabgleich' },
      { name: 'anschrift', label: 'Anschrift (falls abweichend)' },
      { name: 'notiz', label: 'Notiz', type: 'textarea' },
    ],
  },
  vertrag: {
    title: 'Mietvertrag',
    fields: () => [
      { name: 'einheitId', label: 'Einheit', type: 'select', required: true, options: einheitOptions() },
      { name: 'mieterIds', label: 'Mieter', type: 'checkboxes', options: Store.all('mieter').map((m) => ({ value: m.id, label: mieterName(m) })).sort(byKey('label')), hint: 'Neue Mieter zuerst unter „Mieter“ anlegen.' },
      { name: 'beginn', label: 'Mietbeginn', type: 'date', required: true },
      { name: 'ende', label: 'Mietende', type: 'date', hint: 'leer = unbefristet' },
      { name: 'personen', label: 'Personen', type: 'number' },
      { name: 'kaution', label: 'Kaution (€)', type: 'number', step: '0.01' },
      { name: 'staffeln', label: 'Miete und Vorauszahlungen', type: 'staffeln' },
      { name: 'suchbegriffe', label: 'Suchbegriffe für den Zahlungsabgleich', hint: 'kommagetrennt, z. B. „Miete Whg 3, Müller“', full: true },
      { name: 'notiz', label: 'Notiz', type: 'textarea' },
    ],
    validate: (d) => {
      if (!d.staffeln.length) throw new Error('Bitte mindestens eine Zeile mit der Miete angeben.');
      if (!d.staffeln[0].ab) d.staffeln[0].ab = (d.beginn || '').slice(0, 7);
      if (d.staffeln.some((s) => !s.ab)) throw new Error('Bitte bei jeder weiteren Staffel den Monat angeben, ab dem sie gilt.');
      const abs = d.staffeln.map((s) => s.ab);
      if (new Set(abs).size !== abs.length) throw new Error('Zwei Staffeln haben denselben Monat.');
      if (d.ende && d.beginn && d.ende < d.beginn) throw new Error('Das Mietende liegt vor dem Mietbeginn.');
    },
  },
  zaehler: {
    title: 'Zähler',
    fields: () => [
      { name: 'ort', label: 'Einbauort', type: 'select', required: true, options: Store.all('objekt').sort(byKey('name')).flatMap((o) => [
        { value: `o:${o.id}`, label: `${o.name} · Allgemein / Hauptzähler` },
        ...einheitenVon(o.id).map((e) => ({ value: `e:${e.id}`, label: `${o.name} · ${e.bezeichnung}` })),
      ]) },
      { name: 'art', label: 'Art', type: 'select', options: opts(Meters.ARTEN) },
      { name: 'nummer', label: 'Zählernummer', required: true },
      { name: 'masseinheit', label: 'Einheit', type: 'select', options: opts(Meters.EINHEITEN) },
      { name: 'eingebaut', label: 'Eingebaut am', type: 'date' },
      { name: 'eichung', label: 'Eichfrist bis (Jahr)', type: 'number' },
      { name: 'notiz', label: 'Notiz', type: 'textarea' },
    ],
    fromRecord: (z) => ({ ...z, ort: z.einheitId ? `e:${z.einheitId}` : z.objektId ? `o:${z.objektId}` : '' }),
    toRecord: (d) => {
      const [kind, id] = d.ort.split(':');
      const e = kind === 'e' ? Store.get(id) : null;
      const out = { ...d, einheitId: e ? e.id : null, objektId: e ? e.objektId : id };
      delete out.ort;
      return out;
    },
  },
  ablesung: {
    title: 'Ablesung',
    fields: () => [
      { name: 'datum', label: 'Datum', type: 'date', required: true },
      { name: 'stand', label: 'Zählerstand', type: 'number', step: 'any', required: true },
      { name: 'notiz', label: 'Notiz', placeholder: 'z. B. Foto im Ordner, Ablesung durch Mieter' },
    ],
  },
  zahlung: {
    title: 'Zahlung',
    fields: () => [
      { name: 'datum', label: 'Datum', type: 'date', required: true },
      { name: 'betrag', label: 'Betrag (€)', type: 'number', step: '0.01', required: true },
      { name: 'name', label: 'Zahler' },
      { name: 'zweck', label: 'Verwendungszweck' },
      { name: 'vertragId', label: 'Vertrag', type: 'select', options: [{ value: '', label: '– nicht zugeordnet –' }, ...vertragOptions()] },
      { name: 'monat', label: 'Für Monat', type: 'month', hint: 'leer = aus dem Datum' },
    ],
    toRecord: (d) => ({ ...d, vertragId: d.vertragId || null, monat: d.monat || Finance.monatFuer(d.datum), quelle: 'manuell' }),
  },
};

function fieldHtml(f, value) {
  const id = `f_${f.name}`;
  const req = f.required ? ' required' : '';
  const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  const cls = `field ${f.type === 'textarea' || f.type === 'staffeln' || f.type === 'checkboxes' || f.full ? 'full' : ''}`;
  let input;
  switch (f.type) {
    case 'textarea':
      input = `<textarea id="${id}" name="${f.name}" rows="3">${esc(value)}</textarea>`;
      break;
    case 'select':
      input = `<select id="${id}" name="${f.name}"${req}>${f.required && !value ? '<option value="">Bitte wählen …</option>' : ''}${f.options.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'checkboxes':
      input = f.options.length ? `<div class="checks">${f.options.map((o) => `<label><input type="checkbox" name="${f.name}" value="${esc(o.value)}"${(value || []).includes(o.value) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>` : '<p class="muted">Noch keine Mieter angelegt.</p>';
      break;
    case 'staffeln':
      input = `<div class="staffeln"><div class="staffel-row head"><span>ab Monat</span><span>Kaltmiete</span><span>NK-Vorausz.</span><span>HK-Vorausz.</span><span></span></div>
        ${(value && value.length ? value : [{}]).map(staffelRow).join('')}</div>
        <button type="button" class="secondary small" data-staffel-add>+ Staffel / Erhöhung</button>
        <small>Für jede Mieterhöhung oder neue Vorauszahlung eine Zeile ab dem Monat der Änderung. „ab Monat“ leer = ab Mietbeginn.</small>`;
      break;
    default:
      input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}"${f.step ? ` step="${f.step}"` : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''} value="${esc(value)}"${req}>`;
  }
  return `<div class="${cls}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${f.type === 'staffeln' ? '' : hint}</div>`;
}

const staffelRow = (s = {}) => `<div class="staffel-row">
  <input type="month" name="s_ab" value="${esc(s.ab)}" aria-label="ab Monat">
  <input type="number" step="0.01" name="s_kalt" value="${esc(s.kalt)}" placeholder="0,00" aria-label="Kaltmiete">
  <input type="number" step="0.01" name="s_nk" value="${esc(s.nk)}" placeholder="0,00" aria-label="Nebenkosten-Vorauszahlung">
  <input type="number" step="0.01" name="s_hk" value="${esc(s.hk)}" placeholder="0,00" aria-label="Heizkosten-Vorauszahlung">
  <button type="button" class="icon" data-staffel-remove aria-label="Zeile entfernen">×</button></div>`;

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'checkboxes') out[f.name] = $$(`input[name="${f.name}"]:checked`, form).map((i) => i.value);
    else if (f.type === 'staffeln') {
      const n = (el, name) => { const v = $(`[name="${name}"]`, el).value; return v === '' ? 0 : Number(v); };
      out.staffeln = $$('.staffel-row:not(.head)', form).map((r) => ({ ab: $('[name="s_ab"]', r).value, kalt: n(r, 's_kalt'), nk: n(r, 's_nk'), hk: n(r, 's_hk') }))
        .filter((s) => s.ab || s.kalt || s.nk || s.hk);
    } else {
      const v = form.elements[f.name].value.trim();
      out[f.name] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
    }
  }
  return out;
}

function openDialog(html, onSubmit, setup) {
  const dlg = $('#dialog');
  const form = $('#dialog-form');
  form.innerHTML = `${html}<p class="form-error" hidden></p>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(form);
      dlg.close();
      render();
    } catch (err) {
      const p = $('.form-error', form);
      p.textContent = err.message;
      p.hidden = false;
    }
  };
  $$('[data-close]', form).forEach((b) => { b.onclick = () => dlg.close(); });
  if (setup) setup(form);
  dlg.showModal();
  const first = $('input:not([type=hidden]):not([type=checkbox]), select, textarea', form);
  if (first) first.focus();
}

const dialogButtons = (label = 'Speichern') => `<div class="dialog-actions"><button type="button" class="secondary" data-close>Abbrechen</button><button type="submit" class="primary">${label}</button></div>`;

function openForm(type, record, preset = {}) {
  const cfg = FORMS[type];
  const fields = cfg.fields();
  const values = record ? (cfg.fromRecord ? cfg.fromRecord(record) : record) : preset;
  const html = `<h2>${record ? `${cfg.title} bearbeiten` : `Neu: ${cfg.title}`}</h2><div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</div>${dialogButtons()}`;
  openDialog(html, async (form) => {
    const data = readForm(form, fields);
    if (cfg.validate) cfg.validate(data);
    // Vorbelegte Werte ohne eigenes Feld (z. B. zaehlerId einer Ablesung) bleiben erhalten.
    const hidden = Object.fromEntries(Object.entries(preset).filter(([k]) => !fields.some((f) => f.name === k)));
    const rec = { ...(record || { type, ...hidden }), ...(cfg.toRecord ? cfg.toRecord(data) : data) };
    await Store.put(rec);
    if (type === 'ablesung') warnReading(rec);
    else toast(`${cfg.title} gespeichert.`);
    if (!record && ['objekt', 'mieter', 'vertrag', 'zaehler'].includes(type)) location.hash = `#/${type}/${rec.id}`;
  }, (form) => {
    form.onclick = (e) => {
      if (e.target.closest('[data-staffel-add]')) {
        const rows = $$('.staffel-row:not(.head)', form);
        const last = rows[rows.length - 1];
        const tmp = document.createElement('div');
        tmp.innerHTML = staffelRow(last ? { kalt: $('[name="s_kalt"]', last).value, nk: $('[name="s_nk"]', last).value, hk: $('[name="s_hk"]', last).value } : {});
        $('.staffeln', form).append(tmp.firstElementChild);
      } else if (e.target.closest('[data-staffel-remove]')) {
        e.target.closest('.staffel-row').remove();
      }
    };
  });
}

function warnReading(rec) {
  const z = Store.get(rec.zaehlerId);
  const row = z && Meters.analyse(z).rows.find((r) => r.id === rec.id);
  if (row && row.issues.length) toast(`Ablesung gespeichert – bitte prüfen: ${row.issues.map((i) => i.text).join('; ')}`, 'warn');
  else toast('Ablesung gespeichert, Stand ist plausibel.');
}

// ---- Löschen (mit abhängigen Daten) ----
function deletePlan(rec) {
  const ids = [rec.id];
  const unassign = [];
  const zaehlerIds = [];
  const vertragIds = [];
  if (rec.type === 'objekt') {
    const es = einheitenVon(rec.id);
    ids.push(...es.map((e) => e.id));
    zaehlerIds.push(...Store.all('zaehler').filter((z) => z.objektId === rec.id || es.some((e) => e.id === z.einheitId)).map((z) => z.id));
    vertragIds.push(...Store.all('vertrag').filter((v) => es.some((e) => e.id === v.einheitId)).map((v) => v.id));
  }
  if (rec.type === 'einheit') {
    zaehlerIds.push(...Store.all('zaehler').filter((z) => z.einheitId === rec.id).map((z) => z.id));
    vertragIds.push(...Store.all('vertrag').filter((v) => v.einheitId === rec.id).map((v) => v.id));
  }
  if (rec.type === 'zaehler') zaehlerIds.push(rec.id);
  if (rec.type === 'vertrag') vertragIds.push(rec.id);
  ids.push(...zaehlerIds, ...vertragIds);
  ids.push(...Store.all('ablesung').filter((a) => zaehlerIds.includes(a.zaehlerId)).map((a) => a.id));
  unassign.push(...Store.all('zahlung').filter((z) => vertragIds.includes(z.vertragId)));
  return { ids: [...new Set(ids)], unassign, zaehlerIds, vertragIds };
}

async function deleteRecord(id) {
  const rec = Store.get(id);
  if (!rec) return;
  if (rec.type === 'mieter') {
    const vs = Store.all('vertrag').filter((v) => (v.mieterIds || []).includes(id));
    if (vs.length) { toast(`Der Mieter steht noch in ${vs.length} Vertrag/Verträgen. Bitte dort zuerst entfernen.`, 'warn'); return; }
  }
  const plan = deletePlan(rec);
  const extra = [];
  if (plan.vertragIds.length && rec.type !== 'vertrag') extra.push(`${plan.vertragIds.length} Vertrag/Verträge`);
  if (plan.zaehlerIds.length && rec.type !== 'zaehler') extra.push(`${plan.zaehlerIds.length} Zähler`);
  const abl = plan.ids.filter((x) => (Store.get(x) || {}).type === 'ablesung').length;
  if (abl) extra.push(`${abl} Ablesung(en)`);
  if (plan.unassign.length) extra.push(`Zuordnung von ${plan.unassign.length} Zahlung(en) (die Zahlungen bleiben erhalten)`);
  const msg = `Wirklich löschen?${extra.length ? `\n\nDabei wird auch gelöscht: ${extra.join(', ')}.` : ''}\n\nTipp: Vorher eine Sicherung herunterladen.`;
  if (!confirm(msg)) return;
  // Verweise in Zählerketten lösen
  const relink = Store.all('zaehler').filter((z) => !plan.ids.includes(z.id) && (plan.ids.includes(z.vorgaengerId) || plan.ids.includes(z.nachfolgerId)))
    .map((z) => ({ ...z, vorgaengerId: plan.ids.includes(z.vorgaengerId) ? null : z.vorgaengerId, nachfolgerId: plan.ids.includes(z.nachfolgerId) ? null : z.nachfolgerId }));
  await Store.putMany([...plan.unassign.map((z) => ({ ...z, vertragId: null })), ...relink]);
  await Store.removeMany(plan.ids);
  toast('Gelöscht.');
  const back = { objekt: 'objekte', einheit: `objekt/${rec.objektId}`, mieter: 'mieter', vertrag: 'vertraege', zaehler: 'zaehler' }[rec.type];
  if (back && location.hash.includes(id)) location.hash = `#/${back}`;
  else render();
}

// ---- Ansichten ----
function viewDashboard() {
  const objekte = Store.all('objekt');
  if (!objekte.length) {
    return header('Willkommen') + card('Los geht’s', `<p>Lege zuerst ein Objekt an, dann die Einheiten, Mieter und Verträge. Zum Ausprobieren kannst du auch Beispieldaten laden.</p>
      <p class="muted">Alle Daten bleiben auf diesem Gerät (IndexedDB + Kopie im localStorage). Lade regelmäßig eine Sicherung herunter.</p>
      <div class="actions">${btn('+ Erstes Objekt anlegen', 'new', { type: 'objekt' }, 'primary')}${btn('Beispieldaten laden', 'demo')}</div>`);
  }
  const cm = currentMonth();
  const today = todayIso();
  const einheiten = Store.all('einheit');
  const vs = Store.all('vertrag');
  const aktiv = vs.filter((v) => Finance.isActive(v));
  const leer = einheiten.filter((e) => !activeVertrag(e.id));
  const soll = round2(aktiv.reduce((a, v) => a + ((Finance.soll(v, cm) || {}).gesamt || 0), 0));
  const ist = round2(Store.all('zahlung').filter((z) => z.vertragId && z.monat === cm).reduce((a, z) => a + z.betrag, 0));
  const offen = vs.map((v) => ({ v, s: Finance.saldo(v) })).filter((x) => x.s < -0.005).sort((a, b) => a.s - b.s);
  const offenSum = round2(offen.reduce((a, x) => a + x.s, 0));
  const warn = Store.all('zaehler').flatMap((z) => Meters.analyse(z).issues.map((i) => ({ ...i, z })));
  const unzu = Store.all('zahlung').filter((z) => !z.vertragId && z.betrag > 0);
  const endend = vs.filter((v) => v.ende && v.ende >= today && v.ende <= addDays(today, 90));

  const tiles = `<div class="tiles">
    <a class="tile" href="#/objekte"><span>Objekte / Einheiten</span><b>${objekte.length} / ${einheiten.length}</b><small>${leer.length ? `${leer.length} leer stehend` : 'alle vermietet'}</small></a>
    <a class="tile" href="#/vertraege"><span>Soll ${fmtMonth(cm)}</span><b>${fmtEur(soll)}</b><small>${aktiv.length} laufende Verträge</small></a>
    <a class="tile" href="#/zahlungen"><span>Eingegangen ${fmtMonth(cm)}</span><b>${fmtEur(ist)}</b><small>${soll ? `${fmtNum(ist / soll * 100, 0)} % vom Soll` : ''}</small></a>
    <a class="tile ${offen.length ? 'bad' : 'good'}" href="#/offene-posten"><span>Offene Posten</span><b>${fmtEur(-offenSum)}</b><small>${offen.length} Vertrag/Verträge im Rückstand</small></a>
  </div>`;

  const offenList = table([{ label: 'Vertrag' }, { label: 'Rückstand', cls: 'num' }],
    offen.slice(0, 6).map(({ v, s }) => [link('vertrag', v.id, vertragLabel(v)), signed(s)]), 'Keine Rückstände. 👍');
  const warnList = table([{ label: 'Zähler' }, { label: 'Ablesung' }, { label: 'Hinweis' }],
    warn.slice(0, 8).map((w) => ({ cls: w.level, cells: [link('zaehler', w.z.id, `${w.z.art} ${w.z.nummer}`) + `<br><small class="muted">${esc(Meters.ort(w.z))}</small>`, `${fmtDate(w.ablesung.datum)}: ${fmtNum(w.ablesung.stand)}`, esc(w.text)] })),
    'Alle Zählerstände sind plausibel.');

  const todo = [];
  if (unzu.length) todo.push(`<li><a href="#/zahlungen">${unzu.length} Zahlung(en) ohne Zuordnung</a></li>`);
  if (leer.length) todo.push(`<li>Leerstand: ${leer.map((e) => link('einheit', e.id, einheitLabel(e))).join(', ')}</li>`);
  endend.forEach((v) => todo.push(`<li>Vertrag endet am ${fmtDate(v.ende)}: ${link('vertrag', v.id, vertragLabel(v))}</li>`));
  const b = Store.backupStatus();
  if (!b.last || daysBetween(b.last.slice(0, 10), today) > 14 || b.changes > 25) todo.push(`<li><a href="#/daten">Sicherung herunterladen</a> (${b.last ? `zuletzt ${fmtDate(b.last)}` : 'noch nie gesichert'}, ${b.changes} Änderungen seitdem)</li>`);

  return header('Übersicht', new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    + tiles
    + `<div class="grid2">${card('Rückstände', offenList)}${card(`Zählerstände prüfen${warn.length ? ` <span class="badge warn">${warn.length}</span>` : ''}`, warnList)}</div>`
    + (todo.length ? card('Zu erledigen', `<ul class="todo">${todo.join('')}</ul>`) : '');
}

function viewObjekte() {
  const rows = Store.all('objekt').sort(byKey('name')).map((o) => {
    const es = einheitenVon(o.id);
    const fl = es.reduce((a, e) => a + (e.flaeche || 0), 0);
    const leer = es.filter((e) => !activeVertrag(e.id)).length;
    return [link('objekt', o.id, o.name), esc([o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')), es.length, `${fmtNum(fl, 2)} m²`, leer ? `<span class="badge warn">${leer}</span>` : '–'];
  });
  return header('Objekte', '', btn('+ Objekt', 'new', { type: 'objekt' }, 'primary'))
    + card('Alle Objekte', table([{ label: 'Objekt' }, { label: 'Adresse' }, { label: 'Einheiten', cls: 'num' }, { label: 'Fläche', cls: 'num' }, { label: 'Leerstand', cls: 'num' }], rows, 'Noch keine Objekte angelegt.'));
}

function zaehlerTable(list, showOrt = false) {
  const rows = list.sort(byKey('art')).map((z) => {
    const r = Meters.readings(z.id);
    const last = r[r.length - 1];
    const n = Meters.analyse(z).issues.length;
    return { cls: z.ausgebaut ? 'dim' : '', cells: [link('zaehler', z.id, `${z.art} ${z.nummer}`), ...(showOrt ? [esc(Meters.ort(z))] : []), last ? `${fmtNum(last.stand)} ${esc(z.masseinheit || '')}` : '–', last ? fmtDate(last.datum) : '–', z.ausgebaut ? `ausgebaut ${fmtDate(z.ausgebaut)}` : (n ? `<span class="badge warn">${n} Hinweis${n > 1 ? 'e' : ''}</span>` : '<span class="badge good">ok</span>'), z.ausgebaut ? '' : btn('+ Ablesung', 'new', { type: 'ablesung', zaehler: z.id }, 'small secondary')] };
  });
  return table([{ label: 'Zähler' }, ...(showOrt ? [{ label: 'Ort' }] : []), { label: 'Letzter Stand', cls: 'num' }, { label: 'Datum' }, { label: 'Status' }, { label: '' }], rows, 'Keine Zähler.');
}

function viewObjekt(id) {
  const o = Store.get(id);
  if (!o) return notFound();
  const es = einheitenVon(id);
  const fl = es.reduce((a, e) => a + (e.flaeche || 0), 0);
  const mea = es.reduce((a, e) => a + (e.mea || 0), 0);
  const cm = currentMonth();
  const rows = es.map((e) => {
    const v = activeVertrag(e.id);
    const s = v && Finance.soll(v, cm);
    return [link('einheit', e.id, e.bezeichnung), esc(e.art || ''), e.flaeche ? `${fmtNum(e.flaeche, 2)} m²` : '–', e.mea ? fmtNum(e.mea) : '–', v ? link('vertrag', v.id, vertragMieter(v)) : '<span class="badge warn">leer</span>', s ? fmtEur(s.gesamt) : '–'];
  });
  const sollSum = es.reduce((a, e) => { const v = activeVertrag(e.id); return a + ((v && Finance.soll(v, cm)) || { gesamt: 0 }).gesamt; }, 0);
  return header(esc(o.name), esc([o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')),
    btn('Bearbeiten', 'edit', { id }) + btn('Löschen', 'delete', { id }, 'danger'))
    + card('Eckdaten', facts([['Einheiten', es.length], ['Wohnfläche (Summe Einheiten)', `${fmtNum(fl, 2)} m²`], ['Gesamtfläche laut Objekt', o.gesamtflaeche ? `${fmtNum(o.gesamtflaeche, 2)} m²` : null], ['MEA gesamt', mea ? fmtNum(mea) : null], ['Baujahr', o.baujahr], ['Soll-Miete aktuell', fmtEur(sollSum)], ['Notiz', esc(o.notiz)]])
      + (o.gesamtflaeche && Math.abs(o.gesamtflaeche - fl) > 0.01 ? `<p class="warn-text">Die Summe der Einheiten (${fmtNum(fl, 2)} m²) weicht von der Gesamtfläche ab – für die Nebenkostenabrechnung später wichtig.</p>` : ''))
    + card('Einheiten', table([{ label: 'Einheit' }, { label: 'Art' }, { label: 'Fläche', cls: 'num' }, { label: 'MEA', cls: 'num' }, { label: 'Mieter' }, { label: 'Miete', cls: 'num' }], rows, 'Noch keine Einheiten.'), btn('+ Einheit', 'new', { type: 'einheit', objekt: id }, 'primary small'))
    + card('Zähler (alle im Objekt)', zaehlerTable(Store.all('zaehler').filter((z) => z.objektId === id), true), btn('+ Zähler', 'new', { type: 'zaehler', ort: `o:${id}` }, 'small'));
}

function viewEinheit(id) {
  const e = Store.get(id);
  if (!e) return notFound();
  const vs = Store.all('vertrag').filter((v) => v.einheitId === id).sort(byKey('beginn')).reverse();
  const rows = vs.map((v) => [link('vertrag', v.id, vertragMieter(v)), fmtDate(v.beginn), fmtDate(v.ende), Finance.isActive(v) ? '<span class="badge good">läuft</span>' : (v.beginn > todayIso() ? 'künftig' : 'beendet'), signed(Finance.saldo(v))]);
  return header(esc(e.bezeichnung), `${link('objekt', e.objektId, objektName(e.objektId))} · ${esc(e.art || '')} ${esc(e.lage || '')}`,
    btn('Bearbeiten', 'edit', { id }) + btn('Löschen', 'delete', { id }, 'danger'))
    + card('Eckdaten', facts([['Wohnfläche', e.flaeche ? `${fmtNum(e.flaeche, 2)} m²` : null], ['MEA', e.mea ? fmtNum(e.mea) : null], ['Zimmer', e.zimmer], ['Lage', esc(e.lage)], ['Notiz', esc(e.notiz)]]))
    + card('Mietverträge', table([{ label: 'Mieter' }, { label: 'Beginn' }, { label: 'Ende' }, { label: 'Status' }, { label: 'Saldo', cls: 'num' }], rows, 'Noch kein Vertrag.'), btn('+ Vertrag', 'new', { type: 'vertrag', einheit: id }, 'primary small'))
    + card('Zähler', zaehlerTable(zaehlerVon({ einheitId: id })), btn('+ Zähler', 'new', { type: 'zaehler', ort: `e:${id}` }, 'small'));
}

function viewMieter(id) {
  if (id) {
    const m = Store.get(id);
    if (!m) return notFound();
    const vs = Store.all('vertrag').filter((v) => (v.mieterIds || []).includes(id));
    return header(esc(mieterName(m)), '', btn('Bearbeiten', 'edit', { id }) + btn('Löschen', 'delete', { id }, 'danger'))
      + card('Kontakt', facts([['E-Mail', m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : null], ['Telefon', m.telefon ? `<a href="tel:${esc(m.telefon)}">${esc(m.telefon)}</a>` : null], ['IBAN', esc(m.iban)], ['Anschrift', esc(m.anschrift)], ['Notiz', esc(m.notiz)]]))
      + card('Verträge', table([{ label: 'Einheit' }, { label: 'Beginn' }, { label: 'Ende' }, { label: 'Saldo', cls: 'num' }],
        vs.map((v) => [link('vertrag', v.id, einheitLabel(Store.get(v.einheitId))), fmtDate(v.beginn), fmtDate(v.ende), signed(Finance.saldo(v))]), 'Kein Vertrag.'));
  }
  const rows = Store.all('mieter').sort(byKey('nachname')).map((m) => {
    const v = Store.all('vertrag').filter((x) => (x.mieterIds || []).includes(m.id)).find((x) => Finance.isActive(x));
    return [link('mieter', m.id, mieterName(m)), v ? esc(einheitLabel(Store.get(v.einheitId))) : '<span class="muted">kein laufender Vertrag</span>', esc(m.telefon || ''), esc(m.email || '')];
  });
  return header('Mieter', '', btn('+ Mieter', 'new', { type: 'mieter' }, 'primary'))
    + card('Alle Mieter', table([{ label: 'Name' }, { label: 'Wohnt in' }, { label: 'Telefon' }, { label: 'E-Mail' }], rows, 'Noch keine Mieter angelegt.'));
}

function viewVertraege() {
  const cm = currentMonth();
  const rows = Store.all('vertrag').sort((a, b) => vertragLabel(a).localeCompare(vertragLabel(b), 'de')).map((v) => {
    const s = Finance.soll(v, cm);
    return { cls: Finance.isActive(v) ? '' : 'dim', cells: [link('vertrag', v.id, einheitLabel(Store.get(v.einheitId))), esc(vertragMieter(v)), fmtDate(v.beginn), fmtDate(v.ende), s ? fmtEur(s.gesamt) : '–', signed(Finance.saldo(v))] };
  });
  return header('Mietverträge', '', btn('+ Vertrag', 'new', { type: 'vertrag' }, 'primary'))
    + card('Alle Verträge', table([{ label: 'Einheit' }, { label: 'Mieter' }, { label: 'Beginn' }, { label: 'Ende' }, { label: `Miete ${fmtMonth(cm)}`, cls: 'num' }, { label: 'Saldo', cls: 'num' }], rows, 'Noch keine Verträge.'));
}

function viewVertrag(id) {
  const v = Store.get(id);
  if (!v) return notFound();
  const e = Store.get(v.einheitId);
  const staffeln = [...(v.staffeln || [])].sort(byKey('ab')).map((s) => [fmtMonth(s.ab), fmtEur(s.kalt), fmtEur(s.nk), fmtEur(s.hk), `<b>${fmtEur(Finance.gesamt(s))}</b>`]);
  const konto = Finance.konto(v).reverse();
  const krows = konto.map((k) => ({ cls: k.diff < -0.005 ? 'neg-row' : '', cells: [fmtMonth(k.monat), fmtEur(k.soll) + (k.anteilig ? ' <small class="muted">anteilig</small>' : ''), fmtEur(k.ist), signed(k.diff), signed(k.saldo), k.zahlungen.map((z) => `${fmtDate(z.datum)}: ${fmtEur(z.betrag)}`).join('<br>')] }));
  const kaltProQm = e && e.flaeche ? ((Finance.staffel(v, currentMonth()) || {}).kalt || 0) / e.flaeche : null;
  return header(`Vertrag ${esc(e ? e.bezeichnung : '')}`, `${e ? link('einheit', e.id, einheitLabel(e)) : ''} · ${(v.mieterIds || []).map((mid) => link('mieter', mid, mieterName(Store.get(mid)))).join(', ') || 'kein Mieter'}`,
    btn('+ Zahlung', 'new', { type: 'zahlung', vertrag: id }) + btn('Bearbeiten', 'edit', { id }) + btn('Löschen', 'delete', { id }, 'danger'))
    + card('Eckdaten', facts([['Mietbeginn', fmtDate(v.beginn)], ['Mietende', v.ende ? fmtDate(v.ende) : 'unbefristet'], ['Personen', v.personen], ['Kaution', v.kaution ? fmtEur(v.kaution) : null], ['Kaltmiete je m²', kaltProQm ? fmtEur(kaltProQm) : null], ['Suchbegriffe Abgleich', esc(v.suchbegriffe)], ['Saldo', signed(Finance.saldo(v))], ['Notiz', esc(v.notiz)]]))
    + card('Miete und Vorauszahlungen', table([{ label: 'ab' }, { label: 'Kaltmiete', cls: 'num' }, { label: 'NK-Vorausz.', cls: 'num' }, { label: 'HK-Vorausz.', cls: 'num' }, { label: 'Gesamt', cls: 'num' }], staffeln))
    + card('Mietkonto', table([{ label: 'Monat' }, { label: 'Soll', cls: 'num' }, { label: 'Ist', cls: 'num' }, { label: 'Differenz', cls: 'num' }, { label: 'Saldo', cls: 'num' }, { label: 'Zahlungen' }], krows));
}

function viewZaehler(id) {
  if (id) return viewZaehlerDetail(id);
  const objekte = Store.all('objekt').sort(byKey('name'));
  const body = objekte.map((o) => card(esc(o.name), zaehlerTable(Store.all('zaehler').filter((z) => z.objektId === o.id), true))).join('');
  return header('Zähler', 'Ablesungen werden beim Speichern auf Plausibilität geprüft.', btn('+ Zähler', 'new', { type: 'zaehler' }, 'primary'))
    + (body || card('Zähler', '<p class="empty">Zuerst ein Objekt anlegen.</p>'));
}

function viewZaehlerDetail(id) {
  const z = Store.get(id);
  if (!z) return notFound();
  const { rows, median } = Meters.analyse(z);
  const me = esc(z.masseinheit || '');
  const trows = [...rows].reverse().map((r) => ({
    cls: r.issues.some((i) => i.level === 'error') ? 'error' : r.issues.length ? 'warn' : '',
    cells: [fmtDate(r.datum), `${fmtNum(r.stand)}`, r.delta == null ? '–' : `${fmtNum(r.delta)}`, r.days == null ? '–' : r.days, r.perDay == null ? '–' : fmtNum(r.perDay, 3),
      r.issues.map((i) => `<span class="issue ${i.level}">${esc(i.text)}</span>`).join('') + (r.notiz ? `<small class="muted">${esc(r.notiz)}</small>` : ''),
      btn('✎', 'edit', { id: r.id }, 'icon') + btn('🗑', 'delete', { id: r.id }, 'icon')],
  }));
  const chain = Meters.chain(z);
  const allDates = chain.flatMap((m) => Meters.readings(m.id)).map((r) => r.datum).sort();
  let jahre = '';
  if (allDates.length) {
    const y0 = Number(allDates[0].slice(0, 4));
    const y1 = Number(todayIso().slice(0, 4));
    const jr = [];
    for (let y = y1; y >= y0; y--) {
      const res = Meters.verbrauch(z, `${y - 1}-12-31`, `${y}-12-31`);
      if (res) jr.push([String(y), `${fmtNum(res.wert, 2)} ${me}`, res.complete ? '' : '<span class="muted">unvollständig – Ablesung um den Jahreswechsel fehlt</span>']);
    }
    jahre = card('Verbrauch je Kalenderjahr', table([{ label: 'Jahr' }, { label: 'Verbrauch', cls: 'num' }, { label: '' }], jr, 'Noch zu wenige Ablesungen.')
      + '<p class="muted small">Verbrauch = Stand 31.12. minus Stand 31.12. des Vorjahrs. Fehlt eine Ablesung genau an diesem Tag, wird der Stand zwischen den Ablesungen linear geschätzt; ein Zählertausch wird mitgerechnet.</p>');
  }
  const vor = Store.get(z.vorgaengerId);
  const nach = Store.get(z.nachfolgerId);
  return header(`${esc(z.art)} ${esc(z.nummer)}`, esc(Meters.ort(z)),
    (z.ausgebaut ? '' : btn('+ Ablesung', 'new', { type: 'ablesung', zaehler: id }, 'primary') + btn('Zählertausch', 'tausch', { id }))
    + btn('Bearbeiten', 'edit', { id }) + btn('Löschen', 'delete', { id }, 'danger'))
    + card('Eckdaten', facts([['Einheit', me], ['Eingebaut', fmtDate(z.eingebaut)], ['Ausgebaut', z.ausgebaut ? fmtDate(z.ausgebaut) : null], ['Eichfrist', z.eichung ? `${z.eichung}${z.eichung <= new Date().getFullYear() ? ' <span class="badge warn">abgelaufen / fällig</span>' : ''}` : null],
      ['Vorgänger', vor ? link('zaehler', vor.id, `${vor.nummer} (bis ${fmtDate(vor.ausgebaut)})`) : null], ['Nachfolger', nach ? link('zaehler', nach.id, `${nach.nummer} (ab ${fmtDate(nach.eingebaut)})`) : null],
      ['Üblicher Tagesverbrauch', median ? `${fmtNum(median, 3)} ${me}/Tag` : null], ['Notiz', esc(z.notiz)]]))
    + card('Ablesungen', table([{ label: 'Datum' }, { label: `Stand (${me})`, cls: 'num' }, { label: 'Verbrauch', cls: 'num' }, { label: 'Tage', cls: 'num' }, { label: 'pro Tag', cls: 'num' }, { label: 'Prüfung' }, { label: '' }], trows, 'Noch keine Ablesung.'))
    + jahre;
}

function openTausch(id) {
  const z = Store.get(id);
  const r = Meters.readings(id);
  const last = r[r.length - 1];
  openDialog(`<h2>Zählertausch: ${esc(z.art)} ${esc(z.nummer)}</h2>
    <p class="muted">Der alte Zähler wird mit Endstand ausgebaut, der neue mit Anfangsstand angelegt. Der Verbrauch wird über beide Zähler zusammengerechnet.</p>
    <div class="form-grid">
      ${fieldHtml({ name: 'datum', label: 'Tauschdatum', type: 'date', required: true }, todayIso())}
      ${fieldHtml({ name: 'endstand', label: `Endstand alter Zähler${last ? ` (zuletzt ${fmtNum(last.stand)})` : ''}`, type: 'number', step: 'any', required: true })}
      ${fieldHtml({ name: 'nummer', label: 'Nummer neuer Zähler', required: true })}
      ${fieldHtml({ name: 'anfang', label: 'Anfangsstand neuer Zähler', type: 'number', step: 'any', required: true }, 0)}
      ${fieldHtml({ name: 'eichung', label: 'Eichfrist neuer Zähler (Jahr)', type: 'number' })}
    </div>${dialogButtons('Tausch speichern')}`, async (form) => {
    const d = readForm(form, [{ name: 'datum' }, { name: 'endstand', type: 'number' }, { name: 'nummer' }, { name: 'anfang', type: 'number' }, { name: 'eichung', type: 'number' }]);
    if (last && d.datum < last.datum) throw new Error(`Das Tauschdatum liegt vor der letzten Ablesung (${fmtDate(last.datum)}).`);
    if (last && d.endstand < last.stand) throw new Error(`Der Endstand ist niedriger als die letzte Ablesung (${fmtNum(last.stand)}).`);
    const neu = { id: uid(), type: 'zaehler', art: z.art, masseinheit: z.masseinheit, objektId: z.objektId, einheitId: z.einheitId, nummer: d.nummer, eingebaut: d.datum, eichung: d.eichung, vorgaengerId: z.id };
    await Store.putMany([
      { ...z, ausgebaut: d.datum, nachfolgerId: neu.id },
      { id: uid(), type: 'ablesung', zaehlerId: z.id, datum: d.datum, stand: d.endstand, notiz: 'Endstand bei Ausbau' },
      neu,
      { id: uid(), type: 'ablesung', zaehlerId: neu.id, datum: d.datum, stand: d.anfang, notiz: 'Anfangsstand bei Einbau' },
    ]);
    toast('Zählertausch gespeichert.');
    location.hash = `#/zaehler/${neu.id}`;
  });
}

// ---- Zahlungen ----
let zahlFilter = 'offen';

function viewZahlungen() {
  const all = Store.all('zahlung').sort((a, b) => b.datum.localeCompare(a.datum));
  const list = all.filter((z) => (zahlFilter === 'offen' ? !z.vertragId : zahlFilter === 'zugeordnet' ? z.vertragId : true));
  const vopts = vertragOptions();
  const shown = list.slice(0, 300);
  const rows = shown.map((z) => ({ cls: z.vertragId ? '' : 'open', cells: [fmtDate(z.datum), signed(z.betrag), esc(z.name || ''), `<span class="zweck" title="${esc(z.zweck)}">${esc(z.zweck || '')}</span>`,
    `<select data-change="zuordnen" data-id="${esc(z.id)}"><option value="">– nicht zugeordnet –</option>${vopts.map((o) => `<option value="${esc(o.value)}"${o.value === z.vertragId ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`,
    `<input type="month" value="${esc(z.monat || '')}" data-change="monat" data-id="${esc(z.id)}" aria-label="Für Monat">`,
    btn('🗑', 'delete', { id: z.id }, 'icon')] }));
  const tab = (key, label, n) => `<button type="button" class="tab ${zahlFilter === key ? 'active' : ''}" data-action="filter" data-filter="${key}">${label} <span class="badge">${n}</span></button>`;
  return header('Zahlungen', 'Kontoauszug als CSV importieren und automatisch den Verträgen zuordnen.',
    btn('📄 CSV importieren', 'import', {}, 'primary') + btn('Automatisch zuordnen', 'automatch') + btn('+ Zahlung', 'new', { type: 'zahlung' }))
    + `<div class="tabs">${tab('offen', 'Nicht zugeordnet', all.filter((z) => !z.vertragId).length)}${tab('zugeordnet', 'Zugeordnet', all.filter((z) => z.vertragId).length)}${tab('alle', 'Alle', all.length)}</div>`
    + card('Buchungen', table([{ label: 'Datum' }, { label: 'Betrag', cls: 'num' }, { label: 'Zahler' }, { label: 'Verwendungszweck' }, { label: 'Vertrag' }, { label: 'Für Monat' }, { label: '' }], rows, zahlFilter === 'offen' ? 'Alle Zahlungen sind zugeordnet.' : 'Keine Zahlungen.')
      + (list.length > shown.length ? `<p class="muted">Es werden die neuesten ${shown.length} von ${list.length} angezeigt.</p>` : ''))
    + '<p class="muted small">Zuordnung: IBAN des Mieters, Suchbegriffe im Vertrag, Nachname und passender Betrag. Zahlungen ab dem 25. zählen für den Folgemonat. Nur eindeutige Treffer werden automatisch zugeordnet.</p>';
}

async function autoMatch(list) {
  const updates = [];
  for (const z of list) {
    if (z.vertragId || !(z.betrag > 0)) continue;
    const v = Finance.match(z);
    if (v) updates.push({ ...z, vertragId: v.id, monat: z.monat || Finance.monatFuer(z.datum) });
  }
  if (updates.length) await Store.putMany(updates);
  return updates.length;
}

async function importCsvBuffer(buffer, filename = 'CSV') {
  const rows = Finance.parseCsv(Finance.decode(buffer));
  const h = Finance.headerRow(rows);
  const head = rows[h] || [];
  const data = rows.slice(h + 1).filter((r) => r.length >= 2);
  if (!data.length) { toast('In der Datei wurden keine Buchungen gefunden.', 'warn'); return; }
  const map = Finance.guessMapping(head);
  const colSelect = (field, label, required) => `<div class="field"><label>${label}${required ? ' *' : ''}</label><select name="${field}"${required ? ' required' : ''}><option value="">– keine –</option>${head.map((c, i) => `<option value="${i}"${map[field] === i ? ' selected' : ''}>${esc(c || `Spalte ${i + 1}`)}</option>`).join('')}</select></div>`;
  const preview = table(head.map((c) => ({ label: esc(c) })), data.slice(0, 4).map((r) => head.map((_, i) => esc(r[i]))));
  openDialog(`<h2>Kontoauszug importieren</h2><p class="muted">${esc(filename)}: ${data.length} Buchungen erkannt. Bitte die Spalten prüfen.</p>
    <div class="form-grid">${colSelect('datum', 'Buchungsdatum', true)}${colSelect('betrag', 'Betrag', true)}${colSelect('name', 'Zahler / Name')}${colSelect('zweck', 'Verwendungszweck')}${colSelect('iban', 'IBAN des Zahlers')}
    <div class="field full"><label><input type="checkbox" name="nurEingang" checked> nur Eingänge (positive Beträge) übernehmen</label></div></div>
    <div class="preview">${preview}</div>${dialogButtons('Importieren')}`, async (form) => {
    const col = (n) => (form.elements[n].value === '' ? null : Number(form.elements[n].value));
    const m = { datum: col('datum'), betrag: col('betrag'), name: col('name'), zweck: col('zweck'), iban: col('iban') };
    const nurEingang = form.elements.nurEingang.checked;
    const existing = new Set(Store.all('zahlung').map((z) => z.key));
    const seen = new Map();
    const fresh = [];
    let doppelt = 0;
    let fehler = 0;
    for (const r of data) {
      const datum = Finance.parseDate(r[m.datum]);
      const betrag = Finance.parseAmount(r[m.betrag]);
      if (!datum || Number.isNaN(betrag)) { fehler++; continue; }
      if (nurEingang && betrag <= 0) continue;
      const z = { id: uid(), type: 'zahlung', datum, betrag: round2(betrag), name: m.name != null ? r[m.name] || '' : '', zweck: m.zweck != null ? r[m.zweck] || '' : '', iban: m.iban != null ? (r[m.iban] || '').replace(/\s/g, '') : '', vertragId: null, monat: null, quelle: 'csv' };
      const base = [z.datum, z.betrag.toFixed(2), z.name, z.zweck].join('|');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      z.key = `${base}#${n}`;
      if (existing.has(z.key)) { doppelt++; continue; }
      z.monat = Finance.monatFuer(datum);
      fresh.push(z);
    }
    if (fresh.length) await Store.putMany(fresh);
    const zugeordnet = await autoMatch(fresh);
    zahlFilter = 'offen';
    toast(`${fresh.length} Buchung(en) importiert, davon ${zugeordnet} automatisch zugeordnet.${doppelt ? ` ${doppelt} bereits vorhanden.` : ''}${fehler ? ` ${fehler} Zeile(n) nicht lesbar.` : ''}`);
  });
}

function viewOffenePosten() {
  const items = Store.all('vertrag').map((v) => ({ v, k: Finance.konto(v) })).map((x) => ({ ...x, s: x.k.length ? x.k[x.k.length - 1].saldo : 0 }))
    .filter((x) => Math.abs(x.s) > 0.005).sort((a, b) => a.s - b.s);
  const rows = items.map(({ v, k, s }) => {
    const fehl = k.filter((r) => r.diff < -0.005).slice(-6).map((r) => `${fmtMonth(r.monat)} (${fmtEur(r.diff)})`).join(', ');
    return { cls: s < 0 ? '' : 'dim', cells: [link('vertrag', v.id, einheitLabel(Store.get(v.einheitId))), esc(vertragMieter(v)), s < 0 ? (fehl || '–') : 'Überzahlung / Guthaben', signed(s)] };
  });
  const sum = round2(items.filter((x) => x.s < 0).reduce((a, x) => a + x.s, 0));
  return header('Offene Posten', `Rückstände gesamt: ${fmtEur(-sum)}`)
    + card('Salden je Vertrag', table([{ label: 'Einheit' }, { label: 'Mieter' }, { label: 'Fehlbeträge (letzte Monate)' }, { label: 'Saldo', cls: 'num' }], rows, 'Alle Mietkonten sind ausgeglichen.'))
    + '<p class="muted small">Saldo = Summe der zugeordneten Zahlungen minus Sollmiete seit Mietbeginn bis zum laufenden Monat. Nicht zugeordnete Zahlungen zählen nicht – bitte zuerst unter „Zahlungen“ zuordnen.</p>';
}

function viewDaten() {
  const b = Store.backupStatus();
  return header('Daten & Sicherung')
    + card('Sicherung', `<p>Alle Daten liegen nur auf diesem Gerät im Browser – doppelt in IndexedDB und localStorage. Eine Sicherungsdatei schützt vor Datenverlust und überträgt die Daten auf ein anderes Gerät.</p>
      ${facts([['Datensätze', b.total], ['Letzte Sicherung', b.last ? new Date(b.last).toLocaleString('de-DE') : 'noch nie'], ['Änderungen seitdem', b.changes], ['Dauerhafter Speicher', '<span id="persist-state">wird geprüft …</span>']])}
      <div class="actions">${btn('⬇ Sicherung herunterladen', 'backup', {}, 'primary')}${btn('⬆ Sicherung wiederherstellen', 'restore')}</div>
      <p class="muted small">Beim Wiederherstellen werden die Daten zusammengeführt: Je Datensatz gilt der neuere Stand, nichts wird gelöscht.</p>`)
    + card('Ausprobieren', `<p>Lädt ein Beispielhaus mit drei Wohnungen, Mietern, Zählerständen (mit absichtlichen Fehlern) und Zahlungen.</p><div class="actions">${btn('Beispieldaten laden', 'demo')}</div>`)
    + card('Alles löschen', `<p>Entfernt alle Daten von diesem Gerät. Vorher eine Sicherung herunterladen!</p><div class="actions">${btn('Alle Daten löschen', 'wipe', {}, 'danger')}</div>`);
}

function notFound() {
  return header('Nicht gefunden') + card('Hoppla', '<p>Dieser Eintrag existiert nicht (mehr). <a href="#/">Zur Übersicht</a></p>');
}

// ---- Sicherung ----
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept, cb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => input.files[0] && cb(input.files[0]);
  input.click();
}

// ---- Beispieldaten ----
async function loadDemo() {
  const y = Number(todayIso().slice(0, 4));
  const o = { id: uid(), type: 'objekt', name: 'Musterstraße 12', strasse: 'Musterstraße 12', plz: '50667', ort: 'Köln', baujahr: 1962, gesamtflaeche: 236.5 };
  const e = [
    { id: uid(), type: 'einheit', objektId: o.id, bezeichnung: 'Whg. 1', art: 'Wohnung', lage: 'EG', flaeche: 78.5, mea: 330, zimmer: 3 },
    { id: uid(), type: 'einheit', objektId: o.id, bezeichnung: 'Whg. 2', art: 'Wohnung', lage: '1. OG', flaeche: 79, mea: 335, zimmer: 3 },
    { id: uid(), type: 'einheit', objektId: o.id, bezeichnung: 'Whg. 3', art: 'Wohnung', lage: 'DG', flaeche: 79, mea: 335, zimmer: 2.5 },
  ];
  const m = [
    { id: uid(), type: 'mieter', vorname: 'Anna', nachname: 'Beispiel', iban: 'DE02120300000000202051', telefon: '0221 000000' },
    { id: uid(), type: 'mieter', vorname: 'Jonas', nachname: 'Muster', email: 'jonas@example.org' },
    { id: uid(), type: 'mieter', vorname: 'Lea', nachname: 'Probe' },
  ];
  const v = [
    { id: uid(), type: 'vertrag', einheitId: e[0].id, mieterIds: [m[0].id], beginn: `${y - 3}-04-01`, personen: 2, kaution: 1800, staffeln: [{ ab: `${y - 3}-04`, kalt: 600, nk: 160, hk: 90 }, { ab: `${y - 1}-04`, kalt: 630, nk: 175, hk: 95 }] },
    { id: uid(), type: 'vertrag', einheitId: e[1].id, mieterIds: [m[1].id], beginn: `${y - 1}-08-15`, personen: 1, kaution: 1950, staffeln: [{ ab: `${y - 1}-08`, kalt: 650, nk: 170, hk: 95 }], suchbegriffe: 'Whg 2' },
    { id: uid(), type: 'vertrag', einheitId: e[2].id, mieterIds: [m[2].id], beginn: `${y - 4}-01-01`, ende: `${y}-06-30`, personen: 1, staffeln: [{ ab: `${y - 4}-01`, kalt: 540, nk: 150, hk: 85 }] },
  ];
  const recs = [o, ...e, ...m, ...v];
  // Zähler mit Jahresablesungen, ein Zählertausch und zwei absichtliche Fehler
  e.forEach((ei, i) => {
    const z = { id: uid(), type: 'zaehler', objektId: o.id, einheitId: ei.id, art: 'Kaltwasser', nummer: `KW-10${i + 1}`, masseinheit: 'm³', eingebaut: `${y - 4}-01-01`, eichung: y + 2 };
    recs.push(z);
    let stand = 100 + i * 37;
    for (let j = 4; j >= 1; j--) {
      stand += 38 + i * 6 + j;
      let s = stand;
      if (i === 1 && j === 2) s = stand - 60; // Tippfehler: Stand gesunken
      recs.push({ id: uid(), type: 'ablesung', zaehlerId: z.id, datum: `${y - j}-12-31`, stand: s });
    }
  });
  const wz = { id: uid(), type: 'zaehler', objektId: o.id, art: 'Wärme (Heizung)', nummer: 'WMZ-77', masseinheit: 'MWh', eingebaut: `${y - 4}-01-01`, eichung: y - 1 };
  recs.push(wz, ...[[4, 61.2], [3, 104.9], [2, 149.0], [1, 290.4]].map(([j, s]) => ({ id: uid(), type: 'ablesung', zaehlerId: wz.id, datum: `${y - j}-12-31`, stand: s })));
  // Zahlungen seit Mietbeginn: eine fehlt, eine ist zu niedrig, die letzten 3 Monate noch ohne Zuordnung
  const cm = currentMonth();
  for (let k = 60; k >= 0; k--) {
    const mon = addMonths(cm, -k);
    const d = `${addMonths(mon, -1)}-${k % 3 ? '28' : '27'}`;
    v.forEach((vt, idx) => {
      const s = Finance.soll(vt, mon);
      if (!s || (idx === 1 && k === 1)) return;
      const betrag = idx === 0 && k === 2 ? s.gesamt - 100 : s.gesamt;
      const mt = m[idx];
      recs.push({ id: uid(), type: 'zahlung', datum: d, betrag, name: `${mt.vorname} ${mt.nachname}`.toUpperCase(), iban: mt.iban || '', zweck: `Miete ${fmtMonth(mon)}${idx === 1 ? ' Whg 2' : ''}`, vertragId: k > 2 ? vt.id : null, monat: mon, quelle: 'demo', key: `demo-${idx}-${mon}` });
    });
  }
  recs.push({ id: uid(), type: 'zahlung', datum: `${cm}-03`, betrag: 49.99, name: 'STADTWERKE', zweck: 'Gutschrift Abschlag', vertragId: null, monat: cm, quelle: 'demo', key: `demo-sw-${cm}` });
  await Store.putMany(recs);
  const n = await autoMatch(Store.all('zahlung'));
  toast(`Beispieldaten geladen (${n} Zahlungen automatisch zugeordnet).`);
  location.hash = '#/';
  render();
}

// ---- Aktionen ----
const ACTIONS = {
  new: (d) => {
    const preset = {};
    if (d.objekt) preset.objektId = d.objekt;
    if (d.einheit) preset.einheitId = d.einheit;
    if (d.ort) preset.ort = d.ort;
    if (d.type === 'ablesung') { preset.datum = todayIso(); preset.zaehlerId = d.zaehler; }
    if (d.type === 'zahlung') { preset.datum = todayIso(); preset.vertragId = d.vertrag || ''; }
    if (d.type === 'zaehler') { preset.art = 'Kaltwasser'; preset.masseinheit = 'm³'; }
    if (d.type === 'objekt' || d.type === 'mieter' || Store.all('objekt').length) return openForm(d.type, null, preset);
    toast('Bitte zuerst ein Objekt anlegen.', 'warn');
  },
  edit: (d) => { const r = Store.get(d.id); if (r) openForm(r.type, r); },
  delete: (d) => deleteRecord(d.id),
  tausch: (d) => openTausch(d.id),
  filter: (d) => { zahlFilter = d.filter; render(); },
  import: () => pickFile('.csv,.txt,text/csv', async (f) => importCsvBuffer(await f.arrayBuffer(), f.name)),
  automatch: async () => { const n = await autoMatch(Store.all('zahlung')); toast(n ? `${n} Zahlung(en) zugeordnet.` : 'Keine weiteren eindeutigen Treffer gefunden.'); render(); },
  backup: () => {
    downloadFile(`hausverwaltung-sicherung-${todayIso()}.json`, JSON.stringify(Store.backupData(), null, 1), 'application/json');
    Store.markBackup();
    toast('Sicherung heruntergeladen.');
    render();
  },
  restore: () => pickFile('.json,application/json', async (f) => {
    try {
      const res = await Store.restore(JSON.parse(await f.text()));
      toast(`${res.taken} Datensätze übernommen, ${res.skipped} waren schon aktuell.`);
      render();
    } catch (err) { toast(`Wiederherstellen fehlgeschlagen: ${err.message}`, 'error'); }
  }),
  demo: () => loadDemo(),
  wipe: async () => {
    if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Das lässt sich nur mit einer Sicherungsdatei rückgängig machen.')) return;
    await Store.clearAll();
    toast('Alle Daten gelöscht.');
    location.hash = '#/';
    render();
  },
};

const CHANGES = {
  zuordnen: async (el) => {
    const z = Store.get(el.dataset.id);
    await Store.put({ ...z, vertragId: el.value || null, monat: z.monat || Finance.monatFuer(z.datum) });
    toast(el.value ? 'Zahlung zugeordnet.' : 'Zuordnung entfernt.');
    render();
  },
  monat: async (el) => {
    const z = Store.get(el.dataset.id);
    await Store.put({ ...z, monat: el.value || Finance.monatFuer(z.datum) });
    toast('Monat geändert.');
  },
};

// ---- Router ----
const ROUTES = {
  '': viewDashboard, objekte: viewObjekte, objekt: viewObjekt, einheit: viewEinheit, mieter: viewMieter,
  vertraege: viewVertraege, vertrag: viewVertrag, zaehler: viewZaehler, zahlungen: viewZahlungen, 'offene-posten': viewOffenePosten, daten: viewDaten,
};
const NAV_OF = { objekt: 'objekte', einheit: 'objekte', vertrag: 'vertraege' };

function render() {
  const [route = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  const fn = ROUTES[route] || notFound;
  const main = $('#view');
  main.innerHTML = fn(id && decodeURIComponent(id));
  const active = NAV_OF[route] ?? route;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${active}`));
  const b = Store.backupStatus();
  const due = b.total && (!b.last || daysBetween(b.last.slice(0, 10), todayIso()) > 14 || b.changes > 25);
  $('#backup-hint').innerHTML = b.total ? `<a href="#/daten" class="${due ? 'due' : ''}">${due ? '⚠ Sicherung fällig' : `✓ gesichert ${fmtDate(b.last)}`}</a>` : '';
  if (route === 'daten') {
    (navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false))
      .then((p) => { const el = $('#persist-state'); if (el) el.textContent = p ? 'ja' : 'nein (Browser darf bei Platzmangel löschen – App installieren hilft)'; });
  }
}

function init() {
  $('#view').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el.dataset);
  });
  $('#view').addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el);
  });
  $('#nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
}

(async () => {
  init();
  await Store.load();
  Store.requestPersistent();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker nicht registriert', err));
  }
})();
