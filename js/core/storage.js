/* Zapis i odczyt danych. Dziś: localStorage. Później łatwo podmienić na serwer.
   Dzień = { date, jobs: [ praca, praca, ... ] }
   Praca = { place, goal, status, people:[{name,from,to}], items:[{type,text,done}], result } */
const Store = {
  KEY: 'muraven_plan_v2',
  data: {},

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { this.data = this.normalize(JSON.parse(raw)); this.save(); return; }
    } catch (e) { console.error('Błąd odczytu danych', e); }
    this.data = buildSampleData(mondayOf());
    this.save();
  },

  save() {
    localStorage.setItem(this.KEY, JSON.stringify(this.data));
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
    this.data = this.normalize(parsed);
    this.save();
  },

  resetToSample() {
    this.data = buildSampleData(mondayOf());
    this.save();
  }
};
