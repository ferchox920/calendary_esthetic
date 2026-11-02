import './style.css';
import { api, ApiError, requestKey } from './api';
import { type Client, type Project, type Entry, type Settings, type Day, type Availability, type GoogleStatus, statusLabels, today, addDays, weekday, instant, localDay, clock, dateLabel, esc, initials } from './domain';

const app = document.querySelector<HTMLDivElement>('#app')!;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const zoneDefault = 'America/Argentina/Buenos_Aires';
let profile: { name: string; email: string } | null = null;
let demo = false;
let view: 'agenda' | 'clients' | 'settings' = 'agenda';
let mode: 'day' | 'week' = 'day';
let date = today(zoneDefault);
let settings: Settings = { timezone: zoneDefault, version: 1, defaultPrepMinutes: 10, defaultCleanupMinutes: 10, windows: [] };
let clients: Client[] = [];
let entries: Entry[] = [];
let free: Availability['free'] = [];
let selectedClient: Client | null = null;
let projects: Project[] = [];
let search = '';
let filter = 'all';
let busy = false;
let loadError = '';
let google: GoogleStatus | null = null;
let loadSequence = 0;
let demoEntries: Entry[] = [];
let demoProjects: Project[] = [];
const icons: Record<string, string> = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  leaf: '<path d="M20 3C8 1 2 8 5 15s15 8 15-12ZM4 21 16 9"/>',
  logout: '<path d="M9 4H4v16h5M13 12h8m-4-4 4 4-4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.calendar}</svg>`;
const button = (action: string, label: string, cls = 'secondary', id = '') => `<button type="button" class="${cls}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''} ${['prev', 'next', 'close', 'remove-window'].includes(action) ? `aria-label="${({ prev: 'Período anterior', next: 'Período siguiente', close: 'Cerrar', 'remove-window': 'Quitar franja' } as Record<string, string>)[action]}"` : ''}>${label}</button>`;
const badge = (entry: Entry) => `<span class="badge ${entry.kind === 'block' ? 'block' : entry.sessionStatus}">${entry.source === 'google' && entry.kind === 'block' ? entry.googleStatus === 'cancelled' ? 'Cancelado · Google' : 'Google Calendar' : entry.kind === 'block' ? 'Bloqueado' : statusLabels[entry.sessionStatus!]}</span>`;
const empty = (title: string, text: string, action = '') => `<div class="empty">${icon('leaf')}<h3>${title}</h3><p>${text}</p>${action}</div>`;
const zone = () => settings.timezone;

function notify(text: string) {
  const target = document.querySelector<HTMLDivElement>('#notifications')!;
  target.textContent = text;
  target.classList.add('visible');
  window.setTimeout(() => target.classList.remove('visible'), 5000);
}

function fail(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && profile) {
    profile = null; clients = []; entries = []; projects = []; selectedClient = null; google = null;
    loadSequence++; busy = false; modal.close(); renderLogin('Tu sesión venció. Ingresá nuevamente para continuar.');
  } else notify(error instanceof Error ? error.message : 'Ocurrió un error. Volvé a intentar.');
}

function renderLogin(message = '') {
  app.innerHTML = `<main class="login-layout"><section class="login-story"><div class="wordmark"><span class="brand-mark">g.</span> gabriela<span class="wordmark-sub">ESTÉTICA & BIENESTAR</span></div><div class="story-copy"><span class="eyebrow">TU ESPACIO, EN ORDEN</span><h1>Más tiempo para<br>cuidar de tus<br><em>clientes.</em></h1><p>Los turnos, los detalles y cada paso de sus tratamientos. Todo en un mismo lugar.</p><div class="story-line"></div><span class="small">Una agenda pensada para vos.</span></div><div class="botanical" aria-hidden="true">${icon('leaf')}</div></section><section class="login-form-wrap"><form id="login-form" class="login-form"><span class="eyebrow">AGENDA PRIVADA</span><h2>Bienvenida, Gabriela</h2><p>Ingresá para organizar tu día y acompañar a tus clientes.</p><label>Correo electrónico<input type="email" name="email" autocomplete="username" required placeholder="Tu correo electrónico"></label><label>Contraseña<input type="password" name="password" autocomplete="current-password" required placeholder="Tu contraseña"></label><p class="form-error" role="alert">${esc(message)}</p><button class="primary full" type="submit">Ingresar a mi agenda ${icon('arrow')}</button><div class="login-divider"><span>Conocé tu nueva agenda</span></div>${button('demo', 'Explorar una demostración', 'secondary full')}<p class="login-footnote">Acceso exclusivo de Gabriela.<br>Los clientes no necesitan una cuenta.</p></form></section></main>`;
  document.querySelector<HTMLFormElement>('#login-form')!.onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true; submit.textContent = 'Ingresando…';
    try {
      const values = new FormData(form);
      const result = await api<{ profile: { name: string; email: string } }>('auth/login', 'POST', { email: String(values.get('email')).trim(), password: values.get('password') });
      profile = result.profile; demo = false; date = today(zoneDefault); selectedClient = null;
      await refresh(true);
    } catch (error) {
      form.querySelector('.form-error')!.textContent = error instanceof Error ? error.message : 'No pudimos iniciar sesión.';
    } finally { submit.disabled = false; submit.innerHTML = `Ingresar a mi agenda ${icon('arrow')}`; }
  };
}

async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const batch = await api<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`);
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
}

async function refresh(initial = false) {
  const sequence = ++loadSequence;
  busy = true; loadError = ''; render();
  try {
    if (!demo) {
      const [newSettings, newClients] = await Promise.all([api<Settings>('agenda/settings'), allPages<Client>('clients')]);
      if (sequence !== loadSequence) return;
      settings = newSettings; clients = newClients;
      if (view === 'settings') google = await api<GoogleStatus>('integrations/google');
      if (sequence !== loadSequence) return;
      if (initial) date = today(zone());
      let newEntries: Entry[];
      const start = addDays(date, 1 - weekday(date));
      const [dayData, available] = await Promise.all([
        mode === 'day' ? api<Day>(`agenda/day?date=${date}`) : api<Day>(`agenda/entries?from=${encodeURIComponent(instant(start, '00:00', zone()))}&to=${encodeURIComponent(instant(addDays(start, 7), '00:00', zone()))}`),
        api<Availability>(`agenda/availability?date=${date}`),
      ]);
      newEntries = dayData.entries;
      if (sequence !== loadSequence) return;
      entries = newEntries; free = available.free;
      if (selectedClient) {
        selectedClient = clients.find(c => c.id === selectedClient!.id) || null;
        if (selectedClient) {
          const records = await Promise.all([allPages<Project>(`clients/${selectedClient.id}/projects`), allPages<Project>(`clients/${selectedClient.id}/projects?archived=true`)]);
          const details = await Promise.all(records.flat().map(p => api<Project>(`projects/${p.id}`)));
          if (sequence !== loadSequence) return;
          projects = details;
        }
      }
    } else {
      entries = demoEntries.filter(e => mode === 'day' ? localDay(e.startAt, zone()) === date : localDay(e.startAt, zone()) >= addDays(date, 1 - weekday(date)) && localDay(e.startAt, zone()) < addDays(date, 8 - weekday(date)));
      free = localDay(demoEntries[0].startAt, zone()) === date ? [{ startAt: instant(date, '13:00', zone()), endAt: instant(date, '14:00', zone()) }, { startAt: instant(date, '16:15', zone()), endAt: instant(date, '18:00', zone()) }] : [];
      projects = selectedClient ? demoProjects.filter(p => p.clientId === selectedClient!.id) : [];
    }
  } catch (error) { if (sequence === loadSequence) { loadError = error instanceof Error ? error.message : 'No pudimos cargar la agenda.'; entries = []; free = []; projects = []; fail(error); } }
  finally { if (sequence === loadSequence && profile) { busy = false; render(); } }
}

function render() {
  if (!profile) return;
  if (loadError && !busy) {
    app.innerHTML = `<main class="boot"><div class="empty"><h2>No pudimos cargar tu espacio</h2><p>${esc(loadError)}</p>${button('retry', 'Volver a intentar', 'primary')} ${button('logout', 'Cerrar sesión', 'secondary')}</div></main>`;
    return;
  }
  const nav = (id: typeof view, label: string, symbol: string) => `<button class="nav-item ${view === id ? 'active' : ''}" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${view === id ? '<span class="nav-dot"></span>' : ''}</button>`;
  app.innerHTML = `<div class="app-layout"><aside class="sidebar"><a class="wordmark" href="#" data-action="home"><span class="brand-mark">g.</span><span>gabriela<span class="wordmark-sub">ESTÉTICA & BIENESTAR</span></span></a><span class="sidebar-caption">MI ESPACIO</span><nav aria-label="Navegación principal">${nav('agenda', 'Mi agenda', 'calendar')}${nav('clients', 'Clientes', 'people')}${nav('settings', 'Configuración', 'settings')}</nav><div class="sidebar-note">${icon('leaf')}<p>Cada detalle cuenta.</p><span>Un espacio para cuidar,<br>acompañar y recordar.</span></div><div class="owner"><span class="avatar">G</span><div><strong>${esc(profile.name || 'Gabriela')}</strong><span>Mi cuenta privada</span></div><button class="icon-button" data-action="logout" aria-label="Cerrar sesión">${icon('logout')}</button></div></aside><main class="workspace"><header class="topbar"><span>Mi espacio <span class="breadcrumb">/</span> ${view === 'agenda' ? 'Agenda' : view === 'clients' ? 'Clientes' : 'Configuración'}</span><span class="topbar-date">${dateLabel(today(zone()))}<span class="tiny-avatar">G</span></span></header>${demo ? '<div class="demo-banner">Demostración · Datos ficticios. Los cambios están deshabilitados. <button data-action="logout">Volver al ingreso</button></div>' : ''}<div class="content">${busy ? '<div class="loading" role="status">Cargando tu agenda…</div>' : view === 'agenda' ? renderAgenda() : view === 'clients' ? renderClients() : renderSettings()}</div><footer>Hecho para acompañar tu día.<span>Gabriela · Estética & bienestar</span></footer></main></div>`;
}

function renderAgenda() {
  const sessions = entries.filter(e => e.kind === 'session' && e.sessionStatus !== 'canceled');
  const pending = sessions.filter(e => e.sessionStatus === 'pending').length;
  const minutes = sessions.reduce((sum, e) => sum + (Date.parse(e.endAt) - Date.parse(e.startAt)) / 60000, 0);
  const shown = entries.filter(e => e.kind === 'block' ? e.source === 'google' || e.blockActive : filter === 'all' || e.sessionStatus === filter);
  const start = addDays(date, 1 - weekday(date));
  return `<section class="page-heading"><div><span class="eyebrow">UN DÍA A LA VEZ</span><h1>Tu agenda${date === today(zone()) ? ', hoy' : ''}<span class="heading-dot">.</span></h1><p>Todo listo para dedicarte a lo que más te gusta.</p></div>${button('new-session', `${icon('plus')} Nuevo turno`, 'primary')}</section><section class="stats"><div class="stat"><span class="stat-icon sage">${icon('calendar')}</span><div><span>Turnos ${mode === 'day' ? 'del día' : 'de la semana'}</span><strong>${sessions.length}<small> sesiones agendadas</small></strong></div></div><div class="stat"><span class="stat-icon peach">${icon('clock')}</span><div><span>Por confirmar</span><strong>${pending}<small> ${pending === 1 ? 'turno pendiente' : 'turnos pendientes'}</small></strong></div></div><div class="stat"><span class="stat-icon cream">${icon('people')}</span><div><span>Tiempo de atención</span><strong>${Math.floor(minutes / 60)}<small> h ${Math.round(minutes % 60)} min</small></strong></div></div></section><div class="agenda-layout"><section class="panel agenda-panel"><div class="agenda-toolbar"><div class="date-navigation">${button('prev', '‹', 'icon-button', '')}<h2>${mode === 'day' ? dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' }) : `${dateLabel(start, { day: 'numeric', month: 'short' })} – ${dateLabel(addDays(start, 6), { day: 'numeric', month: 'short' })}`}</h2>${button('next', '›', 'icon-button')}${button('today', 'Hoy', 'small-button')}</div><div class="segmented">${button('day', 'Día', mode === 'day' ? 'selected' : '')}${button('week', 'Semana', mode === 'week' ? 'selected' : '')}</div></div><div class="agenda-subtoolbar"><span>${mode === 'day' ? dateLabel(date, { weekday: 'long' }) : 'Vista semanal'}<span class="muted"> · ${esc(zone())}</span></span><label class="inline-label">Estado<select id="status-filter" aria-label="Filtrar turnos por estado"><option value="all">Todos los turnos</option>${Object.entries(statusLabels).map(([id, label]) => `<option value="${id}" ${filter === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>${mode === 'day' ? `<div class="timeline">${shown.length ? shown.map(renderEntry).join('') : empty('Un poco de espacio para vos', 'No hay turnos para esta fecha y este filtro.', button('new-session', 'Agendar un turno', 'secondary'))}</div>` : `<div class="week-grid">${Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); const list = shown.filter(e => localDay(e.startAt, zone()) === d); return `<section class="week-day ${d === today(zone()) ? 'is-today' : ''}"><button class="week-date" data-action="pick-date" data-id="${d}"><span>${dateLabel(d, { weekday: 'short' })}</span><strong>${dateLabel(d, { day: 'numeric' })}</strong></button>${list.length ? list.map(e => `<button class="week-entry ${e.kind === 'block' ? 'block' : e.sessionStatus}" data-action="entry" data-id="${e.id}"><span>${clock(e.startAt, zone())}</span><strong>${esc(e.clientName || 'Horario bloqueado')}</strong><small>${esc(e.projectTitle || e.blockReason)}</small></button>`).join('') : '<span class="week-empty">Sin turnos</span>'}</section>`; }).join('')}</div>`}<div class="panel-bottom"><span><i class="legend-dot"></i> Confirmado <i class="legend-dot pending"></i> Por confirmar <i class="legend-dot block"></i> Bloqueado</span>${button('new-block', '+ Bloquear horario', 'text-button')}</div></section><aside class="agenda-aside"><section class="panel calendar-panel">${renderCalendar()}</section><section class="availability-card"><span class="eyebrow">ESPACIO DISPONIBLE</span><h3>¿Un nuevo turno?</h3><p>${free.length ? 'Estos horarios están libres en el día seleccionado.' : 'No hay intervalos libres para este día. Podés revisar tus horarios de atención.'}</p>${free.map(f => `<button class="free-slot" data-action="slot" data-id="${clock(f.startAt, zone())}">${icon('clock')} ${clock(f.startAt, zone())} – ${clock(f.endAt, zone())} ${icon('plus')}</button>`).join('')}<small>Los turnos incluyen los márgenes de preparación y limpieza.</small></section></aside></div>`;
}

function renderEntry(entry: Entry) {
  return `<div class="timeline-row"><div class="time-label"><strong>${entry.allDay ? 'Todo' : clock(entry.startAt, zone())}</strong><span>${entry.allDay ? 'el día' : clock(entry.endAt, zone())}</span></div><button class="appointment ${entry.kind === 'block' ? 'block' : entry.sessionStatus}" data-action="entry" data-id="${entry.id}"><div class="appointment-main"><span class="avatar ${entry.kind === 'block' ? 'block-avatar' : ''}">${entry.kind === 'block' ? icon('calendar') : esc(initials(entry.clientName || 'Cliente'))}</span><div><h3>${esc(entry.clientName || entry.googleTitle || 'Horario bloqueado')}</h3><p>${esc(entry.projectTitle || entry.blockReason || entry.description)}${entry.source === 'google' ? entry.projectId ? ' · Google Calendar' : ' · Sin vincular' : ''}</p>${entry.hasLocalConflict ? '<small class="conflict-note">Se superpone con un turno local</small>' : ''}</div></div><div class="appointment-side">${badge(entry)}<span>${entry.allDay ? 'Día completo' : `${Math.round((Date.parse(entry.endAt) - Date.parse(entry.startAt)) / 60000)} min`} ${icon('arrow')}</span></div></button></div>`;
}

function renderCalendar() {
  const first = `${date.slice(0, 7)}-01`;
  const offset = weekday(first) - 1;
  const days = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  return `<div class="mini-heading"><h3>${dateLabel(date, { month: 'long', year: 'numeric' })}</h3>${icon('calendar')}</div><div class="mini-calendar">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="mini-weekday">${d}</span>`).join('')}${Array.from({ length: offset }, () => '<span></span>').join('')}${Array.from({ length: days }, (_, i) => { const d = `${date.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`; return `<button class="${d === date ? 'chosen' : ''} ${d === today(zone()) ? 'today' : ''}" data-action="pick-date" data-id="${d}" aria-label="${dateLabel(d)}" ${d === date ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${i + 1}</button>`; }).join('')}</div><label class="date-input-label">Ir a una fecha<input id="date-picker" type="date" value="${date}" aria-label="Elegir fecha de la agenda"></label>`;
}

function renderClients() {
  if (selectedClient) return renderClientDetail();
  const query = search.toLocaleLowerCase('es-AR');
  const list = clients.filter(c => [c.name, c.phone, c.email].some(v => v?.toLocaleLowerCase('es-AR').includes(query)));
  return `<section class="page-heading"><div><span class="eyebrow">PERSONAS, HISTORIAS Y CUIDADOS</span><h1>Tus clientes<span class="heading-dot">.</span></h1><p>Recordá cada detalle y acompañá cada tratamiento.</p></div>${button('new-client', `${icon('plus')} Nuevo cliente`, 'primary')}</section><section class="panel"><div class="client-toolbar"><h2>Todos los clientes <span class="count">${clients.length}</span></h2><label class="search-field">${icon('search')}<input id="client-search" type="search" placeholder="Buscar nombre, teléfono o correo" value="${esc(search)}" aria-label="Buscar clientes"></label></div><div id="client-list">${renderClientRows(list)}</div></section>`;
}

function renderClientRows(list: Client[]) {
  return list.length ? `<div class="client-table"><div class="table-head"><span>CLIENTE</span><span>CONTACTO</span><span>NOTAS</span><span></span></div>${list.map(c => `<button class="client-row" data-action="client" data-id="${c.id}"><span class="client-name"><span class="avatar">${esc(initials(c.name))}</span><strong>${esc(c.name)}</strong></span><span class="contact-cell">${esc(c.phone || 'Sin teléfono')}<small>${esc(c.email || 'Sin correo')}</small></span><span class="note-cell">${esc(c.shortNote || 'Sin notas todavía')}</span>${icon('arrow')}</button>`).join('')}</div>` : empty('Todavía no hay clientes para mostrar', search ? 'Probá con otro nombre o dato de contacto.' : 'Agregá tu primer cliente y empezá a construir su historial.', button('new-client', 'Agregar cliente', 'secondary'));
}

function renderClientDetail() {
  const c = selectedClient!;
  const history = projects.flatMap(p => (p.sessions || []).map(e => ({ ...e, projectTitle: p.title }))).sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
  return `${button('back-clients', '‹ Todos los clientes', 'text-button')}<section class="page-heading detail-heading"><div class="detail-title"><span class="avatar large">${esc(initials(c.name))}</span><div><span class="eyebrow">FICHA DE CLIENTE</span><h1>${esc(c.name)}</h1><p>Su historia, siempre a mano.</p></div></div>${button('new-session', `${icon('plus')} Agendar turno`, 'primary')}</section><div class="client-detail-grid"><aside><section class="panel detail-card"><div class="mini-heading"><h3>Datos de contacto</h3>${button('edit-client', 'Editar', 'text-button')}</div><dl><dt>Teléfono</dt><dd>${esc(c.phone || 'Sin teléfono')}</dd><dt>Correo electrónico</dt><dd>${esc(c.email || 'Sin correo')}</dd><dt>Notas de seguimiento</dt><dd class="preserve-lines">${esc(c.shortNote || 'Registrá preferencias y detalles relevantes para su atención.')}</dd></dl></section></aside><div><section class="panel treatment-panel"><div class="client-toolbar"><h2>Tratamientos <span class="count">${projects.length}</span></h2>${button('new-project', '+ Nuevo tratamiento', 'text-button')}</div>${projects.length ? projects.map(p => `<article class="treatment"><div><h3>${esc(p.title)}${p.archivedAt ? ' <span class="badge block">Archivado</span>' : ''}</h3><p class="preserve-lines">${esc(p.briefDescription || 'Sin notas de seguimiento')}</p><small>${(p.sessions || []).filter(e => e.sessionStatus === 'done').length} sesiones realizadas · ${(p.sessions || []).length} en total</small></div>${p.archivedAt ? '' : button('edit-project', 'Editar notas', 'small-button', p.id)}</article>`).join('') : empty('Un seguimiento que empieza acá', 'Creá un tratamiento para vincular sus sesiones.', button('new-project', 'Nuevo tratamiento', 'secondary'))}</section><section class="panel history-panel"><div class="client-toolbar"><h2>Historial de turnos</h2><span class="muted">${history.length} sesiones</span></div>${history.length ? history.map(e => `<button class="history-row" data-action="history-entry" data-id="${e.id}"><div class="history-date"><strong>${dateLabel(localDay(e.startAt, zone()), { day: 'numeric', month: 'short' })}</strong><span>${dateLabel(localDay(e.startAt, zone()), { year: 'numeric' })} · ${clock(e.startAt, zone())}</span></div><div><strong>${esc(e.projectTitle)}</strong><p>${esc(e.description)}</p></div>${badge(e)}</button>`).join('') : empty('Cada sesión forma parte de su historia', 'Los turnos de este cliente aparecerán acá.')}</section></div></div>`;
}

function renderSettings() { return renderSettingsBody() + renderGooglePanel(); }

function renderSettingsBody() {
  return `<section class="page-heading"><div><span class="eyebrow">A TU RITMO</span><h1>Tu espacio, tus tiempos<span class="heading-dot">.</span></h1><p>Organizá tus horarios y los minutos entre cada atención.</p></div></section><div class="settings-grid"><section class="panel detail-card"><h2>Agenda</h2><dl><dt>Zona horaria</dt><dd>${esc(zone())}</dd><dt>Preparación por turno</dt><dd>${settings.defaultPrepMinutes} minutos</dd><dt>Limpieza por turno</dt><dd>${settings.defaultCleanupMinutes} minutos</dd></dl>${button('edit-settings', 'Editar márgenes', 'secondary')}</section><section class="panel detail-card"><div class="mini-heading"><h2>Horarios de atención</h2>${button('edit-windows', 'Configurar', 'secondary')}</div><p class="muted">Horarios vigentes y futuros. Los turnos se reservan dentro de estas franjas.</p>${settings.windows.filter(w => !w.validTo || w.validTo >= today(zone())).map(w => `<div class="working-row"><strong>${['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][w.weekday]}</strong><span>${w.localStart} – ${w.localEnd}<small>Desde ${esc(w.validFrom)}${w.validTo ? ` hasta ${esc(w.validTo)}` : ''}</small></span></div>`).join('') || '<p>No hay horarios configurados. Agregalos para poder reservar turnos.</p>'}</section></div>`;
}

function renderGooglePanel() {
  const s = google?.source;
  return `<section class="panel detail-card google-panel"><div class="mini-heading"><h2>Google Calendar</h2><span class="badge">${s?.enabled && google?.sourceReadEnabled && !google.needsReconnect ? 'Calendario vinculado' : 'Sin conexión activa'}</span></div><p class="muted">Usá tu calendario como base de los horarios. Los eventos se importan y se vinculan manualmente a clientes y tratamientos. Los cambios de horario se realizan en Google Calendar.</p>${demo ? '<p class="field-hint">La conexión está disponible al ingresar con tu cuenta.</p>' : !google?.configured ? '<p class="form-error">La conexión con Google todavía no está configurada. Falta preparar las credenciales OAuth de la aplicación.</p>' : `<div class="google-actions">${button('google-connect', google.sourceReadEnabled && !google.needsReconnect ? 'Reconectar Google' : 'Conectar Google Calendar', 'primary')}${google.sourceReadEnabled && !google.needsReconnect ? button('google-select', s ? 'Cambiar calendario' : 'Elegir calendario', 'secondary') : ''}${s && google.sourceReadEnabled && !google.needsReconnect ? button('google-sync', 'Sincronizar ahora', 'secondary') : ''}</div>${google.googleEmail ? `<p class="field-hint">Cuenta: ${esc(google.googleEmail)}</p>` : ''}`}${s ? `<dl><dt>Calendario de origen</dt><dd>${esc(s.name)}</dd><dt>Última lectura completa</dt><dd>${s.lastSyncedAt ? `${dateLabel(localDay(s.lastSyncedAt, zone()))} · ${clock(s.lastSyncedAt, zone())}` : 'Pendiente de la primera importación'}</dd><dt>Eventos importados</dt><dd>${google?.importedEvents || 0} · ${google?.unlinkedEvents || 0} sin vincular</dd><dt>Período importado</dt><dd>${dateLabel(localDay(s.rangeFrom, zone()), { month: 'short', year: 'numeric' })} – ${dateLabel(localDay(s.rangeTo, zone()), { month: 'short', year: 'numeric' })}</dd></dl>${s.fullSync ? '<p class="field-hint">La importación inicial está en curso. Volvé a consultar el estado para ver su progreso.</p>' : ''}${s.lastError || google?.needsReconnect ? '<p class="form-error">La lectura no pudo completarse. Los datos anteriores se conservan. Reconectá Google si cambió la autorización o solicitá otro intento.</p>' : ''}` : ''}${!demo ? button('google-status', 'Actualizar estado', 'text-button') : ''}</section>`;
}

function openForm(title: string, subtitle: string, fields: string, save: (data: FormData, key: string) => Promise<void>, label = 'Guardar') {
  modal.innerHTML = `<form id="modal-form"><header class="modal-header"><div><span class="eyebrow">MI ESPACIO</span><h2 id="modal-title">${title}</h2></div>${button('close', '×', 'icon-button')}</header><p class="modal-subtitle">${subtitle}</p><div class="form-fields">${fields}</div><p class="form-error" role="alert"></p><div class="modal-footer">${button('close', 'Volver', 'secondary')}<button class="primary" type="submit">${label}</button></div></form>`;
  modal.showModal();
  const form = modal.querySelector<HTMLFormElement>('form')!;
  let previousBody = ''; let key = requestKey();
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (submit.disabled) return;
    if (demo) { form.querySelector('.form-error')!.textContent = 'Esta es una demostración con datos ficticios. Ingresá con tu cuenta para guardar cambios.'; return; }
    const data = new FormData(form);
    const body = JSON.stringify(Array.from(data.entries()));
    if (body !== previousBody) { key = requestKey(); previousBody = body; }
    submit.disabled = true; submit.textContent = 'Guardando…';
    try { await save(data, key); modal.close(); await refresh(); notify('Los cambios se guardaron.'); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) fail(error);
      else form.querySelector('.form-error')!.textContent = error instanceof Error ? error.message : 'No pudimos guardar los cambios.';
    } finally { submit.disabled = false; submit.textContent = label; }
  };
}

const field = (label: string, name: string, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const textarea = (label: string, name: string, value = '', required = false) => `<label>${label}<textarea name="${name}" rows="4" maxlength="2000" ${required ? 'required' : ''}>${esc(value)}</textarea></label>`;
const text = (data: FormData, name: string) => String(data.get(name) || '').trim();

function clientForm(edit = false) {
  const c = edit ? selectedClient : null;
  openForm(edit ? 'Editar ficha de cliente' : 'Un nuevo cliente', 'Guardá sus datos de contacto y los detalles que querés recordar.', `${field('Nombre completo', 'name', c?.name, 'text', 'required maxlength="160" autocomplete="name"')}<div class="form-two">${field('Teléfono', 'phone', c?.phone || '', 'tel', 'maxlength="60" autocomplete="tel"')}${field('Correo electrónico', 'email', c?.email || '', 'email', 'maxlength="254" autocomplete="email"')}</div><p class="field-hint">Completá al menos teléfono o correo electrónico.</p>${textarea('Notas de seguimiento', 'shortNote', c?.shortNote || '')}`, async (data, key) => {
    if (!text(data, 'phone') && !text(data, 'email')) throw new Error('Agregá al menos un teléfono o correo electrónico.');
    const values = { name: text(data, 'name'), phone: text(data, 'phone') || (c ? null : undefined), email: text(data, 'email') || (c ? null : undefined), shortNote: text(data, 'shortNote') || null };
    const saved = await api<Client>(c ? `clients/${c.id}` : 'clients', c ? 'PATCH' : 'POST', { ...values, ...(c ? { version: c.version } : {}) }, key);
    selectedClient = saved; view = 'clients';
  });
}

function projectForm(id?: string) {
  const p = projects.find(item => item.id === id);
  openForm(p ? 'Notas del tratamiento' : 'Nuevo tratamiento', `Seguimiento de ${esc(selectedClient!.name)}. Cada turno se vincula a un tratamiento.`, `${field('Nombre del tratamiento', 'title', p?.title, 'text', 'required maxlength="160"')}${textarea('Descripción y notas de seguimiento', 'briefDescription', p?.briefDescription || '')}`, async (data, key) => {
    await api(p ? `projects/${p.id}` : 'projects', p ? 'PATCH' : 'POST', { title: text(data, 'title'), briefDescription: text(data, 'briefDescription') || null, ...(p ? { version: p.version } : { clientId: selectedClient!.id }) }, key);
  });
}

async function sessionForm(time = '09:00') {
  if (!clients.length) { notify('Primero agregá un cliente para vincular su turno.'); view = 'clients'; render(); clientForm(); return; }
  openForm('Agendar un turno', 'Elegí el cliente, su tratamiento y el horario de atención.', `<label>Cliente<select name="clientId" required><option value="">Elegir un cliente</option>${clients.map(c => `<option value="${c.id}" ${c.id === selectedClient?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label>Tratamiento<select name="projectId" required disabled><option value="">Elegí primero un cliente</option></select></label><p id="project-hint" class="field-hint"></p><div class="form-two">${field('Fecha', 'date', date, 'date', `required min="${today(zone())}"`)}${field('Hora de inicio', 'time', time, 'time', 'required')}</div>${field('Duración (minutos)', 'duration', '60', 'number', 'required min="5" max="720" step="5"')}<p class="field-hint">Horario en ${esc(zone())}. Se reservan además ${settings.defaultPrepMinutes} min de preparación y ${settings.defaultCleanupMinutes} min de limpieza.</p>${textarea('Descripción de la sesión', 'description', '', true)}`, async (data, key) => {
    const startAt = instant(text(data, 'date'), text(data, 'time'), zone());
    const endAt = new Date(Date.parse(startAt) + Number(data.get('duration')) * 60000).toISOString();
    await api('sessions', 'POST', { projectId: text(data, 'projectId'), description: text(data, 'description'), startAt, endAt }, key);
    date = text(data, 'date');
  }, 'Agendar turno');
  const select = modal.querySelector<HTMLSelectElement>('[name="clientId"]')!;
  let request = 0;
  const update = async () => {
    const sequence = ++request;
    const id = select.value;
    const target = modal.querySelector<HTMLSelectElement>('[name="projectId"]')!;
    const hint = modal.querySelector('#project-hint')!;
    target.disabled = true; target.innerHTML = '<option value="">Cargando tratamientos…</option>'; hint.textContent = '';
    try {
      const records = id ? demo ? demoProjects.filter(p => p.clientId === id) : await allPages<Project>(`clients/${id}/projects`) : [];
      if (sequence !== request || !modal.open) return;
      target.innerHTML = '<option value="">Elegir un tratamiento</option>' + records.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join(''); target.disabled = !records.length;
      if (id && !records.length) hint.textContent = 'Este cliente todavía no tiene tratamientos. Creá uno desde su ficha antes de agendar.';
    } catch (error) { if (sequence === request) { hint.textContent = error instanceof Error ? error.message : 'Error al cargar tratamientos.'; } }
  };
  select.onchange = () => void update();
  if (select.value) await update();
}

function blockForm() {
  openForm('Reservar un espacio para vos', 'Bloqueá un horario para descansos u otras actividades.', `<div class="form-two">${field('Fecha', 'date', date, 'date', 'required')}${field('Hora de inicio', 'time', '13:00', 'time', 'required')}</div>${field('Duración (minutos)', 'duration', '60', 'number', 'required min="5" max="1440" step="5"')}${textarea('Motivo del bloqueo', 'reason', '', true)}`, async (data, key) => {
    const startAt = instant(text(data, 'date'), text(data, 'time'), zone());
    await api('blocks', 'POST', { startAt, endAt: new Date(Date.parse(startAt) + Number(data.get('duration')) * 60000).toISOString(), reason: text(data, 'reason') }, key);
    date = text(data, 'date');
  }, 'Bloquear horario');
}

async function entryDetail(id: string, history = false) {
  const cached = history ? projects.flatMap(p => (p.sessions || []).map(e => ({ ...e, projectTitle: p.title, clientName: selectedClient?.name, clientId: selectedClient?.id }))).find(e => e.id === id) : entries.find(e => e.id === id);
  if (!cached) return;
  const entry = demo ? cached : { ...cached, ...await api<Entry>(cached.source === 'google' ? `integrations/google/events/${id}` : `${cached.kind === 'block' ? 'blocks' : 'sessions'}/${id}`) };
  if (entry.source === 'google') {
    modal.innerHTML = `<header class="modal-header"><div><span class="eyebrow">GOOGLE CALENDAR</span><h2 id="modal-title">${esc(entry.googleTitle || 'Evento importado')}</h2></div>${button('close', '×', 'icon-button')}</header><div class="entry-detail">${badge(entry)}<p>${dateLabel(localDay(entry.startAt, zone()))}<br>${entry.allDay ? 'Todo el día' : `${clock(entry.startAt, zone())} – ${clock(entry.endAt, zone())}`}</p><p class="preserve-lines">${esc(entry.description)}</p><p>${entry.clientName ? `${esc(entry.clientName)} · ${esc(entry.projectTitle)}` : 'Este evento todavía no está vinculado a un cliente.'}</p>${entry.hasLocalConflict ? '<p class="form-error">Se superpone con un turno local. Revisá ambos horarios.</p>' : ''}<p class="field-hint">El horario y las cancelaciones se actualizan desde Google Calendar.</p>${entry.clientId ? button('entry-client', 'Ver ficha del cliente →', 'text-button', entry.clientId) : ''}</div><div class="entry-actions">${button('google-link', entry.projectId ? 'Cambiar vínculo' : 'Vincular cliente y tratamiento', 'primary')}${entry.projectId ? button('google-unlink', 'Quitar vínculo', 'secondary') : ''}</div>`;
    modal.showModal();
    modal.querySelector('[data-action="google-link"]')!.addEventListener('click', () => { modal.close(); void googleLinkForm(entry).catch(fail); });
    modal.querySelector('[data-action="google-unlink"]')?.addEventListener('click', () => {
      modal.close(); openForm('Quitar vínculo del cliente', 'El evento seguirá disponible en la agenda de Google.', '<p>El turno dejará de aparecer en el historial de este tratamiento.</p>', async (_, key) => { await api(`integrations/google/events/${entry.id}/link`, 'POST', { version: entry.version, projectId: null }, key); });
    });
    return;
  }
  const ended = Date.parse(entry.endAt) <= Date.now();
  const upcoming = entry.sessionStatus === 'pending' || entry.sessionStatus === 'confirmed';
  modal.innerHTML = `<header class="modal-header"><div><span class="eyebrow">${entry.kind === 'block' ? 'MI TIEMPO' : 'DETALLE DEL TURNO'}</span><h2 id="modal-title">${esc(entry.clientName || 'Horario bloqueado')}</h2></div>${button('close', '×', 'icon-button')}</header><div class="entry-detail">${badge(entry)}<h3>${esc(entry.projectTitle || entry.blockReason)}</h3><p>${dateLabel(localDay(entry.startAt, zone()))}<br>${clock(entry.startAt, zone())} – ${clock(entry.endAt, zone())}</p><p class="preserve-lines">${esc(entry.description || entry.blockReason)}</p>${entry.clientId ? button('entry-client', 'Ver ficha del cliente →', 'text-button', entry.clientId) : ''}</div><div class="entry-actions">${entry.sessionStatus === 'pending' ? button('confirm', `${icon('check')} Confirmar turno`, 'primary') : ''}${entry.sessionStatus === 'confirmed' && ended ? button('complete', 'Marcar como realizado', 'primary') + button('absent', 'No asistió', 'secondary') : ''}${upcoming ? button('reschedule', 'Reprogramar', 'secondary') + button('cancel', 'Cancelar turno', 'danger-button') : ''}${entry.kind === 'block' && entry.blockActive ? button('unblock', 'Liberar horario', 'secondary') : ''}</div>`;
  modal.showModal();
  modal.querySelectorAll<HTMLButtonElement>('.entry-actions button').forEach(b => b.onclick = () => {
    const action = b.dataset.action!;
    modal.close();
    if (action === 'reschedule') {
      openForm('Reprogramar turno', 'Elegí un nuevo horario y registrá el motivo del cambio.', `<div class="form-two">${field('Fecha', 'date', localDay(entry.startAt, zone()), 'date', `required min="${today(zone())}"`)}${field('Hora', 'time', clock(entry.startAt, zone()), 'time', 'required')}</div>${field('Duración (minutos)', 'duration', String(Math.round((Date.parse(entry.endAt) - Date.parse(entry.startAt)) / 60000)), 'number', 'required min="5" max="720" step="5"')}${textarea('Motivo', 'reason', '', true)}`, async (data, key) => {
        const startAt = instant(text(data, 'date'), text(data, 'time'), zone());
        await api(`sessions/${id}/reschedule`, 'POST', { version: entry.version, reason: text(data, 'reason'), startAt, endAt: new Date(Date.parse(startAt) + Number(data.get('duration')) * 60000).toISOString() }, key);
        date = text(data, 'date');
      });
    } else {
      const labels: Record<string, string> = { confirm: 'Confirmar turno', complete: 'Registrar sesión realizada', absent: 'Registrar inasistencia', cancel: 'Cancelar turno', unblock: 'Liberar horario' };
      openForm(labels[action], `${esc(entry.clientName || 'Horario bloqueado')} · ${dateLabel(localDay(entry.startAt, zone()))} · ${clock(entry.startAt, zone())}`, action === 'cancel' ? textarea('Motivo de cancelación', 'reason', '', true) : '<p>El cambio quedará registrado en la agenda.</p>', async (data, key) => {
        await api(entry.kind === 'block' ? `blocks/${id}` : `sessions/${id}/${action}`, entry.kind === 'block' ? 'PATCH' : 'POST', entry.kind === 'block' ? { version: entry.version, startAt: entry.startAt, endAt: entry.endAt, reason: entry.blockReason, active: false } : { version: entry.version, ...(action === 'cancel' ? { reason: text(data, 'reason') } : {}) }, key);
      }, labels[action]);
    }
  });
}

function settingsForm() {
  openForm('Tiempo entre sesiones', 'Los nuevos márgenes se aplican a los próximos turnos que agendes.', `<div class="form-two">${field('Preparación (minutos)', 'prep', String(settings.defaultPrepMinutes), 'number', 'required min="0" max="240"')}${field('Limpieza (minutos)', 'cleanup', String(settings.defaultCleanupMinutes), 'number', 'required min="0" max="240"')}</div>`, async (data, key) => {
    await api('agenda/settings', 'PATCH', { version: settings.version, defaultPrepMinutes: Number(data.get('prep')), defaultCleanupMinutes: Number(data.get('cleanup')) }, key);
  });
}

async function googleLinkForm(entry: Entry) {
  if (!clients.length) { notify('Primero registrá al cliente y su tratamiento desde Clientes.'); return; }
  openForm('Vincular evento de Google', `${esc(entry.googleTitle)} · Conservaremos sus datos de horario.`, `<label>Cliente<select name="clientId" required><option value="">Elegir cliente</option>${clients.map(c => `<option value="${c.id}" ${entry.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label>Tratamiento<select name="projectId" required disabled><option value="">Elegí primero un cliente</option></select></label><p id="google-link-hint" class="field-hint">El evento aparecerá en el historial del tratamiento elegido.</p>`, async (data, key) => {
    await api(`integrations/google/events/${entry.id}/link`, 'POST', { projectId: text(data, 'projectId'), version: entry.version }, key);
  }, 'Vincular evento');
  const select = modal.querySelector<HTMLSelectElement>('[name="clientId"]')!;
  let request = 0;
  const update = async () => {
    const sequence = ++request; const id = select.value;
    const target = modal.querySelector<HTMLSelectElement>('[name="projectId"]')!;
    target.disabled = true; target.innerHTML = '<option value="">Cargando tratamientos…</option>';
    try {
      const rows = id ? await allPages<Project>(`clients/${id}/projects`) : [];
      if (sequence !== request || !modal.open) return;
      target.innerHTML = '<option value="">Elegir tratamiento</option>' + rows.map(p => `<option value="${p.id}" ${entry.projectId === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
      target.disabled = !rows.length;
      modal.querySelector('#google-link-hint')!.textContent = id && !rows.length ? 'Creá primero un tratamiento para este cliente desde su ficha.' : 'El evento aparecerá en el historial del tratamiento elegido.';
    } catch (error) { if (sequence === request) modal.querySelector('#google-link-hint')!.textContent = error instanceof Error ? error.message : 'No se pudieron cargar los tratamientos.'; }
  };
  select.onchange = () => void update(); if (select.value) await update();
}

async function googleSelectForm() {
  const calendars = await api<{ id: string; name: string; timezone: string; primary: boolean }[]>('integrations/google/calendars');
  if (!calendars.length) { notify('No encontramos calendarios con permiso de lectura.'); return; }
  openForm('Elegir calendario de origen', 'Importaremos los últimos cinco años y los próximos dos años. El período futuro se amplía automáticamente.', `<label>Calendario<select name="calendarId" required>${calendars.map(c => `<option value="${esc(c.id)}" ${google?.source?.calendarId === c.id ? 'selected' : ''}>${esc(c.name)}${c.primary ? ' · Principal' : ''}</option>`).join('')}</select></label><p class="field-hint">Si cambiás el calendario, la agenda mostrará el nuevo origen. Se conserva el historial que ya vinculaste a clientes.</p>`, async (data, key) => { await api('integrations/google/source', 'POST', { calendarId: text(data, 'calendarId') }, key); }, 'Usar este calendario');
}

function windowsForm() {
  const current = settings.windows.filter(w => !w.validTo || w.validTo >= today(zone()));
  const row = (w: Settings['windows'][number]) => `<div class="window-row"><label>Día<select name="weekday">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d, i) => `<option value="${i + 1}" ${w.weekday === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>${field('Desde', 'start', w.localStart, 'time', 'required')}${field('Hasta', 'end', w.localEnd, 'time', 'required')}${field('Vigente desde', 'validFrom', w.validFrom < today(zone()) ? today(zone()) : w.validFrom, 'date', `required min="${today(zone())}"`)}${field('Vigente hasta', 'validTo', w.validTo || '', 'date', `min="${today(zone())}"`)}${button('remove-window', '×', 'icon-button')}</div>`;
  openForm('Horarios de atención', 'Esta lista reemplaza las franjas vigentes y futuras. Se conserva el historial y se validan los turnos ya reservados.', `<div id="windows-list">${current.map(row).join('')}</div>${button('add-window', '+ Agregar franja', 'secondary')}<p class="field-hint">Podés agregar varias franjas por día. Dejá la fecha final vacía para que no tenga vencimiento.</p>`, async (data, key) => {
    const days = data.getAll('weekday'); const starts = data.getAll('start'); const ends = data.getAll('end'); const from = data.getAll('validFrom'); const to = data.getAll('validTo');
    const windows = days.map((day, i) => ({ weekday: Number(day), localStart: String(starts[i]), localEnd: String(ends[i]), validFrom: String(from[i]), ...(to[i] ? { validTo: String(to[i]) } : {}) }));
    if (windows.some(w => w.localStart >= w.localEnd)) throw new Error('Cada franja debe terminar después de su hora de inicio.');
    await api('agenda/working-windows', 'POST', { version: settings.version, windows }, key);
  });
  modal.querySelector('[data-action="add-window"]')!.addEventListener('click', () => modal.querySelector('#windows-list')!.insertAdjacentHTML('beforeend', row({ weekday: 1, localStart: '09:00', localEnd: '18:00', validFrom: today(zone()) })));
}

function startDemo() {
  google = null;
  demo = true; profile = { name: 'Gabriela', email: 'demo@example.test' }; date = today(zoneDefault); view = 'agenda'; mode = 'day'; selectedClient = null;
  settings = { timezone: zoneDefault, version: 1, defaultPrepMinutes: 10, defaultCleanupMinutes: 10, windows: [1, 2, 3, 4, 5].map(weekday => ({ weekday, localStart: '09:00', localEnd: '18:00', validFrom: date })) };
  clients = [
    { id: 'demo-1', name: 'Lucía Martínez', phone: '+54 11 5555 0101', email: 'lucia@example.test', shortNote: 'Prefiere los turnos por la mañana. Piel sensible: revisar evolución en cada sesión.', version: 1 },
    { id: 'demo-2', name: 'Carolina López', phone: '+54 11 5555 0102', email: 'carolina@example.test', shortNote: 'Seguimiento mensual de su rutina de cuidado facial.', version: 1 },
    { id: 'demo-3', name: 'Valentina García', phone: '+54 11 5555 0103', email: null, shortNote: 'Consultar cómo se sintió después de la sesión anterior.', version: 1 },
    { id: 'demo-4', name: 'María Fernández', phone: '+54 11 5555 0104', email: null, shortNote: null, version: 1 },
  ];
  const titles = ['Limpieza facial profunda', 'Tratamiento hidratante', 'Masajes relajantes', 'Cuidado facial integral'];
  const times = ['09:00', '10:30', '12:00', '14:00'];
  demoEntries = clients.map((c, i) => ({ id: `turno-${i}`, kind: 'session', startAt: instant(date, times[i], zone()), endAt: new Date(Date.parse(instant(date, times[i], zone())) + 60 * 60000).toISOString(), projectId: `project-${i}`, projectTitle: titles[i], clientId: c.id, clientName: c.name, description: 'Sesión de seguimiento y evaluación del tratamiento.', sessionStatus: i === 1 ? 'pending' : 'confirmed', version: 1 }));
  demoEntries.push({ id: 'block-demo', kind: 'block', startAt: instant(date, '15:10', zone()), endAt: instant(date, '16:00', zone()), blockReason: 'Un momento para recargar energías', blockActive: true, version: 1 });
  demoProjects = clients.map((c, i) => ({ id: `project-${i}`, clientId: c.id, title: titles[i], briefDescription: 'Acompañar la evolución y registrar los cuidados recomendados después de cada sesión.', version: 1, sessions: [demoEntries[i], { ...demoEntries[i], id: `past-${i}`, startAt: instant(addDays(date, -14), times[i], zone()), endAt: new Date(Date.parse(instant(addDays(date, -14), times[i], zone())) + 60 * 60000).toISOString(), sessionStatus: 'done' }] }));
  void refresh();
}

async function action(name: string, id = '') {
  if (name === 'close') { modal.close(); return; }
  if (name === 'retry') { await refresh(); return; }
  if (name === 'google-connect') {
    if (demo) return;
    const result = await api<{ authorizationUrl: string }>('integrations/google/connect', 'POST', {});
    window.location.assign(result.authorizationUrl); return;
  }
  if (name === 'google-select') { await googleSelectForm(); return; }
  if (name === 'google-sync') { await api('integrations/google/import', 'POST', {}); await refresh(); notify('La lectura del calendario quedó en cola.'); return; }
  if (name === 'google-status') { await refresh(); return; }
  if (name === 'remove-window') return;
  if (name === 'demo') { startDemo(); return; }
  if (name === 'logout') {
    if (!demo) await api('auth/logout', 'POST', {});
    loadSequence++; profile = null; demo = false; clients = []; entries = []; projects = []; selectedClient = null; google = null; view = 'agenda'; busy = false; modal.close(); renderLogin(); return;
  }
  if (name === 'home') { view = 'agenda'; render(); }
  if (name === 'prev' || name === 'next') { date = addDays(date, (name === 'prev' ? -1 : 1) * (mode === 'week' ? 7 : 1)); await refresh(); }
  if (name === 'today') { date = today(zone()); await refresh(); }
  if (name === 'day' || name === 'week') { mode = name; await refresh(); }
  if (name === 'pick-date') { date = id; await refresh(); }
  if (name === 'new-client' || name === 'edit-client') clientForm(name === 'edit-client');
  if (name === 'client' || name === 'entry-client') { modal.close(); selectedClient = clients.find(c => c.id === id) || null; view = 'clients'; await refresh(); }
  if (name === 'back-clients') { selectedClient = null; render(); }
  if (name === 'new-project' || name === 'edit-project') projectForm(id);
  if (name === 'new-session') await sessionForm('09:00');
  if (name === 'slot') {
    const candidate = free.find(f => clock(f.startAt, zone()) === id);
    const start = candidate ? new Date(Date.parse(candidate.startAt) + settings.defaultPrepMinutes * 60000).toISOString() : undefined;
    await sessionForm(start ? clock(start, zone()) : '09:00');
  }
  if (name === 'new-block') blockForm();
  if (name === 'entry' || name === 'history-entry') await entryDetail(id, name === 'history-entry');
  if (name === 'edit-settings') settingsForm();
  if (name === 'edit-windows') windowsForm();
}

document.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-view]');
  if (!target || target instanceof HTMLButtonElement && target.disabled) return;
  event.preventDefault();
  if (target.dataset.view) { view = target.dataset.view as typeof view; selectedClient = null; void refresh(); return; }
  if (target.dataset.action === 'remove-window') { target.closest('.window-row')?.remove(); return; }
  void action(target.dataset.action!, target.dataset.id).catch(fail);
});
document.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'status-filter') { filter = target.value; render(); }
  if (target.id === 'date-picker') { if (target.value) { date = target.value; void refresh(); } }
});
document.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (target.id !== 'client-search') return;
  search = target.value;
  const query = search.toLocaleLowerCase('es-AR');
  document.querySelector('#client-list')!.innerHTML = renderClientRows(clients.filter(c => [c.name, c.phone, c.email].some(v => v?.toLocaleLowerCase('es-AR').includes(query))));
});
modal.addEventListener('click', event => { if (event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } });

async function boot() {
  app.innerHTML = '<main class="boot" role="status">Preparando tu espacio…</main>';
  try {
    profile = await api('auth/profile');
    if (new URLSearchParams(location.search).get('google') === 'connected') { view = 'settings'; history.replaceState(null, '', location.pathname); }
    await refresh(true);
  }
  catch (error) { renderLogin(error instanceof ApiError && error.status === 401 ? '' : 'La agenda no está disponible por el momento. Podés explorar la demostración.'); }
}
void boot();
// Refresh while viewing the agenda; never interrupt an open form or a hidden tab.
window.setInterval(() => { if (profile && !demo && !busy && !modal.open && !document.hidden && view === 'agenda') void refresh(); }, 60000);
