const express = require('express');
const router = express.Router();
const db = require('../database');
const { randomUUID } = require('crypto');

// GET all events with live metrics
router.get('/', (req, res) => {
  try {
    const events = db.prepare(`
      SELECT 
        e.*,
        (e.max_capacity - e.current_registrations) AS remaining_seats,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = 1) AS checked_in_count
      FROM events e
      ORDER BY e.date_time ASC
    `).all();

    res.json({ success: true, count: events.length, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single event by ID
router.get('/:id', (req, res) => {
  try {
    const event = db.prepare(`
      SELECT 
        e.*,
        (e.max_capacity - e.current_registrations) AS remaining_seats,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = 1) AS checked_in_count
      FROM events e
      WHERE e.id = ?
    `).get(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// CREATE new event (Admin)
router.post('/', (req, res) => {
  try {
    const {
      title, category, description, venue, date_time, 
      max_capacity, is_team_event, min_team_size, max_team_size, 
      registration_fee, image_url, prize_pool
    } = req.body;

    if (!title || !category || !venue || !date_time || !max_capacity) {
      return res.status(400).json({ success: false, message: 'Missing required event fields' });
    }

    const id = 'EVT-' + (category.substring(0, 4).toUpperCase()) + '-' + randomUUID().substring(0, 4).toUpperCase();

    db.prepare(`
      INSERT INTO events (
        id, title, category, description, venue, date_time,
        max_capacity, current_registrations, is_team_event,
        min_team_size, max_team_size, registration_fee, image_url, prize_pool, status
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, 0, ?,
        ?, ?, ?, ?, ?, 'OPEN'
      )
    `).run(
      id, title, category, description || '', venue, date_time,
      parseInt(max_capacity), is_team_event ? 1 : 0,
      parseInt(min_team_size || 1), parseInt(max_team_size || 1),
      parseFloat(registration_fee || 0), image_url || '', prize_pool || 'TBA'
    );

    const created = db.prepare('SELECT * FROM events WHERE id = ?').get(id);

    // Emit live event creation
    if (req.io) {
      req.io.emit('event_created', created);
    }

    res.status(201).json({ success: true, message: 'Event created successfully', data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// UPDATE event capacity / details
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const {
      title, category, description, venue, date_time,
      max_capacity, status, prize_pool, registration_fee
    } = req.body;

    const newCapacity = max_capacity !== undefined ? parseInt(max_capacity) : existing.max_capacity;
    
    // Auto adjust status if capacity reached
    let newStatus = status || existing.status;
    if (existing.current_registrations >= newCapacity) {
      newStatus = 'FULL';
    } else if (newStatus === 'FULL' && existing.current_registrations < newCapacity) {
      newStatus = 'OPEN';
    }

    db.prepare(`
      UPDATE events SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        venue = COALESCE(?, venue),
        date_time = COALESCE(?, date_time),
        max_capacity = ?,
        status = ?,
        prize_pool = COALESCE(?, prize_pool),
        registration_fee = COALESCE(?, registration_fee)
      WHERE id = ?
    `).run(
      title, category, description, venue, date_time,
      newCapacity, newStatus, prize_pool, registration_fee, id
    );

    const updated = db.prepare(`
      SELECT e.*, (e.max_capacity - e.current_registrations) AS remaining_seats
      FROM events e WHERE e.id = ?
    `).get(id);

    if (req.io) {
      req.io.emit('event_updated', updated);
    }

    res.json({ success: true, message: 'Event updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE event
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(id);

    if (req.io) {
      req.io.emit('event_deleted', { id });
    }

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
