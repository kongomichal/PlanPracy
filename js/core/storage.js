/* Zapis i odczyt danych. Dziś: localStorage. Później łatwo podmienić na serwer.
   Dzień = { date, jobs: [ praca, praca, ... ] }
   Praca = { place, goal, status, people:[{name,from,to}], items:[{type,text,done}], result } */
const Store = {
  KEY: 'muraven_plan_v2',
  data: {},

  unsub: null,

  col() { return firebase.firestore().collection('days'); },

  load() {
    if (CLOUD_ENABLED) { this.data = {}; return; } // dane przyjdą z chmury po zalogowaniu
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { this.data = this.normalize(JSON.parse(raw)); this.save(); return; }
    } catch (e) { console.error('Błąd odczytu danych', e); }
    this.data = buildSampleData(mondayOf());
    this.save();
  },

  save() {
    if (CLOUD_ENABLED) return;
    localStorage.setItem(this.KEY, JSON.stringify(this.data));
  },

  /** Nasłuchuje zmian w chmurze i woła onChange przy każdej aktualizacji. */
  startSync(onChange) {
    if (!CLOUD_ENABLED || this.unsub) return;
    this.unsub = this.col().onSnapshot((snap) => {
      const raw = {};
      snap.forEach(doc => { raw[doc.id] = doc.data(); });
      this.data = this.normalize(raw);
      onChange();
    }, (err) => { console.error(err); toast('Brak połączenia z bazą danych'); });
  },

  stopSync() {
    if (this.unsub) this.unsub();
    this.unsub = null;
    if (CLOUD_ENABLED) this.data = {};
  },

  /** Zastępuje wszystkie dane w chmurze podanymi. */
  replaceAll(newData) {
    this.data = newData;
    if (!CLOUD_ENABLED) return this.save();
    const batch = firebase.firestore().batch();
    Object.keys(newData).forEach(k => batch.set(this.col().doc(k), newData[k]));
    this.col().get().then(snap => {
      snap.forEach(doc => { if (!newData[doc.id]) batch.delete(doc.ref); });
      return batch.commit();
    }).catch(() => toast('Nie udało się zapisać w chmurze'));
  },

  /** Zamienia stary format (1 praca w dniu) na nowy (lista prac). */
  normalize(data) {
    const out = {};
    Object.entries(data || {}).forEach(([key, day]) => {
      if (Array.isArray(day.jobs)) { out[key] = { date: key, jobs: day.jobs }; return; }
      const job = {
        place: day.place || '', goal: day.goal || '', status: day.status || 'plan',
        people: day.people || [], items: day.items || [], result: day.result || ''
      };
      out[key] = { date: key, jobs: this.jobHasContent(job) ? [job] : [] };
    });
    return out;
  },

  emptyJob() {
    return { place: '', goal: '', status: 'plan', people: [], items: [], result: '' };
  },

  jobHasContent(j) {
    return !!(j.goal || j.place || j.people.length || j.items.length);
  },

  empty(key) {
    return { date: key, jobs: [] };
  },

  get(key) {
    return this.data[key] || this.empty(key);
  },

  set(key, day) {
    this.data[key] = day;
    this.save();
    if (CLOUD_ENABLED) {
      this.col().doc(key).set(JSON.parse(JSON.stringify(day)))
        .catch(() => toast('Nie udało się zapisać w chmurze'));
    }
  },

  hasContent(day) {
    return day.jobs.length > 0;
  },

  exportJson() {
    return JSON.stringify(this.data, null, 2);
  },

  importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Zły format');
    this.replaceAll(this.normalize(parsed));
  },

  resetToSample() {
    this.replaceAll(buildSampleData(mondayOf()));
  }
};
