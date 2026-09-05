const express = require('express');
const router = express.Router();
const db = require('../database');

// POST /api/checkin/verify - Verify QR code scan or registration ID
router.post('/verify', (req, res) => {
  try {
    const { pass_id, qr_data } = req.body;
    let targetId = pass_id;

    // If raw QR data JSON was scanned, extract id
    if (!targetId && qr_data) {
      try {
        const parsed = typeof qr_data === 'string' ? JSON.parse(qr_data) : qr_data;
        targetId = parsed.id;
      } catch {
        targetId = qr_data;
      }
    }

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Please provide Pass ID or QR code data' });
    }

    const registration = db.prepare(`
      SELECT 
        r.*, 
        e.title AS event_title, 
        e.category, 
        e.venue, 
        e.date_time,
        e.is_team_event
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(targetId.trim());

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Invalid Pass! No registration record matches this QR code / ID.'
      });
    }

    let teamMembers = [];
    if (registration.team_members_json) {
      try {
        teamMembers = JSON.parse(registration.team_members_json);
      } catch (e) {
        teamMembers = [];
      }
    }

    res.json({
      success: true,
      data: {
        ...registration,
        team_members: teamMembers,
        already_checked_in: registration.checked_in === 1
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/checkin/confirm - Confirm check-in with duplicate prevention
router.post('/confirm', (req, res) => {
  try {
    const { pass_id } = req.body;
    if (!pass_id) {
      return res.status(400).json({ success: false, message: 'Missing pass_id' });
    }

    const reg = db.prepare(`
      SELECT r.*, e.title AS event_title, e.venue
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(pass_id.trim());

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration record not found' });
    }

    if (reg.checked_in === 1) {
      return res.status(409).json({
        success: false,
        already_checked_in: true,
        message: `⚠️ ALREADY CHECKED IN! This pass was checked in earlier on ${new Date(reg.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}. Duplicate entry denied.`,
        data: reg
      });
    }

    const checkinTime = new Date().toISOString();

    db.prepare(`
      UPDATE registrations
      SET checked_in = 1, checkin_time = ?
      WHERE id = ?
    `).run(checkinTime, pass_id.trim());

    const updated = db.prepare(`
      SELECT r.*, e.title AS event_title
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(pass_id.trim());

    // Total checked in for this event
    const eventStats = db.prepare(`
      SELECT 
        COUNT(*) AS total_registered,
        SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS total_checked_in
      FROM registrations
      WHERE event_id = ?
    `).get(reg.event_id);

    // Broadcast check-in event to all organizer & admin dashboards
    if (req.io) {
      req.io.emit('participant_checked_in', {
        pass_id: updated.id,
        participant_name: updated.participant_name,
        event_id: reg.event_id,
        event_title: reg.event_title,
        checkin_time: checkinTime,
        event_stats: eventStats
      });
    }

    res.json({
      success: true,
      message: `✅ Entry Approved! Welcome, ${updated.participant_name}.`,
      data: updated,
      event_stats: eventStats
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
