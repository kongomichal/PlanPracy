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

  /** Przekształca tekst celu na strukturę zadań i podzadań dla starych wpisów. */
  parseGoalToTasks(goal) {
    if (!goal || typeof goal !== 'string') return [];
    const trimmed = goal.trim();
    if (!trimmed) return [];

    // np. "Płytka: - bok lewa strona - środek góra - piony dół - przeniesienie rusztowania drugi bok"
    if (trimmed.includes(':') && (trimmed.includes(' - ') || trimmed.includes('\n-') || trimmed.includes('\n•') || trimmed.includes(' • '))) {
      const colonIdx = trimmed.indexOf(':');
      const title = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1);
      const subtasks = rest.split(/(?:\r?\n|\s+)(?:-|•)\s+/)
        .map(s => s.trim().replace(/^[-•]\s*/, ''))
        .filter(Boolean);
      return [{ title, subtasks }];
    }

    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.slice(1).some(l => l.startsWith('-') || l.startsWith('•'))) {
      const title = lines[0].replace(/:$/, '').trim();
      const subtasks = lines.slice(1).map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
      return [{ title, subtasks }];
    }

    return [{ title: trimmed, subtasks: [] }];
  },

  /** Normalizuje pojedynczą pracę (zapewnia istnienie tasks[] i spójność goal). */
  normalizeJob(j) {
    let tasks = Array.isArray(j.tasks) ? j.tasks : [];
    if (!tasks.length && j.goal) {
      tasks = this.parseGoalToTasks(j.goal);
    }
    tasks = tasks.map(t => ({
      title: typeof t === 'string' ? t : (t.title || ''),
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).trim()).filter(Boolean) : []
    })).filter(t => t.title || t.subtasks.length);

    const goal = j.goal || tasks.map(t => t.title + (t.subtasks.length ? ': ' + t.subtasks.join(', ') : '')).join('; ');

    return {
      place: j.place || '',
      goal,
      tasks,
      status: j.status || 'plan',
      people: j.people || [],
      items: j.items || [],
      result: j.result || ''
    };
  },

  /** Zamienia stary format (1 praca w dniu) na nowy (lista prac ze strukturą zadań). */
  normalize(data) {
    const out = {};
    Object.entries(data || {}).forEach(([key, day]) => {
      let jobs = [];
      if (Array.isArray(day.jobs)) {
        jobs = day.jobs.map(j => this.normalizeJob(j));
      } else {
        const j = this.normalizeJob(day);
        if (this.jobHasContent(j)) jobs.push(j);
      }
      out[key] = { date: key, jobs };
    });
    return out;
  },

  emptyJob() {
    return { place: '', goal: '', tasks: [{ title: '', subtasks: [] }], status: 'plan', people: [], items: [], result: '' };
  },

  jobHasContent(j) {
    const hasTasks = Array.isArray(j.tasks) && j.tasks.some(t => t.title || (t.subtasks && t.subtasks.length));
    return !!(j.place || hasTasks || j.goal || j.people.length || j.items.length);
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
