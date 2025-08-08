// Calendário colaborativo com Firestore (tempo real)

(function () {
  const monthLabel = document.getElementById('monthLabel');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const calendarGrid = document.getElementById('calendarGrid');
  const upcomingList = document.getElementById('upcomingList');

  // Modal
  const modal = document.getElementById('eventModal');
  const modalDateLabel = document.getElementById('eventDateLabel');
  const modalCloseEls = modal.querySelectorAll('[data-close]');
  const dayEventsList = document.getElementById('dayEventsList');
  const eventForm = document.getElementById('eventForm');
  const eventTitleInput = document.getElementById('eventTitle');
  const eventDescInput = document.getElementById('eventDesc');

  // Modal de detalhes
  const detailsModal = document.getElementById('eventDetailsModal');
  const detailsCloseEls = detailsModal ? detailsModal.querySelectorAll('[data-details-close]') : [];
  const detailsDate = document.getElementById('detailsDate');
  const detailsView = document.getElementById('detailsView');
  const detailsViewTitle = document.getElementById('detailsViewTitle');
  const detailsViewDesc = document.getElementById('detailsViewDesc');
  const detailsEditBtn = document.getElementById('detailsEditBtn');
  const detailsDeleteBtn = document.getElementById('detailsDeleteBtn');
  const detailsEditForm = document.getElementById('detailsEditForm');
  const detailsEditTitle = document.getElementById('detailsEditTitle');
  const detailsEditDesc = document.getElementById('detailsEditDesc');
  const detailsCancelEditBtn = document.getElementById('detailsCancelEditBtn');

  let current = new Date();
  current.setDate(1);

  const state = {
    eventsByDate: new Map(), // key: YYYY-MM-DD => [{ id, date, title, description, createdAt }]
    unsubscribe: null,
    selectedDateIso: null,
    selectedEventId: null,
  };

  const monthNames = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  const weekdayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fromIsoToDisplay(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  function compareIso(a, b) {
    return a.localeCompare(b);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function renderHeader() {
    monthLabel.textContent = `${monthNames[current.getMonth()]} ${current.getFullYear()}`;
  }

  function buildMonthMatrix(year, month) {
    // month: 0-11
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstWeekday = firstDay.getDay(); // 0=Dom
    const daysInMonth = lastDay.getDate();

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const cells = [];

    // leading (dias do mês anterior)
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const date = new Date(year, month - 1, dayNum);
      cells.push({ date, inMonth: false });
    }
    // current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    // trailing (dias do próximo mês) até completar múltiplos de 7
    while (cells.length % 7 !== 0) {
      const n = cells.length - (firstWeekday + daysInMonth) + 1;
      const date = new Date(year, month + 1, n);
      cells.push({ date, inMonth: false });
    }
    return cells;
  }

  function renderCalendar() {
    clear(calendarGrid);
    renderHeader();
    const y = current.getFullYear();
    const m = current.getMonth();
    const cells = buildMonthMatrix(y, m);
    const todayIso = toIsoDate(new Date());

    for (const cell of cells) {
      const iso = toIsoDate(cell.date);
      const dayCell = document.createElement('div');
      dayCell.className = 'day' + (cell.inMonth ? '' : ' out-month');
      dayCell.setAttribute('role', 'gridcell');
      dayCell.setAttribute('data-date', iso);

      const header = document.createElement('div');
      header.className = 'day-header';
      const num = document.createElement('div');
      num.className = 'date-number';
      num.textContent = String(cell.date.getDate());
      header.appendChild(num);

      if (iso === todayIso) {
        const today = document.createElement('span');
        today.className = 'today-badge';
        today.textContent = 'Hoje';
        header.appendChild(today);
      }

      dayCell.appendChild(header);

      const events = state.eventsByDate.get(iso) || [];
      if (events.length > 0) {
        if (events.length <= 3) {
          const chips = document.createElement('div');
          chips.className = 'event-dots';
          events.slice(0, 3).forEach(() => {
            const dot = document.createElement('span');
            dot.className = 'event-dot';
            chips.appendChild(dot);
          });
          dayCell.appendChild(chips);
        } else {
          const chip = document.createElement('span');
          chip.className = 'event-chip';
          chip.textContent = `${events.length} tarefas`;
          dayCell.appendChild(chip);
        }
      }

      dayCell.addEventListener('click', () => openModalForDate(iso));
      calendarGrid.appendChild(dayCell);
    }
  }

  function renderUpcoming() {
    clear(upcomingList);
    const todayIso = toIsoDate(new Date());
    const all = [];
    for (const [iso, events] of state.eventsByDate.entries()) {
      if (compareIso(iso, todayIso) >= 0) {
        for (const ev of events) all.push(ev);
      }
    }
    all.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const next = all.slice(0, 10);

    if (next.length === 0) {
      const li = document.createElement('li');
      li.className = 'upcoming-item';
      li.textContent = 'Sem atividades futuras.';
      upcomingList.appendChild(li);
      return;
    }

    for (const ev of next) {
      const li = document.createElement('li');
      li.className = 'upcoming-item';

      const dateBox = document.createElement('div');
      dateBox.className = 'upcoming-date';
      const dt = new Date(ev.date + 'T00:00:00');
      const daynum = document.createElement('div');
      daynum.className = 'daynum';
      daynum.textContent = String(dt.getDate());
      const month = document.createElement('div');
      month.className = 'month';
      month.textContent = monthNames[dt.getMonth()].slice(0, 3);
      dateBox.appendChild(daynum);
      dateBox.appendChild(month);

      const main = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'upcoming-title';
      title.textContent = ev.title;
      const desc = document.createElement('div');
      desc.className = 'upcoming-desc';
      desc.textContent = ev.description || '';
      main.appendChild(title);
      if (desc.textContent) main.appendChild(desc);

      const tag = document.createElement('span');
      tag.className = 'tag-day';
      tag.textContent = weekdayNames[dt.getDay()];

      li.appendChild(dateBox);
      li.appendChild(main);
      li.appendChild(tag);
      li.addEventListener('click', () => openDetails(ev));
      upcomingList.appendChild(li);
    }
  }

  function openModalForDate(iso) {
    state.selectedDateIso = iso;
    modalDateLabel.textContent = fromIsoToDisplay(iso);
    eventTitleInput.value = '';
    eventDescInput.value = '';
    renderDayEventsList();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    state.selectedDateIso = null;
  }

  function renderDayEventsList() {
    clear(dayEventsList);
    if (!state.selectedDateIso) return;
    const events = (state.eventsByDate.get(state.selectedDateIso) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
    if (events.length === 0) {
      const li = document.createElement('li');
      li.className = 'day-event-item';
      li.textContent = 'Nenhuma tarefa adicionada para este dia.';
      dayEventsList.appendChild(li);
      return;
    }
    for (const ev of events) {
      const li = document.createElement('li');
      li.className = 'day-event-item';

      const info = document.createElement('div');
      const t = document.createElement('div');
      t.className = 'event-title';
      t.textContent = ev.title;
      const d = document.createElement('div');
      d.className = 'event-desc';
      d.textContent = ev.description || '';
      info.appendChild(t);
      if (d.textContent) info.appendChild(d);

      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.textContent = 'Excluir';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.db) return alert('Firebase não inicializado.');
        try {
          await window.db.collection('events').doc(ev.id).delete();
        } catch (err) {
          console.error(err);
          alert('Falha ao excluir.');
        }
      });

      li.appendChild(info);
      li.appendChild(del);
      li.addEventListener('click', () => openDetails(ev));
      dayEventsList.appendChild(li);
    }
  }

  // Eventos do modal
  modalCloseEls.forEach((el) => el.addEventListener('click', closeModal));

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedDateIso) return;
    if (!window.db) return alert('Firebase não inicializado. Edite firebase-config.js');
    const title = eventTitleInput.value.trim();
    const description = eventDescInput.value.trim();
    if (!title) return;
    try {
      await window.db.collection('events').add({
        date: state.selectedDateIso,
        title,
        description,
        createdAt: new Date().toISOString(),
      });
      eventTitleInput.value = '';
      eventDescInput.value = '';
    } catch (err) {
      console.error(err);
      alert('Falha ao salvar tarefa.');
    }
  });

  // --------- Detalhes da atividade ---------
  function getEventById(id) {
    for (const [, list] of state.eventsByDate.entries()) {
      const found = list.find((x) => x.id === id);
      if (found) return found;
    }
    return null;
  }

  function openDetails(ev) {
    if (!detailsModal) return;
    state.selectedEventId = ev.id;
    detailsDate.textContent = fromIsoToDisplay(ev.date);
    detailsViewTitle.textContent = ev.title || 'Sem título';
    detailsViewDesc.textContent = ev.description || '';
    if (detailsView) detailsView.style.display = '';
    if (detailsEditForm) detailsEditForm.style.display = 'none';
    detailsModal.classList.add('show');
    detailsModal.setAttribute('aria-hidden', 'false');
  }

  function closeDetails() {
    if (!detailsModal) return;
    detailsModal.classList.remove('show');
    detailsModal.setAttribute('aria-hidden', 'true');
    state.selectedEventId = null;
  }

  if (detailsCloseEls && detailsCloseEls.forEach) {
    detailsCloseEls.forEach((el) => el.addEventListener('click', closeDetails));
  }
  if (detailsEditBtn) {
    detailsEditBtn.addEventListener('click', () => {
      const ev = getEventById(state.selectedEventId);
      if (!ev) return;
      detailsEditTitle.value = ev.title || '';
      detailsEditDesc.value = ev.description || '';
      detailsView.style.display = 'none';
      detailsEditForm.style.display = '';
    });
  }
  if (detailsCancelEditBtn) {
    detailsCancelEditBtn.addEventListener('click', () => {
      detailsEditForm.style.display = 'none';
      detailsView.style.display = '';
    });
  }
  if (detailsEditForm) {
    detailsEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = state.selectedEventId;
      if (!id || !window.db) return;
      const title = detailsEditTitle.value.trim();
      const description = detailsEditDesc.value.trim();
      if (!title) return;
      try {
        await window.db.collection('events').doc(id).update({ title, description });
        detailsEditForm.style.display = 'none';
        detailsView.style.display = '';
      } catch (err) {
        console.error(err);
        alert('Falha ao atualizar.');
      }
    });
  }
  if (detailsDeleteBtn) {
    detailsDeleteBtn.addEventListener('click', async () => {
      const id = state.selectedEventId;
      if (!id || !window.db) return;
      try {
        await window.db.collection('events').doc(id).delete();
        closeDetails();
      } catch (err) {
        console.error(err);
        alert('Falha ao excluir.');
      }
    });
  }

  // Navegação de mês
  prevBtn.addEventListener('click', () => { current.setMonth(current.getMonth() - 1); renderCalendar(); });
  nextBtn.addEventListener('click', () => { current.setMonth(current.getMonth() + 1); renderCalendar(); });

  // Sincronização com Firestore em tempo real
  function subscribe() {
    if (!window.db) return; // aguardará até init
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = window.db
      .collection('events')
      .orderBy('date', 'asc')
      .onSnapshot((snap) => {
        const map = new Map();
        snap.forEach((doc) => {
          const data = doc.data();
          if (!data || !data.date) return;
          const ev = {
            id: doc.id,
            date: data.date,
            title: data.title || 'Sem título',
            description: data.description || '',
            createdAt: data.createdAt || null,
          };
          if (!map.has(ev.date)) map.set(ev.date, []);
          map.get(ev.date).push(ev);
        });
        state.eventsByDate = map;
        renderCalendar();
        renderUpcoming();
        // Se modal aberto, atualizar lista do dia
        if (state.selectedDateIso) renderDayEventsList();
        // Se detalhes aberto, sincronizar visualização sem sair do modo edição
        if (state.selectedEventId && detailsModal && detailsModal.classList.contains('show')) {
          const current = getEventById(state.selectedEventId);
          if (!current) {
            closeDetails();
          } else if (detailsEditForm && detailsEditForm.style.display === 'none') {
            detailsDate.textContent = fromIsoToDisplay(current.date);
            detailsViewTitle.textContent = current.title || 'Sem título';
            detailsViewDesc.textContent = current.description || '';
          }
        }
      }, (err) => {
        console.error(err);
      });
  }

  // Caso o Firebase demore a carregar, tentamos algumas vezes
  function waitForDbAndStart(attempts = 20) {
    if (window.db) {
      renderCalendar();
      renderUpcoming();
      subscribe();
      return;
    }
    renderCalendar(); // permite usar o calendário mesmo sem Firebase ainda
    if (attempts > 0) setTimeout(() => waitForDbAndStart(attempts - 1), 250);
  }

  waitForDbAndStart();
})();

