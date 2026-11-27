/* Pasek kontroli puli godzin (RBH) w trwających projektach:
   - Wyświetlany nad kalendarzem na ekranie głównym oraz w module Dodaj godziny (dla kierownika na budowie).
   - Lista projektów pobiera się 1:1 z listy projektów w "Dodaj godziny" (Store.getProjects()) — usunięcie projektu tam usuwa go również tutaj.
   - Pula docelowa godzin jest wprowadzana ręcznie (pole liczbowe + prosty suwak), a zużycie sczytuje się automatycznie z wpisanych godzin (z zachowaniem wyrobionych godzin po cotygodniowym eksporcie i resecie tabeli). */
const ProjectPools = {
  editingProject: null,

  fmt(val) {
    const n = Math.round((Number(val) || 0) * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  },

  buildHtml(containerPrefix) {
    const projects = Store.getProjects();
    if (!projects.length) {
      return '';
    }

    const rowsData = projects.map(name => {
      const cfg = Store.getProjectPoolConfig(name);
      const liveRbh = Store.getProjectLiveHours(name);
      const carriedRbh = cfg.carriedRbh || 0;
      const usedRbh = Math.round((liveRbh + carriedRbh) * 10) / 10;
      const poolRbh = cfg.poolRbh || 0;

      const hasPool = poolRbh > 0;
      const rawPct = hasPool ? Math.round((usedRbh / poolRbh) * 100) : 0;
      const clampedPct = Math.min(100, Math.max(0, rawPct));
      const remRbh = hasPool ? Math.round((poolRbh - usedRbh) * 10) / 10 : 0;
      const remPct = hasPool ? Math.max(0, 100 - clampedPct) : 0;

      let state = 'unset'; // 'ok' | 'warn' | 'over' | 'unset'
      if (hasPool) {
        if (usedRbh > poolRbh) state = 'over';
        else if (rawPct >= 85) state = 'warn';
        else state = 'ok';
      }

      return {
        name,
        poolRbh,
        liveRbh,
        carriedRbh,
        usedRbh,
        hasPool,
        rawPct,
        clampedPct,
        remRbh,
        remPct,
        state
      };
    });

    const overCount = rowsData.filter(r => r.state === 'over').length;
    const withPoolCount = rowsData.filter(r => r.hasPool).length;

    let statusPillHtml = '';
    if (overCount > 0) {
      statusPillHtml = `<span class="ppool-head-pill red">⚠️ Przekroczono pulę w ${overCount} ${plural(overCount, 'projekcie', 'projektach', 'projektach')}</span>`;
    } else if (withPoolCount > 0) {
      statusPillHtml = `<span class="ppool-head-pill green">Wszystkie mieszczą się w puli godzin</span>`;
    } else {
      statusPillHtml = `<span class="ppool-head-pill slate">Kliknij „✎ Pula RBH”, aby wprowadzić ręcznie limit godzin</span>`;
    }

    const rowsHtml = rowsData.map(r => {
      const isEditing = this.editingProject === r.name;
      const colHex = r.state === 'over' ? '#dc2626' : (r.state === 'warn' ? '#d97706' : (r.state === 'ok' ? '#16a34a' : '#64748b'));

      const leftBadge = r.hasPool
        ? `<div class="ppool-col-target" style="color:${colHex};">🎯 Pula: ${this.fmt(r.usedRbh)} RBH / ${this.fmt(r.poolRbh)} RBH</div>`
        : `<div class="ppool-col-target unset">⏱️ Wpisano: ${this.fmt(r.usedRbh)} RBH / <span class="muted">brak puli</span></div>`;

      let subLine = '';
      if (!r.hasPool) {
        subLine = `Wpisane godziny: <b>${this.fmt(r.liveRbh)} RBH</b>${r.carriedRbh > 0 ? ` (+ z poprzednich tyg.: <b>${this.fmt(r.carriedRbh)} RBH</b>)` : ''} · <span style="color:#2563eb; font-weight:700;">Ustaw ręcznie pulę projektu →</span>`;
      } else if (r.remRbh >= 0) {
        subLine = `W zapasie do końca: <b>${this.fmt(r.remRbh)} RBH (${r.remPct}% puli)</b> · Pula wprowadzona ręcznie: <b>${this.fmt(r.poolRbh)} RBH</b>`;
        if (r.carriedRbh > 0) {
          subLine += ` <span class="muted">(bieżące: ${this.fmt(r.liveRbh)}h + wcześniejsze: ${this.fmt(r.carriedRbh)}h)</span>`;
        }
      } else {
        subLine = `<b style="color:#dc2626;">Przekroczono pulę o +${this.fmt(Math.abs(r.remRbh))} RBH!</b> · Pula wprowadzona ręcznie: <b>${this.fmt(r.poolRbh)} RBH</b>`;
      }

      const sliderMax = Math.max(200, Math.ceil((r.poolRbh || r.usedRbh || 40) * 1.6 / 10) * 10);

      const barSection = r.hasPool
        ? `
          <div class="ppool-col-bar">
            <div class="ppool-bar-line">
              <div class="ppool-bar-track">
                <div class="ppool-bar-fill" style="width:${r.clampedPct}%; background:${colHex};"></div>
              </div>
              <strong class="ppool-used-label">Zużyto: ${r.rawPct}%</strong>
            </div>
            <div class="ppool-rem-caption" style="color:${r.remRbh >= 0 ? '#15803d' : '#dc2626'};">
              ${r.remRbh >= 0
                ? `Zostało w zapasie: ${r.remPct}% (${this.fmt(r.remRbh)} RBH)`
                : `Przekroczono limit o +${this.fmt(Math.abs(r.remRbh))} RBH (${r.rawPct}%)`}
            </div>
          </div>`
        : `
          <div class="ppool-col-bar">
            <div class="ppool-bar-line">
              <div class="ppool-bar-track">
                <div class="ppool-bar-fill" style="width:0%; background:#94a3b8;"></div>
              </div>
              <strong class="ppool-used-label muted">Brak limitu</strong>
            </div>
            <div class="ppool-rem-caption muted">Wprowadź ręcznie pulę godzin dla tej budowy</div>
          </div>`;

      const editorDrawer = isEditing
        ? `
          <div class="ppool-editor-drawer" data-ppool-editor="${esc(r.name)}">
            <div class="ppool-editor-grid">
              <div class="ppool-editor-field">
                <label>1. Pula godzin na cały projekt (wprowadź ręcznie RBH):</label>
                <div class="ppool-slider-row">
                  <input type="range" class="ppool-range-slider" min="0" max="${sliderMax}" step="1" value="${r.poolRbh}" data-ppool-range>
                  <input type="number" class="ppool-num-input" min="0" step="0.5" value="${r.poolRbh || ''}" placeholder="np. 120" data-ppool-input-pool>
                  <span class="ppool-unit">RBH</span>
                </div>
              </div>
              <div class="ppool-editor-field">
                <label>2. Godziny sprzed resetu tabeli (opcjonalnie, RBH):</label>
                <div class="ppool-slider-row">
                  <input type="number" class="ppool-num-input" min="0" step="0.5" value="${r.carriedRbh}" placeholder="0" data-ppool-input-carried title="Godziny wyrobione w poprzednich tygodniach, które zostały już wyeksportowane i usunięte z tabeli">
                  <span class="ppool-unit">RBH</span>
                  <span class="muted small">(+ bieżące z tabeli: <b>${this.fmt(r.liveRbh)} RBH</b>)</span>
                </div>
              </div>
            </div>
            <div class="ppool-editor-actions">
              ${r.carriedRbh > 0 ? `<button type="button" class="btn small" data-ppool-zero-carried="${esc(r.name)}">Zeruj wcześniejsze (${this.fmt(r.carriedRbh)}h)</button>` : ''}
              <button type="button" class="btn small" data-ppool-cancel>Anuluj</button>
              <button type="button" class="btn small primary" data-ppool-save="${esc(r.name)}">✓ Zapisz pulę</button>
            </div>
          </div>`
        : '';

      return `
        <div class="ppool-row ${r.state === 'over' ? 'is-over' : (r.state === 'warn' ? 'is-warn' : '')}" data-ppool-row="${esc(r.name)}">
          <div class="ppool-row-main">
            ${leftBadge}
            <div class="ppool-col-info">
              <div class="ppool-proj-name">${esc(r.name)}</div>
              <div class="ppool-proj-sub">${subLine}</div>
            </div>
            ${barSection}
            <div class="ppool-col-act">
              <button type="button" class="btn small ppool-edit-btn" data-ppool-toggle-edit="${esc(r.name)}" title="Wprowadź ręcznie pulę godzin RBH dla tego projektu">
                ${r.hasPool ? '✎ Pula RBH' : '+ Ustaw pulę'}
              </button>
            </div>
          </div>
          ${editorDrawer}
        </div>`;
    }).join('');

    return `
      <div class="ppool-banner-card" data-ppool-prefix="${containerPrefix}">
        <div class="ppool-banner-head">
          <div class="ppool-banner-title">
            <span>🏗️ Stan godzinowy trwających projektów (Ile zostało do końca)</span>
            <span class="ppool-head-pill blue">${projects.length} w realizacji</span>
            ${statusPillHtml}
          </div>
          <span class="ppool-banner-hint">Lista projektów synchronizuje się automatycznie z polem wyboru projektu w „Dodaj godziny”</span>
        </div>
        <div class="ppool-rows-list">
          ${rowsHtml}
        </div>
      </div>`;
  },

  render() {
    const dashBox = $('dashProjectsPoolBox');
    if (dashBox) {
      dashBox.innerHTML = this.buildHtml('dash');
    }
    const hoursBox = $('hoursProjectsPoolBox');
    if (hoursBox) {
      hoursBox.innerHTML = this.buildHtml('hours');
    }
  },

  bindContainer(containerEl) {
    if (!containerEl) return;

    containerEl.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-ppool-toggle-edit]');
      if (toggleBtn) {
        const pName = toggleBtn.dataset.ppoolToggleEdit;
        this.editingProject = (this.editingProject === pName) ? null : pName;
        this.render();
        if (this.editingProject) {
          setTimeout(() => {
            const inp = containerEl.querySelector('[data-ppool-input-pool]');
            if (inp) { inp.focus(); inp.select(); }
          }, 20);
        }
        return;
      }

      const cancelBtn = e.target.closest('[data-ppool-cancel]');
      if (cancelBtn) {
        this.editingProject = null;
        this.render();
        return;
      }

      const zeroBtn = e.target.closest('[data-ppool-zero-carried]');
      if (zeroBtn) {
        const pName = zeroBtn.dataset.ppoolZeroCarried;
        Store.setProjectPoolConfig(pName, { carriedRbh: 0 });
        this.render();
        toast(`Wyzerowano wcześniejsze godziny dla „${pName}”`);
        return;
      }

      const saveBtn = e.target.closest('[data-ppool-save]');
      if (saveBtn) {
        const pName = saveBtn.dataset.ppoolSave;
        const drawer = saveBtn.closest('[data-ppool-editor]');
        const poolVal = drawer?.querySelector('[data-ppool-input-pool]')?.value ?? 0;
        const carriedVal = drawer?.querySelector('[data-ppool-input-carried]')?.value ?? 0;
        Store.setProjectPoolConfig(pName, {
          poolRbh: poolVal,
          carriedRbh: carriedVal
        });
        this.editingProject = null;
        this.render();
        toast(`Zapisano pulę godzin dla projektu „${pName}”`);
      }
    });

    containerEl.addEventListener('input', (e) => {
      if (e.target.matches('[data-ppool-range]')) {
        const drawer = e.target.closest('[data-ppool-editor]');
        const numInp = drawer?.querySelector('[data-ppool-input-pool]');
        if (numInp) numInp.value = e.target.value;
      } else if (e.target.matches('[data-ppool-input-pool]')) {
        const drawer = e.target.closest('[data-ppool-editor]');
        const rangeInp = drawer?.querySelector('[data-ppool-range]');
        if (rangeInp) {
          const val = parseFloat(e.target.value) || 0;
          if (val > parseFloat(rangeInp.max)) rangeInp.max = Math.ceil(val * 1.3);
          rangeInp.value = val;
        }
      }
    });

    containerEl.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-ppool-input-pool], [data-ppool-input-carried]')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const drawer = e.target.closest('[data-ppool-editor]');
          drawer?.querySelector('[data-ppool-save]')?.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.editingProject = null;
          this.render();
        }
      }
    });
  },

  init() {
    this.bindContainer($('dashProjectsPoolBox'));
    this.bindContainer($('hoursProjectsPoolBox'));
    this.render();
  }
};

