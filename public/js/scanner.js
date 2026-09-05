const socket = io();

// State
let html5QrCode = null;
let currentPassData = null;
let isScanning = false;
let recentCheckins = [];

// DOM Elements
const manualPassInput = document.getElementById('manual-pass-input');
const verifyResultCard = document.getElementById('verify-result-card');
const verifyEmptyState = document.getElementById('verify-empty-state');
const checkinHistoryList = document.getElementById('checkin-history-list');
const cameraStatusBadge = document.getElementById('camera-status-badge');
const startScannerBtn = document.getElementById('start-scanner-btn');

document.addEventListener('DOMContentLoaded', () => {
  setupScannerEvents();
  setupAudioContext();
});

function setupScannerEvents() {
  const manualForm = document.getElementById('manual-lookup-form');
  if (manualForm) {
    manualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = manualPassInput.value.trim();
      if (code) verifyPass(code);
    });
  }

  if (startScannerBtn) {
    startScannerBtn.addEventListener('click', toggleScanner);
  }

  socket.on('participant_checked_in', (data) => {
    addRecentCheckin(data);
  });
}

// Audio Feedback System using Web Audio API (Zero external assets needed)
let audioCtx;
function setupAudioContext() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio not supported');
  }
}

function playSuccessChime() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const now = audioCtx.currentTime;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now); // D5
  osc1.frequency.setValueAtTime(880.00, now + 0.1); // A5
  osc2.frequency.setValueAtTime(1174.66, now + 0.2); // D6

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioCtx.destination);

  osc1.start(now);
  osc2.start(now + 0.1);
  osc1.stop(now + 0.6);
  osc2.stop(now + 0.6);
}

function playWarningBuzzer() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.setValueAtTime(120, now + 0.15);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.45);
}

// HTML5 QR Scanner
async function toggleScanner() {
  if (isScanning) {
    stopScanner();
  } else {
    startScanner();
  }
}

async function startScanner() {
  try {
    if (!window.Html5Qrcode) {
      alert('QR Scanner library is loading. Please try in a moment.');
      return;
    }

    html5QrCode = new Html5Qrcode("reader");
    const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

    await html5QrCode.start(
      { facingMode: "environment" },
      qrConfig,
      onScanSuccess,
      onScanError
    );

    isScanning = true;
    startScannerBtn.innerText = '⏹️ Stop Camera';
    startScannerBtn.className = 'btn btn-secondary';
    cameraStatusBadge.innerText = '📷 Camera Active';
    cameraStatusBadge.style.color = 'var(--accent-emerald)';
  } catch (err) {
    console.error('Camera Start Error:', err);
    alert('Unable to access camera. Please allow camera permissions or use the manual Pass ID lookup below.');
  }
}

async function stopScanner() {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {
      console.warn(e);
    }
  }
  isScanning = false;
  startScannerBtn.innerText = '📹 Start Camera Scanner';
  startScannerBtn.className = 'btn btn-primary';
  cameraStatusBadge.innerText = 'Idle';
  cameraStatusBadge.style.color = 'var(--text-muted)';
}

let lastScannedText = '';
let scanCooldown = false;

function onScanSuccess(decodedText) {
  if (scanCooldown || decodedText === lastScannedText) return;
  
  scanCooldown = true;
  lastScannedText = decodedText;
  verifyPass(decodedText);

  setTimeout(() => {
    scanCooldown = false;
    lastScannedText = '';
  }, 3000);
}

function onScanError(errorMessage) {
  // Ignored for continuous scanning frames
}

// Verify Pass against Backend
async function verifyPass(codeOrJson) {
  try {
    const res = await fetch('/api/checkin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_data: codeOrJson })
    });

    const data = await res.json();
    if (!res.ok) {
      playWarningBuzzer();
      showScanError(data.message || 'Invalid Pass');
      return;
    }

    currentPassData = data.data;
    renderVerificationCard(currentPassData);

    if (currentPassData.already_checked_in) {
      playWarningBuzzer();
    }
  } catch (err) {
    playWarningBuzzer();
    showScanError(err.message);
  }
}

function renderVerificationCard(pass) {
  verifyEmptyState.style.display = 'none';
  verifyResultCard.style.display = 'block';

  const isAlready = pass.already_checked_in;

  let teamSection = '';
  if (pass.is_team_event && pass.team_members && pass.team_members.length > 0) {
    teamSection = `
      <div style="background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); padding: 0.75rem 1rem; margin-top: 1rem;">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--accent-cyan); margin-bottom: 0.5rem;">
          👥 Team: ${escapeHtml(pass.team_name || 'Team Entry')}
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          ${pass.team_members.map((m, idx) => `<div>#${idx + 2} ${escapeHtml(m.name || m)}</div>`).join('')}
        </div>
      </div>
    `;
  }

  verifyResultCard.innerHTML = `
    <div class="glass" style="padding: 1.75rem; border-radius: var(--radius-lg); border: 2px solid ${isAlready ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
      
      <!-- Status Badge -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <span style="font-family: monospace; font-size: 1.1rem; font-weight: 800; color: var(--accent-cyan);">
          #${escapeHtml(pass.id)}
        </span>
        <span class="live-badge" style="background: ${isAlready ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)'}; color: ${isAlready ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; border-color: ${isAlready ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'};">
          ${isAlready ? '⚠️ ALREADY CHECKED IN' : '🟢 VERIFIED & VALID'}
        </span>
      </div>

      <!-- Participant Details -->
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1.25rem;">
        <div style="width: 54px; height: 54px; border-radius: 50%; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fff; font-weight: 800;">
          ${escapeHtml(pass.participant_name.charAt(0).toUpperCase())}
        </div>
        <div>
          <h2 style="font-size: 1.35rem; font-weight: 800; color: #fff; line-height: 1.2;">${escapeHtml(pass.participant_name)}</h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(pass.college)} • ${escapeHtml(pass.department)}</p>
        </div>
      </div>

      <!-- Event info -->
      <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 1rem;">
        <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Event Registered</div>
        <div style="font-size: 1rem; font-weight: 700; color: #fff; margin: 2px 0;">${escapeHtml(pass.event_title)}</div>
        <div style="color: var(--text-secondary);">📍 ${escapeHtml(pass.venue)} • ⏰ ${escapeHtml(pass.date_time)}</div>
      </div>

      ${teamSection}

      ${isAlready ? `
        <div style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); color: #fecdd3; padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: 1rem;">
          🚫 <strong>DUPLICATE ENTRY ALERT:</strong> This pass was already used for check-in on ${new Date(pass.checkin_time).toLocaleString()}.
        </div>
      ` : `
        <button class="btn btn-success" style="width: 100%; padding: 0.9rem; margin-top: 1.25rem; font-size: 1rem; font-weight: 700;" onclick="confirmCheckin('${pass.id}')">
          ✅ Confirm Check-In & Admit Attendee
        </button>
      `}
    </div>
  `;
}

// Confirm Check-In
window.confirmCheckin = async function(passId) {
  try {
    const res = await fetch('/api/checkin/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass_id: passId })
    });

    const data = await res.json();
    if (!res.ok) {
      playWarningBuzzer();
      alert(data.message || 'Check-in failed');
      return;
    }

    playSuccessChime();
    
    // Update view
    currentPassData.already_checked_in = true;
    currentPassData.checkin_time = new Date().toISOString();
    renderVerificationCard(currentPassData);

  } catch (err) {
    alert(err.message);
  }
};

function showScanError(msg) {
  verifyEmptyState.style.display = 'none';
  verifyResultCard.style.display = 'block';
  verifyResultCard.innerHTML = `
    <div class="glass" style="padding: 2rem; text-align: center; border-radius: var(--radius-lg); border: 2px solid var(--accent-rose);">
      <div style="font-size: 3rem; margin-bottom: 0.5rem;">❌</div>
      <h3 style="font-size: 1.25rem; color: var(--accent-rose); font-weight: 800; margin-bottom: 0.5rem;">Pass Verification Failed</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem;">${escapeHtml(msg)}</p>
      <button class="btn btn-secondary" style="margin-top: 1.25rem;" onclick="resetScannerView()">Try Another Code</button>
    </div>
  `;
}

window.resetScannerView = function() {
  verifyResultCard.style.display = 'none';
  verifyEmptyState.style.display = 'block';
  if (manualPassInput) manualPassInput.value = '';
};

function addRecentCheckin(data) {
  recentCheckins.unshift(data);
  if (recentCheckins.length > 8) recentCheckins.pop();

  if (checkinHistoryList) {
    checkinHistoryList.innerHTML = recentCheckins.map(item => `
      <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem;">
        <div>
          <strong style="color: #fff;">${escapeHtml(item.participant_name)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.event_title)}</div>
        </div>
        <div style="text-align: right;">
          <span class="live-badge" style="font-size: 0.7rem; padding: 2px 6px;">Admitted</span>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(item.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </li>
    `).join('');
  }
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
