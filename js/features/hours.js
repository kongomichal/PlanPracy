/* Zakładka "Godziny": kto, gdzie, ile – jedno pod drugim, z możliwością skopiowania */
const Hours = {
  /** Zbiera dane: osoba -> projekt -> dni. Prace przeniesione na inny dzień są pomijane (żeby nie liczyć dwa razy). */
  collect() {
    const keys = $('hoursRange').value === 'all' ? Object.keys(Store.data).sort() : Plan.keys();
    const people = {};

    keys.forEach(key => {
      Store.get(key).jobs.forEach(job => {
        if (job.status === 'moved') return;
        const project = job.place || 'Bez projektu';
        job.people.forEach(p => {
          const { hours, real } = personHours(p);
          const person = people[p.name] = people[p.name] || { total: 0, projects: {} };
          const proj = person.projects[project] = person.projects[project] || { total: 0, lines: [] };
          person.total += hours;
          proj.total += hours;
          proj.lines.push({ key, goal: job.goal, hours, real });
        });
      });
    });
    return people;
  },

  sortedNames(people) {
    return Object.keys(people).sort((a, b) => a.localeCompare(b, 'pl'));
  },

  lineLabel(l) {
    const d = parseKey(l.key);
    return `${DAYS_SHORT[d.getDay()]} ${shortDate(d)}.${d.getFullYear()}`;
  },

  render() {
    const people = this.collect();
    const names = this.sortedNames(people);
    const box = $('hoursList');

    if (!names.length) {
      box.innerHTML = '<div class="empty-state">Brak godzin w wybranym zakresie.</div>';
      return;
    }

    box.innerHTML = names.map(name => {
      const person = people[name];
      return `
        <section class="h-person">
          <div class="h-person-head"><span>${esc(name)}</span><span>${fmtHours(person.total)}</span></div>
          ${Object.keys(person.projects).sort((a, b) => a.localeCompare(b, 'pl')).map(pn => {
            const proj = person.projects[pn];
            return `
              <div class="h-project"><span>${esc(pn)}</span><span>${fmtHours(proj.total)}</span></div>
              ${proj.lines.map(l => `
                <div class="h-line">
                  <span>${this.lineLabel(l)}${l.goal ? ' · ' + esc(l.goal) : ''}${l.real ? '' : '<span class="h-plan">plan</span>'}</span>
                  <span>${fmtHours(l.hours)}</span>
                </div>`).join('')}`;
          }).join('')}
        </section>`;
    }).join('');
  },

  copyText() {
    const people = this.collect();
    const names = this.sortedNames(people);
    if (!names.length) { toast('Brak godzin do skopiowania'); return; }

    const text = names.map(name => {
      const person = people[name];
      const projects = Object.keys(person.projects).sort((a, b) => a.localeCompare(b, 'pl')).map(pn => {
        const proj = person.projects[pn];
        const lines = proj.lines.map(l => `    ${this.lineLabel(l)}: ${fmtHours(l.hours)}${l.real ? '' : ' (plan)'}`).join('\n');
        return `  ${pn} – ${fmtHours(proj.total)}\n${lines}`;
      }).join('\n');
      return `${name} – RAZEM ${fmtHours(person.total)}\n${projects}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text)
      .then(() => toast('Skopiowano podsumowanie godzin'))
      .catch(() => prompt('Skopiuj tekst:', text));
  },

  init() {
    $('hoursRange').addEventListener('change', () => this.render());
    $('copyHoursBtn').addEventListener('click', () => this.copyText());
  }
};
