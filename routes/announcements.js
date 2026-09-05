const express = require('express');
const router = express.Router();
const db = require('../database');
const { randomUUID } = require('crypto');

// GET all announcements
router.get('/', (req, res) => {
  try {
    const announcements = db.prepare(`
      SELECT a.*, e.title AS event_title
      FROM announcements a
      LEFT JOIN events e ON a.event_id = e.id
      ORDER BY a.created_at DESC
      LIMIT 20
    `).all();

    res.json({ success: true, count: announcements.length, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST new broadcast announcement
router.post('/', (req, res) => {
  try {
    const { title, message, type, event_id } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const id = 'ANN-' + randomUUID().substring(0, 8);
    db.prepare(`
      INSERT INTO announcements (id, title, message, type, event_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title, message, type || 'INFO', event_id || null);

    const announcement = db.prepare(`
      SELECT a.*, e.title AS event_title
      FROM announcements a
      LEFT JOIN events e ON a.event_id = e.id
      WHERE a.id = ?
    `).get(id);

    // Live broadcast to all connected participant and admin screens
    if (req.io) {
      req.io.emit('new_broadcast_alert', announcement);
    }

    res.status(201).json({ success: true, message: 'Broadcast sent to all attendees', data: announcement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET winners leaderboard
router.get('/winners', (req, res) => {
  try {
    const winners = db.prepare(`
      SELECT w.*, e.title AS event_title, e.category, e.prize_pool
      FROM winners w
      JOIN events e ON w.event_id = e.id
      ORDER BY w.announced_at DESC, w.position ASC
    `).all();

    res.json({ success: true, data: winners });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST publish winner
router.post('/winners', (req, res) => {
  try {
    const { event_id, position, winner_name, college, prize_title } = req.body;
    if (!event_id || !position || !winner_name || !college) {
      return res.status(400).json({ success: false, message: 'Missing required winner fields' });
    }

    const id = 'WIN-' + randomUUID().substring(0, 8);
    db.prepare(`
      INSERT INTO winners (id, event_id, position, winner_name, college, prize_title)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, event_id, parseInt(position), winner_name, college, prize_title || `Position ${position}`);

    const winner = db.prepare(`
      SELECT w.*, e.title AS event_title, e.category
      FROM winners w
      JOIN events e ON w.event_id = e.id
      WHERE w.id = ?
    `).get(id);

    if (req.io) {
      req.io.emit('winner_published', winner);
    }

    res.status(201).json({ success: true, message: 'Winner result published!', data: winner });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
