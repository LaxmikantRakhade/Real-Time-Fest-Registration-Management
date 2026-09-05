// Connect Socket.IO
const socket = io();

// State
let allEvents = [];
let activeCategory = 'All';
let currentSelectedEvent = null;

// DOM Elements
const eventsContainer = document.getElementById('events-container');
const categoryChips = document.getElementById('category-chips');
const searchInput = document.getElementById('search-input');
const liveUsersCount = document.getElementById('live-users-count');
const broadcastBanner = document.getElementById('broadcast-banner');
const broadcastMessage = document.getElementById('broadcast-message');
const totalEventsCount = document.getElementById('total-events-count');
const totalSeatsLeft = document.getElementById('total-seats-left');
const toastContainer = document.getElementById('toast-container');

// Registration Modal Elements
const regModal = document.getElementById('reg-modal');
const regForm = document.getElementById('reg-form');
const regModalTitle = document.getElementById('reg-modal-title');
const regModalSubtitle = document.getElementById('reg-modal-subtitle');
const teamFieldsContainer = document.getElementById('team-fields-container');

// Pass Modal Elements
const passModal = document.getElementById('pass-modal');
const ticketContent = document.getElementById('ticket-content');

// Lookup Pass Modal Elements
const lookupModal = document.getElementById('lookup-modal');

// Winners & Schedule Container
const winnersContainer = document.getElementById('winners-container');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchEvents();
  fetchAnnouncements();
  fetchWinners();
  setupEventListeners();
  setupSocketListeners();
});

function setupEventListeners() {
  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderEvents(e.target.value);
    });
  }

  // Category filter
  if (categoryChips) {
    categoryChips.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-btn')) {
        document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        activeCategory = e.target.dataset.category;
        renderEvents(searchInput ? searchInput.value : '');
      }
    });
  }

  // Registration Form Submit
  if (regForm) {
    regForm.addEventListener('submit', handleRegistrationSubmit);
  }

  // Pass Lookup Form Submit
  const lookupForm = document.getElementById('lookup-form');
  if (lookupForm) {
    lookupForm.addEventListener('submit', handlePassLookup);
  }
}

// Socket.io Real-time Handlers
function setupSocketListeners() {
  socket.on('active_users_count', (count) => {
    if (liveUsersCount) liveUsersCount.innerText = count;
  });

  socket.on('event_capacity_updated', (data) => {
    // Update event in local state
    const evt = allEvents.find(e => e.id === data.event_id);
    if (evt) {
      evt.current_registrations = data.current_registrations;
      evt.remaining_seats = data.remaining_seats;
      evt.status = data.status;
      renderEvents(searchInput ? searchInput.value : '');
      updateHeroStats();
    }
  });

  socket.on('new_registration_toast', (data) => {
    showToast(`⚡ <strong>${escapeHtml(data.participant_name)}</strong> just registered for <em>${escapeHtml(data.event_title)}</em>!`, 'success');
  });

  socket.on('new_broadcast_alert', (data) => {
    if (broadcastBanner && broadcastMessage) {
      broadcastBanner.style.display = 'flex';
      broadcastMessage.innerText = `${data.title}: ${data.message}`;
    }
    showToast(`📢 <strong>${escapeHtml(data.title)}</strong>: ${escapeHtml(data.message)}`, 'broadcast');
  });

  socket.on('winner_published', (winner) => {
    showToast(`🏆 <strong>Winner Announced!</strong> ${escapeHtml(winner.winner_name)} won Position #${winner.position} in ${escapeHtml(winner.event_title)}!`, 'broadcast');
    fetchWinners();
  });
}

// Fetch Events
async function fetchEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success) {
      allEvents = data.data;
      renderEvents();
      updateHeroStats();
    }
  } catch (error) {
    console.error('Error fetching events:', error);
  }
}

// Render Events Grid
function renderEvents(filterQuery = '') {
  if (!eventsContainer) return;
  
  const query = filterQuery.toLowerCase().trim();
  const filtered = allEvents.filter(evt => {
    const matchCategory = activeCategory === 'All' || evt.category === activeCategory;
    const matchSearch = !query || 
      evt.title.toLowerCase().includes(query) || 
      evt.description.toLowerCase().includes(query) || 
      evt.venue.toLowerCase().includes(query);
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    eventsContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
        <p style="font-size: 1.25rem;">No events found matching your criteria.</p>
      </div>
    `;
    return;
  }

  eventsContainer.innerHTML = filtered.map(evt => {
    const occupancyPercent = Math.min(100, Math.round((evt.current_registrations / evt.max_capacity) * 100));
    const isFull = evt.current_registrations >= evt.max_capacity || evt.status === 'FULL';
    const isClosed = evt.status === 'CLOSED';
    
    let barClass = '';
    if (occupancyPercent >= 90) barClass = 'full';
    else if (occupancyPercent >= 70) barClass = 'warning';

    return `
      <div class="event-card glass" id="card-${evt.id}">
        <div class="event-img-wrap">
          <img src="${evt.image_url || 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800'}" alt="${escapeHtml(evt.title)}" class="event-img" loading="lazy">
          <span class="event-category-badge">${escapeHtml(evt.category)}</span>
          <span class="event-fee-badge">${evt.registration_fee > 0 ? '₹' + evt.registration_fee : 'FREE'}</span>
        </div>
        <div class="event-body">
          <h3 class="event-title">${escapeHtml(evt.title)}</h3>
          <p class="event-desc">${escapeHtml(evt.description)}</p>
          
          <div class="event-meta">
            <div class="meta-item">
              <span>📍</span> <span>${escapeHtml(evt.venue)}</span>
            </div>
            <div class="meta-item">
              <span>⏰</span> <span>${escapeHtml(evt.date_time)}</span>
            </div>
            <div class="meta-item">
              <span>👥</span> <span>${evt.is_team_event ? `Team (${evt.min_team_size}-${evt.max_team_size} members)` : 'Solo Participation'}</span>
            </div>
          </div>

          <div class="capacity-box">
            <div class="capacity-header">
              <span style="color: ${isFull ? 'var(--accent-rose)' : 'var(--text-secondary)'}">
                ${isFull ? '🔴 Housefull / Sold Out' : `🟢 ${evt.remaining_seats} slots left`}
              </span>
              <span style="color: var(--text-muted);">${evt.current_registrations} / ${evt.max_capacity}</span>
            </div>
            <div class="capacity-bar-track">
              <div class="capacity-bar-fill ${barClass}" style="width: ${occupancyPercent}%;"></div>
            </div>
          </div>

          <div class="card-footer">
            <div class="prize-info">🏆 ${escapeHtml(evt.prize_pool || 'Exciting Prizes')}</div>
            <button 
              class="btn btn-primary" 
              onclick="openRegistrationModal('${evt.id}')"
              ${(isFull || isClosed) ? 'disabled' : ''}>
              ${isFull ? 'Closed' : 'Register Now'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateHeroStats() {
  if (totalEventsCount) totalEventsCount.innerText = allEvents.length;
  if (totalSeatsLeft) {
    const totalRemaining = allEvents.reduce((acc, evt) => acc + (evt.max_capacity - evt.current_registrations), 0);
    totalSeatsLeft.innerText = Math.max(0, totalRemaining);
  }
}

// Open Registration Modal
window.openRegistrationModal = function(eventId) {
  const event = allEvents.find(e => e.id === eventId);
  if (!event) return;
  currentSelectedEvent = event;

  regModalTitle.innerText = `Register for ${event.title}`;
  regModalSubtitle.innerText = `${event.category} Event • ${event.venue} • ${event.is_team_event ? `Team of ${event.min_team_size}-${event.max_team_size}` : 'Solo'}`;
  document.getElementById('form-event-id').value = event.id;

  // Render dynamic team fields if team event
  if (event.is_team_event && teamFieldsContainer) {
    teamFieldsContainer.style.display = 'block';
    renderTeamMemberInputs(event.min_team_size, event.max_team_size);
  } else if (teamFieldsContainer) {
    teamFieldsContainer.style.display = 'none';
    teamFieldsContainer.innerHTML = '';
  }

  regModal.classList.add('active');
};

function renderTeamMemberInputs(minSize, maxSize) {
  // Leader is member 1, so additional member inputs are 2 to maxSize
  const extraMembersNeeded = maxSize - 1;
  let html = `
    <div class="form-group">
      <label class="form-label">Team Name *</label>
      <input type="text" id="form-team-name" class="form-control" placeholder="e.g. CyberKnights" required>
    </div>
    <div style="margin-top: 1rem; border-top: 1px dashed var(--glass-border); padding-top: 1rem;">
      <h4 style="font-size: 0.95rem; margin-bottom: 0.75rem; color: var(--accent-cyan);">Teammates Details (Optional / As per team size)</h4>
  `;

  for (let i = 2; i <= maxSize; i++) {
    const isRequired = i <= minSize;
    html += `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
        <div>
          <input type="text" class="form-control team-member-name" placeholder="Member ${i} Name ${isRequired ? '*' : ''}" ${isRequired ? 'required' : ''}>
        </div>
        <div>
          <input type="email" class="form-control team-member-email" placeholder="Member ${i} Email">
        </div>
      </div>
    `;
  }

  html += `</div>`;
  teamFieldsContainer.innerHTML = html;
}

// Submit Registration
async function handleRegistrationSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('reg-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Generating E-Pass...';

  try {
    const eventId = document.getElementById('form-event-id').value;
    const participantName = document.getElementById('form-name').value.trim();
    const email = document.getElementById('form-email').value.trim();
    const phone = document.getElementById('form-phone').value.trim();
    const college = document.getElementById('form-college').value.trim();
    const department = document.getElementById('form-dept').value.trim();
    const year = document.getElementById('form-year').value;

    let teamName = null;
    let teamMembers = [];

    if (currentSelectedEvent && currentSelectedEvent.is_team_event) {
      teamName = document.getElementById('form-team-name') ? document.getElementById('form-team-name').value.trim() : null;
      const nameInputs = document.querySelectorAll('.team-member-name');
      const emailInputs = document.querySelectorAll('.team-member-email');
      
      nameInputs.forEach((inp, idx) => {
        if (inp.value.trim()) {
          teamMembers.push({
            name: inp.value.trim(),
            email: emailInputs[idx] ? emailInputs[idx].value.trim() : ''
          });
        }
      });
    }

    const payload = {
      event_id: eventId,
      participant_name: participantName,
      email: email,
      phone: phone,
      college: college,
      department: department,
      year: year,
      team_name: teamName,
      team_members: teamMembers
    };

    const res = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    // Success! Close reg modal and show E-Pass
    closeModal('reg-modal');
    regForm.reset();
    showPassModal(data.data);

  } catch (error) {
    alert(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Confirm & Generate E-Pass';
  }
}

// Display E-Pass Ticket Badge
function showPassModal(regData) {
  if (!passModal || !ticketContent) return;

  ticketContent.innerHTML = `
    <div class="ticket-badge" id="printable-ticket">
      <div class="ticket-header">
        <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--accent-cyan); font-weight: 700;">Official Fest E-Pass</div>
        <h2 style="font-size: 1.5rem; font-weight: 800; margin-top: 4px;">${escapeHtml(regData.event_title)}</h2>
        <div class="ticket-id">#${escapeHtml(regData.id)}</div>
      </div>

      <div class="ticket-qr-wrap">
        <img src="${regData.qr_code_data}" alt="QR E-Pass">
      </div>

      <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
        Scan this QR at the venue entrance desk for instant check-in.
      </div>

      <div class="ticket-info-grid">
        <div>
          <div class="ticket-info-label">Participant / Lead</div>
          <div class="ticket-info-val">${escapeHtml(regData.participant_name)}</div>
        </div>
        <div>
          <div class="ticket-info-label">College</div>
          <div class="ticket-info-val">${escapeHtml(regData.college)}</div>
        </div>
        <div>
          <div class="ticket-info-label">Venue</div>
          <div class="ticket-info-val">${escapeHtml(regData.venue)}</div>
        </div>
        <div>
          <div class="ticket-info-label">Date & Time</div>
          <div class="ticket-info-val">${escapeHtml(regData.date_time)}</div>
        </div>
        ${regData.team_name ? `
        <div style="grid-column: 1/-1;">
          <div class="ticket-info-label">Team Name</div>
          <div class="ticket-info-val">${escapeHtml(regData.team_name)}</div>
        </div>
        ` : ''}
      </div>
    </div>

    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
      <button class="btn btn-secondary" style="flex: 1;" onclick="window.print()">🖨️ Print Pass</button>
      <button class="btn btn-primary" style="flex: 1;" onclick="downloadPass()">💾 Save E-Pass</button>
    </div>
  `;

  passModal.classList.add('active');
}

// Handle Pass Lookup
async function handlePassLookup(e) {
  e.preventDefault();
  const passId = document.getElementById('lookup-pass-id').value.trim();
  if (!passId) return;

  try {
    const res = await fetch(`/api/registrations/${encodeURIComponent(passId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Pass not found');
    
    closeModal('lookup-modal');
    showPassModal(data.data);
  } catch (err) {
    alert(err.message);
  }
}

// Announcements
async function fetchAnnouncements() {
  try {
    const res = await fetch('/api/announcements');
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      const latest = data.data[0];
      if (broadcastBanner && broadcastMessage) {
        broadcastBanner.style.display = 'flex';
        broadcastMessage.innerText = `${latest.title}: ${latest.message}`;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// Winners Leaderboard
async function fetchWinners() {
  if (!winnersContainer) return;
  try {
    const res = await fetch('/api/announcements/winners');
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      winnersContainer.innerHTML = data.data.map(w => {
        const medal = w.position === 1 ? '🥇 1st Place' : w.position === 2 ? '🥈 2nd Place' : '🥉 3rd Place';
        return `
          <div class="glass" style="padding: 1.25rem; border-radius: var(--radius-md); border-left: 4px solid var(--accent-amber);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-weight: 700; color: var(--accent-amber); font-size: 0.9rem;">${medal}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(w.category)}</span>
            </div>
            <h4 style="font-size: 1.1rem; color: #fff; margin-bottom: 2px;">${escapeHtml(w.winner_name)}</h4>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(w.college)}</div>
            <div style="font-size: 0.8rem; color: var(--accent-cyan); margin-top: 0.5rem;">🎯 ${escapeHtml(w.event_title)}</div>
          </div>
        `;
      }).join('');
    } else {
      winnersContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
          Results and winner announcements will be broadcasted live here during the fest!
        </div>
      `;
    }
  } catch (err) {
    console.error(err);
  }
}

// Helper utilities
window.closeModal = function(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
};

window.openModal = function(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
};

function showToast(msg, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div>${msg}</div>
    <button onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1.1rem; line-height:1;">&times;</button>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 5000);
}

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

window.downloadPass = function() {
  window.print();
};
