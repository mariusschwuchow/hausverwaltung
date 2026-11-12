'use strict';
// Kleine Hilfsfunktionen, die alle anderen Dateien nutzen.

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const NUM = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const fmtEur = (n) => EURO.format(n || 0);
const fmtNum = (n, digits) => (n == null || Number.isNaN(n)) ? '–'
  : (digits == null ? NUM : new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })).format(n);
const fmtDate = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '–';
const fmtMonth = (ym) => { if (!ym) return '–'; const [y, m] = ym.split('-'); return `${m}/${y}`; };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const currentMonth = () => todayIso().slice(0, 7);

function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsRange(from, to) {
  const out = [];
  for (let ym = from; ym <= to && out.length < 1200; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function addDays(iso, n) {
  const d = new Date(Date.parse(iso) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const byKey = (key) => (a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'de', { numeric: true });
