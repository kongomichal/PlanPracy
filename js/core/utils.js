/* Narzędzia wspólne: daty, tekst, powiadomienia, stałe */
const DAYS_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const DAYS_LONG = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

const STATUS = {
  plan:    'Zaplanowane',
  done:    'Wykonane',
  partial: 'Częściowo',
  notdone: 'Niewykonane',
  moved:   'Przeniesione'
};

const ITEM_TYPES = {
  scaffold: 'Rusztowanie',
  tool:     'Narzędzie',
  doc:      'Dokument',
  material: 'Materiał',
  other:    'Inne'
};

const $ = (id) => document.getElementById(id);

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function mondayOf(d = new Date()) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (r.getDay() + 6) % 7;
  return addDays(r, -shift);
}

function shortDate(d) {
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function longDate(d) {
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Liczba godzin między "07:00" a "15:30" (zaokrąglona do 0,1). */
function hoursBetween(from, to) {
  if (!from || !to) return 0;
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return Math.round(mins / 6) / 10;
}

function fmtHours(h) {
  return `${Math.round(h * 10) / 10} h`.replace('.', ',');
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10, lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

function toast(msg, actionText, actionFn) {
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if (actionText && typeof actionFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.textContent = actionText;
    btn.addEventListener('click', () => {
      actionFn();
      el.remove();
    });
    el.appendChild(btn);
  }
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

/** Godziny osoby: rzeczywiste (jeśli wpisane), w przeciwnym razie planowane. */
function personHours(p) {
  const real = !!(p.realFrom && p.realTo);
  return { real, hours: real ? hoursBetween(p.realFrom, p.realTo) : hoursBetween(p.from, p.to) };
}
