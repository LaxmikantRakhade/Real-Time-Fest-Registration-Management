const express = require('express');
const router = express.Router();
const db = require('../database');
const QRCode = require('qrcode');
const { randomUUID } = require('crypto');

// POST /api/registrations - Register participant or team for an event
router.post('/', async (req, res) => {
  try {
    const {
      event_id,
      participant_name,
      email,
      phone,
      college,
      department,
      year,
      team_name,
      team_members
    } = req.body;

    // 1. Validate required fields
    if (!event_id || !participant_name || !email || !phone || !college || !department) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all mandatory fields: Name, Email, Phone, College, Department, and Event'
      });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format' });
    }

    // 2. Fetch event
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (event.status === 'CLOSED' || event.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: `Registration is ${event.status.toLowerCase()} for this event.` });
    }

    // 3. Capacity check
    if (event.current_registrations >= event.max_capacity) {
      return res.status(400).json({
        success: false,
        message: `Sorry! "${event.title}" has reached full capacity (${event.max_capacity}/${event.max_capacity} seats booked).`
      });
    }

    // 4. Duplicate registration check (same email + same event)
    const duplicate = db.prepare(`
      SELECT id, participant_name FROM registrations 
      WHERE LOWER(email) = LOWER(?) AND event_id = ?
    `).get(email, event_id);

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `This email (${email}) is already registered for "${event.title}" under Pass #${duplicate.id}.`,
        existing_registration_id: duplicate.id
      });
    }

    // 5. Team validation if applicable
    let teamMembersJson = null;
    if (event.is_team_event === 1) {
      if (!team_name || team_name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Team Name is required for this team event' });
      }

      const membersList = Array.isArray(team_members) ? team_members : [];
      // Include lead participant in total team count calculation
      const totalMembers = 1 + membersList.length;
      if (totalMembers < event.min_team_size || totalMembers > event.max_team_size) {
        return res.status(400).json({
          success: false,
          message: `Team size must be between ${event.min_team_size} and ${event.max_team_size} members (Lead + ${membersList.length} members provided).`
        });
      }
      teamMembersJson = JSON.stringify(membersList);
    }

    // 6. Generate unique Registration ID & QR Data
    const regPrefix = 'REG-' + (event.category.substring(0, 3).toUpperCase());
    const regId = `${regPrefix}-${randomUUID().substring(0, 6).toUpperCase()}`;

    const qrPayload = JSON.stringify({
      id: regId,
      event_id: event.id,
      event_title: event.title,
      name: participant_name,
      college: college,
      team: team_name || null
    });

    // Generate Base64 Data URL for QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });

    // 7. Atomic DB Transaction: Insert registration & increment event counter
    const registerTransaction = db.transaction(() => {
      // Re-check capacity within transaction to prevent race conditions
      const freshEvent = db.prepare('SELECT current_registrations, max_capacity FROM events WHERE id = ?').get(event_id);
      if (freshEvent.current_registrations >= freshEvent.max_capacity) {
        throw new Error('CAPACITY_EXCEEDED');
      }

      db.prepare(`
        INSERT INTO registrations (
          id, event_id, participant_name, email, phone,
          college, department, year, team_name, team_members_json,
          qr_code_data, registration_time, checked_in
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, CURRENT_TIMESTAMP, 0
        )
      `).run(
        regId, event_id, participant_name, email.toLowerCase().trim(), phone,
        college, department, year || '1st Year', team_name || null, teamMembersJson,
        qrCodeDataUrl
      );

      const newCount = freshEvent.current_registrations + 1;
      const newStatus = newCount >= freshEvent.max_capacity ? 'FULL' : 'OPEN';

      db.prepare(`
        UPDATE events 
        SET current_registrations = ?, status = ?
        WHERE id = ?
      `).run(newCount, newStatus, event_id);

      return { newCount, newStatus };
    });

    let txResult;
    try {
      txResult = registerTransaction();
    } catch (err) {
      if (err.message === 'CAPACITY_EXCEEDED') {
        return res.status(400).json({ success: false, message: 'Registration closed: Event just reached maximum capacity.' });
      }
      throw err;
    }

    // 8. Fetch complete registration object
    const createdReg = db.prepare(`
      SELECT r.*, e.title AS event_title, e.category, e.venue, e.date_time, e.prize_pool
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(regId);

    // 9. Real-Time Broadcast via WebSockets
    if (req.io) {
      // Live notification toast to all connected screens
      req.io.emit('new_registration_toast', {
        id: regId,
        participant_name,
        college,
        event_title: event.title,
        timestamp: new Date().toISOString()
      });

      // Live slot quota update
      req.io.emit('event_capacity_updated', {
        event_id: event.id,
        current_registrations: txResult.newCount,
        max_capacity: event.max_capacity,
        remaining_seats: event.max_capacity - txResult.newCount,
        status: txResult.newStatus
      });
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Digital E-Pass generated.',
      data: createdReg
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/registrations - List registrations with filters
router.get('/', (req, res) => {
  try {
    const { event_id, search, checked_in } = req.query;

    let query = `
      SELECT r.*, e.title AS event_title, e.category, e.venue, e.date_time
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (event_id) {
      query += ` AND r.event_id = ?`;
      params.push(event_id);
    }

    if (checked_in !== undefined) {
      query += ` AND r.checked_in = ?`;
      params.push(checked_in === 'true' || checked_in === '1' ? 1 : 0);
    }

    if (search) {
      query += ` AND (r.participant_name LIKE ? OR r.email LIKE ? OR r.id LIKE ? OR r.college LIKE ? OR r.team_name LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY r.registration_time DESC`;

    const registrations = db.prepare(query).all(...params);
    res.json({ success: true, count: registrations.length, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/registrations/:id - Fetch single pass
router.get('/:id', (req, res) => {
  try {
    const reg = db.prepare(`
      SELECT r.*, e.title AS event_title, e.category, e.venue, e.date_time, e.prize_pool, e.is_team_event
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Pass or Registration ID not found' });
    }

    res.json({ success: true, data: reg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
