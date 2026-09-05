const request = require('supertest');
const { app } = require('../server');

describe('--- SEQA Test Suite: Announcements, Winners & Stats Module ---', () => {

  test('POST /api/announcements should broadcast a new announcement', async () => {
    const res = await request(app).post('/api/announcements').send({
      title: '🚨 Venue Relocation',
      message: 'RoboClash matches shifted to Outdoor Quadrangle Block C due to rain.',
      type: 'URGENT'
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toContain('Venue Relocation');
  });

  test('GET /api/announcements should list recent announcements', async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('POST /api/announcements/winners should publish winner results', async () => {
    const res = await request(app).post('/api/announcements/winners').send({
      event_id: 'EVT-CODE-03',
      position: 1,
      winner_name: 'Quantum Coders',
      college: 'Harvard Tech',
      prize_title: '₹20,000 + Gold Trophy'
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.winner_name).toBe('Quantum Coders');
    expect(res.body.data.position).toBe(1);
  });

  test('GET /api/stats/summary should return computed KPIs, departments, and event occupancies', async () => {
    const res = await request(app).get('/api/stats/summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('kpis');
    expect(res.body.data.kpis).toHaveProperty('total_registrations');
    expect(res.body.data.kpis).toHaveProperty('total_checked_in');
    expect(res.body.data.kpis).toHaveProperty('checkin_percentage');
    expect(res.body.data).toHaveProperty('department_breakdown');
  });

  test('GET /api/stats/export-csv should export CSV attendee data', async () => {
    const res = await request(app).get('/api/stats/export-csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Registration ID');
    expect(res.text).toContain('Lead Name');
  });

});
