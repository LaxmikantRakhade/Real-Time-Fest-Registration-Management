const socket = io();

// State
let adminStats = null;
let adminEvents = [];
let adminRegistrations = [];

// DOM Elements
const kpiTotalRegs = document.getElementById('kpi-total-regs');
const kpiCheckedIn = document.getElementById('kpi-checked-in');
const kpiCheckinPct = document.getElementById('kpi-checkin-pct');
const kpiRevenue = document.getElementById('kpi-revenue');
const kpiTotalEvents = document.getElementById('kpi-total-events');
const eventsTableBody = document.getElementById('events-table-body');
const regsTableBody = document.getElementById('regs-table-body');
const regFilterEvent = document.getElementById('reg-filter-event');
const regSearchInput = document.getElementById('reg-search-input');
const regFilterStatus = document.getElementById('reg-filter-status');
const deptList = document.getElementById('dept-list');
const categoryList = document.getElementById('category-list');
const winnerEventSelect = document.getElementById('winner-event-select');
const alertEventSelect = document.getElementById('alert-event-select');

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  setupAdminEventListeners();
  setupAdminSocketListeners();
});

function setupAdminEventListeners() {
  // New Event Form
  const newEventForm = document.getElementById('new-event-form');
  if (newEventForm) newEventForm.addEventListener('submit', handleCreateEvent);

  // Broadcast Alert Form
  const alertForm = document.getElementById('broadcast-form');
  if (alertForm) alertForm.addEventListener('submit', handleSendBroadcast);

  // Publish Winner Form
  const winnerForm = document.getElementById('winner-form');
  if (winnerForm) winnerForm.addEventListener('submit', handlePublishWinner);

  // Edit Event Form
  const editEventForm = document.getElementById('edit-event-form');
  if (editEventForm) editEventForm.addEventListener('submit', handleUpdateEvent);

  // Registration Filters
  if (regFilterEvent) regFilterEvent.addEventListener('change', fetchRegistrations);
  if (regFilterStatus) regFilterStatus.addEventListener('change', fetchRegistrations);
  if (regSearchInput) {
    let debounceTimer;
    regSearchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchRegistrations, 300);
    });
  }
}

function setupAdminSocketListeners() {
  socket.on('new_registration_toast', () => {
    loadDashboardData();
    fetchRegistrations();
  });

  socket.on('participant_checked_in', (data) => {
    loadDashboardData();
    fetchRegistrations();
  });

  socket.on('event_capacity_updated', () => {
    loadDashboardData();
  });
}

async function loadDashboardData() {
  try {
    const res = await fetch('/api/stats/summary');
    const data = await res.json();
    if (data.success) {
      adminStats = data.data;
      renderKPIs(adminStats.kpis);
      renderAnalytics(adminStats);
      renderEventsList(adminStats.event_stats);
      populateEventDropdowns(adminStats.event_stats);
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderKPIs(kpis) {
  if (kpiTotalRegs) kpiTotalRegs.innerText = kpis.total_registrations;
  if (kpiCheckedIn) kpiCheckedIn.innerText = kpis.total_checked_in;
  if (kpiCheckinPct) kpiCheckinPct.innerText = `${kpis.checkin_percentage}%`;
  if (kpiRevenue) kpiRevenue.innerText = `₹${kpis.total_revenue.toLocaleString()}`;
  if (kpiTotalEvents) kpiTotalEvents.innerText = kpis.total_events;
}

function renderAnalytics(stats) {
  // Department Breakdown
  if (deptList) {
    if (stats.department_breakdown.length === 0) {
      deptList.innerHTML = `<li style="color: var(--text-muted); font-size: 0.85rem;">No registrations yet</li>`;
    } else {
      deptList.innerHTML = stats.department_breakdown.map(d => `
        <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem;">
          <span>${escapeHtml(d.department)}</span>
          <strong style="color: var(--accent-cyan);">${d.count}</strong>
        </li>
      `).join('');
    }
  }

  // Category Breakdown
  if (categoryList) {
    categoryList.innerHTML = stats.category_breakdown.map(c => `
      <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem;">
        <span>${escapeHtml(c.category)} (${c.events_count} events)</span>
        <strong style="color: var(--accent-emerald);">${c.registrations_count} regs</strong>
      </li>
    `).join('');
  }
}

function renderEventsList(events) {
  adminEvents = events;
  if (!eventsTableBody) return;

  eventsTableBody.innerHTML = events.map(e => `
    <tr>
      <td>
        <strong>${escapeHtml(e.title)}</strong><br>
        <small style="color: var(--text-muted);">${e.id} • ${e.category}</small>
      </td>
      <td>
        <div style="font-weight: 600;">${e.current_registrations} / ${e.max_capacity}</div>
        <div class="capacity-bar-track" style="margin-top: 4px; height: 6px;">
          <div class="capacity-bar-fill" style="width: ${e.occupancy_rate}%;"></div>
        </div>
      </td>
      <td>
        <span class="live-badge" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.3);">
          ${e.checked_in} Checked In
        </span>
      </td>
      <td>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="openEditEventModal('${e.id}')">✏️ Edit</button>
      </td>
    </tr>
  `).join('');
}

function populateEventDropdowns(events) {
  const options = events.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('');
  
  if (regFilterEvent) {
    regFilterEvent.innerHTML = `<option value="">All Events</option>` + options;
  }
  if (winnerEventSelect) {
    winnerEventSelect.innerHTML = options;
  }
  if (alertEventSelect) {
    alertEventSelect.innerHTML = `<option value="">All Events (Global)</option>` + options;
  }
}

async function fetchRegistrations() {
  if (!regsTableBody) return;
  const eventId = regFilterEvent ? regFilterEvent.value : '';
  const search = regSearchInput ? regSearchInput.value : '';
  const checkedIn = regFilterStatus ? regFilterStatus.value : '';

  let url = `/api/registrations?`;
  if (eventId) url += `event_id=${encodeURIComponent(eventId)}&`;
  if (search) url += `search=${encodeURIComponent(search)}&`;
  if (checkedIn) url += `checked_in=${encodeURIComponent(checkedIn)}&`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      adminRegistrations = data.data;
      renderRegistrationsTable(data.data);
    }
  } catch (err) {
    console.error('Error fetching registrations:', err);
  }
}

function renderRegistrationsTable(regs) {
  if (regs.length === 0) {
    regsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding: 2rem;">No registrations matching filter.</td></tr>`;
    return;
  }

  regsTableBody.innerHTML = regs.map(r => `
    <tr>
      <td><strong style="font-family: monospace; color: var(--accent-cyan);">${escapeHtml(r.id)}</strong></td>
      <td>
        <strong>${escapeHtml(r.participant_name)}</strong><br>
        <small style="color: var(--text-muted);">${escapeHtml(r.email)} • ${escapeHtml(r.phone)}</small>
      </td>
      <td>
        <div>${escapeHtml(r.college)}</div>
        <small style="color: var(--text-muted);">${escapeHtml(r.department)} (${escapeHtml(r.year)})</small>
      </td>
      <td>${escapeHtml(r.event_title)}</td>
      <td>
        ${r.checked_in === 1 
          ? `<span class="live-badge">✅ Checked In</span>` 
          : `<span style="color: var(--text-muted); font-size: 0.8rem;">⏳ Pending</span>`}
      </td>
      <td>
        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="viewAdminPass('${r.id}')">View Pass</button>
      </td>
    </tr>
  `).join('');
}

// Create Event
async function handleCreateEvent(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('evt-title').value,
    category: document.getElementById('evt-category').value,
    venue: document.getElementById('evt-venue').value,
    date_time: document.getElementById('evt-time').value,
    max_capacity: document.getElementById('evt-capacity').value,
    is_team_event: document.getElementById('evt-team').checked,
    min_team_size: document.getElementById('evt-min-team').value,
    max_team_size: document.getElementById('evt-max-team').value,
    registration_fee: document.getElementById('evt-fee').value,
    prize_pool: document.getElementById('evt-prize').value,
    description: document.getElementById('evt-desc').value,
    image_url: document.getElementById('evt-image').value
  };

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error creating event');

    alert('🎉 Event Created & Broadcasted!');
    document.getElementById('new-event-form').reset();
    closeModal('new-event-modal');
    loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}

// Edit Event Modal
window.openEditEventModal = async function(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();
    if (!data.success) return;
    const evt = data.data;

    document.getElementById('edit-evt-id').value = evt.id;
    document.getElementById('edit-evt-title').value = evt.title;
    document.getElementById('edit-evt-capacity').value = evt.max_capacity;
    document.getElementById('edit-evt-venue').value = evt.venue;
    document.getElementById('edit-evt-time').value = evt.date_time;
    document.getElementById('edit-evt-status').value = evt.status;
    document.getElementById('edit-evt-prize').value = evt.prize_pool || '';

    openModal('edit-event-modal');
  } catch (err) {
    console.error(err);
  }
};

async function handleUpdateEvent(e) {
  e.preventDefault();
  const id = document.getElementById('edit-evt-id').value;
  const payload = {
    title: document.getElementById('edit-evt-title').value,
    max_capacity: document.getElementById('edit-evt-capacity').value,
    venue: document.getElementById('edit-evt-venue').value,
    date_time: document.getElementById('edit-evt-time').value,
    status: document.getElementById('edit-evt-status').value,
    prize_pool: document.getElementById('edit-evt-prize').value
  };

  try {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error updating event');

    alert('Event Updated!');
    closeModal('edit-event-modal');
    loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}

// Broadcast Announcement
async function handleSendBroadcast(e) {
  e.preventDefault();
  const title = document.getElementById('alert-title').value.trim();
  const message = document.getElementById('alert-message').value.trim();
  const event_id = alertEventSelect ? alertEventSelect.value : null;

  try {
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, event_id, type: 'ALERT' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    alert('📢 Broadcast Alert Sent to all connected participant screens!');
    document.getElementById('broadcast-form').reset();
  } catch (err) {
    alert(err.message);
  }
}

// Publish Winner
async function handlePublishWinner(e) {
  e.preventDefault();
  const payload = {
    event_id: document.getElementById('winner-event-select').value,
    position: document.getElementById('winner-position').value,
    winner_name: document.getElementById('winner-name').value.trim(),
    college: document.getElementById('winner-college').value.trim(),
    prize_title: document.getElementById('winner-prize').value.trim()
  };

  try {
    const res = await fetch('/api/announcements/winners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    alert('🏆 Winner Results Published & Broadcasted Live!');
    document.getElementById('winner-form').reset();
  } catch (err) {
    alert(err.message);
  }
}

window.viewAdminPass = function(regId) {
  window.open(`/?pass=${regId}`, '_blank');
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

window.openModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
};
