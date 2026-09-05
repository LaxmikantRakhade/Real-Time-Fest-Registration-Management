const request = require('supertest');
const { app } = require('../server');
const db = require('../database');

describe('--- SEQA Test Suite: Registrations Module ---', () => {

  const testEventId = 'EVT-HACK-01';

  test('POST /api/registrations should register a team and generate a QR pass', async () => {
    const regPayload = {
      event_id: testEventId,
      participant_name: 'Devin Vance',
      email: 'devin.vance@mit.edu',
      phone: '+91 9988776655',
      college: 'MIT Institute of Technology',
      department: 'Computer Science',
      year: '3rd Year',
      team_name: 'HackSquad Alpha',
      team_members: [
        { name: 'Sarah Connor', email: 'sarah@mit.edu' },
        { name: 'John Doe', email: 'john@mit.edu' }
      ]
    };

    const res = await request(app).post('/api/registrations').send(regPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('qr_code_data');
    expect(res.body.data.qr_code_data).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.participant_name).toBe('Devin Vance');
  });

  test('POST /api/registrations should reject duplicate registration with same email for same event', async () => {
    const duplicatePayload = {
      event_id: testEventId,
      participant_name: 'Devin Vance',
      email: 'devin.vance@mit.edu', // Same email as above
      phone: '+91 9988776655',
      college: 'MIT Institute of Technology',
      department: 'Computer Science',
      year: '3rd Year',
      team_name: 'HackSquad Beta',
      team_members: [{ name: 'Alex', email: 'alex@mit.edu' }]
    };

    const res = await request(app).post('/api/registrations').send(duplicatePayload);
    expect(res.status).toBe(409); // 409 Conflict
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('already registered');
  });

  test('POST /api/registrations should validate required fields (e.g. missing email)', async () => {
    const invalidPayload = {
      event_id: testEventId,
      participant_name: 'Incomplete Person'
      // missing email, phone, college, department
    };

    const res = await request(app).post('/api/registrations').send(invalidPayload);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/registrations should enforce team size constraints', async () => {
    // Hackathon requires min 2 members (Lead + 1). Providing 0 members should fail.
    const soloForTeamEventPayload = {
      event_id: testEventId,
      participant_name: 'Lone Hacker',
      email: 'lone@hack.edu',
      phone: '+91 9123456789',
      college: 'Stanford Tech',
      department: 'CSE',
      team_name: 'Solo Warriors',
      team_members: [] // Only 1 total member (lead), min is 2
    };

    const res = await request(app).post('/api/registrations').send(soloForTeamEventPayload);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Team size must be between');
  });

  test('GET /api/registrations should return all registrations and support search filters', async () => {
    const res = await request(app).get('/api/registrations?search=Devin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].participant_name).toBe('Devin Vance');
  });

});
