/* Zakładka "Ekipa": kto, gdzie, kiedy – z ostrzeżeniem o nakładających się godzinach */
const People = {
  toMinutes(t) {
    const [h, m] = (t || '0:0').split(':').map(Number);
    return h * 60 + m;
  },

  render() {
    const map = {};
    Plan.keys().forEach(key => {
      Store.get(key).jobs.forEach((job, jobIndex) => {
        job.people.forEach(p => {
          (map[p.name] = map[p.name] || []).push({ key, jobIndex, goal: job.goal, place: job.place, from: p.from, to: p.to });
        });
      });
    });

    const names = Object.keys(map).sort((a, b) => a.localeCompare(b, 'pl'));
    if (!names.length) {
      $('peopleList').innerHTML = '<div class="empty-state" style="grid-column:1/-1">Nikt nie jest jeszcze przypisany do dni.</div>';
      return;
    }

    $('peopleList').innerHTML = names.map(name => {
      const lines = map[name];
      const total = lines.reduce((s, l) => s + hoursBetween(l.from, l.to), 0);
      const days = new Set(lines.map(l => l.key)).size;
      return `
        <section class="person">
          <div class="person-head"><h3>${esc(name)}</h3><span class="muted small">${days} ${plural(days, 'dzień', 'dni', 'dni')} · ${fmtHours(total)}</span></div>
          ${lines.map(l => {
            const d = parseKey(l.key);
            const clash = lines.some(o => o !== l && o.key === l.key &&
              this.toMinutes(o.from) < this.toMinutes(l.to) && this.toMinutes(l.from) < this.toMinutes(o.to));
            return `<div class="person-line" data-date="${l.key}" data-job="${l.jobIndex}">
              <span><b>${DAYS_SHORT[d.getDay()]} ${shortDate(d)}</b> ${esc(l.place) || '—'}${l.goal ? ' · ' + esc(l.goal) : ''}
                ${clash ? '<b style="color:var(--red)"> ⚠ nakłada się z inną pracą</b>' : ''}</span>
              <span>${l.from}–${l.to}</span>
            </div>`;
          }).join('')}
        </section>`;
    }).join('');
  }
};
