const request = require('supertest');
const { app } = require('../server');
const db = require('../database');

describe('--- SEQA Test Suite: Events Module ---', () => {

  test('GET /api/events should return list of seeded events with capacity metrics', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstEvent = res.body.data[0];
    expect(firstEvent).toHaveProperty('id');
    expect(firstEvent).toHaveProperty('title');
    expect(firstEvent).toHaveProperty('max_capacity');
    expect(firstEvent).toHaveProperty('remaining_seats');
    expect(firstEvent).toHaveProperty('checked_in_count');
  });

  test('POST /api/events should validate required fields', async () => {
    const res = await request(app).post('/api/events').send({
      title: 'Incomplete Event'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/events should create a new event successfully', async () => {
    const newEvent = {
      title: 'AI Prompt Engineering Blitz',
      category: 'Technical',
      description: 'Test your agent prompting speed.',
      venue: 'Lab 4, Tech Block',
      date_time: '2026-09-14 02:00 PM',
      max_capacity: 10,
      is_team_event: false,
      registration_fee: 50,
      prize_pool: '₹5,000'
    };

    const res = await request(app).post('/api/events').send(newEvent);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe(newEvent.title);
    expect(res.body.data.id).toMatch(/^EVT-TECH-/);
  });

  test('PUT /api/events/:id should update event capacity and details', async () => {
    const res = await request(app).put('/api/events/EVT-CODE-03').send({
      max_capacity: 75,
      venue: 'Main Computing Auditorium'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.max_capacity).toBe(75);
    expect(res.body.data.venue).toBe('Main Computing Auditorium');
  });

});
