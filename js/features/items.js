/* Zakładka "Rzeczy do przygotowania" – zbiorcza lista z 14 dni (ze wszystkich prac) */
const Items = {
  collect(onlyTodo) {
    const groups = [];
    Plan.keys().forEach(key => {
      const day = Store.get(key);
      const lines = [];
      day.jobs.forEach((job, jobIndex) => {
        job.items.forEach((item, index) => {
          if (!onlyTodo || !item.done) lines.push({ item, job, jobIndex, index });
        });
      });
      if (lines.length) groups.push({ key, day, lines });
    });
    return groups;
  },

  todoCount() {
    return Plan.keys().reduce((s, k) =>
      s + Store.get(k).jobs.reduce((t, j) => t + j.items.filter(i => !i.done).length, 0), 0);
  },

  jobLabel(job) {
    return [job.goal, job.place].filter(Boolean).join(' – ');
  },

  render() {
    const groups = this.collect($('onlyTodo').checked);
    const box = $('itemsList');

    if (!groups.length) {
      box.innerHTML = '<div class="empty-state">Wszystko załatwione – nic do przygotowania. 👍</div>';
      return;
    }

    box.innerHTML = groups.map(g => `
      <section class="items-day">
        <div class="items-day-head" data-date="${g.key}">
          <span>${longDate(parseKey(g.key))}</span>
        </div>
        ${g.lines.map(({ item, job, jobIndex, index }) => `
          <label class="item-line ${item.done ? 'done' : ''}">
            <input type="checkbox" data-toggle="${g.key}" data-job="${jobIndex}" data-index="${index}" ${item.done ? 'checked' : ''}>
            <span class="tag t-${item.type}">${ITEM_TYPES[item.type] || 'Inne'}</span>
            <span class="item-text">${esc(item.text)}<div class="item-job">${esc(this.jobLabel(job))}</div></span>
          </label>`).join('')}
      </section>`).join('');
  },

  toggle(key, jobIndex, index, checked) {
    const day = Store.get(key);
    const item = day.jobs[jobIndex] && day.jobs[jobIndex].items[index];
    if (!item) return;
    item.done = checked;
    Store.set(key, day);
    App.render();
  },

  /** Tekst gotowy do wklejenia w SMS / WhatsApp. */
  copyText() {
    const groups = this.collect(true);
    if (!groups.length) { toast('Brak rzeczy do załatwienia'); return; }

    const text = 'DO PRZYGOTOWANIA:\n\n' + groups.map(g =>
      `${longDate(parseKey(g.key))}\n` +
      g.lines.map(({ item, job }) => `• ${ITEM_TYPES[item.type]}: ${item.text}${job.place ? ' (' + job.place + ')' : ''}`).join('\n')
    ).join('\n\n');

    navigator.clipboard.writeText(text)
      .then(() => toast('Skopiowano – wklej w wiadomość'))
      .catch(() => prompt('Skopiuj tekst:', text));
  }
};
