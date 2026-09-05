const request = require('supertest');
const { app } = require('../server');

describe('--- SEQA Test Suite: Check-in & Gate Pass Module ---', () => {

  let testPassId;

  beforeAll(async () => {
    // Create a registration to test check-in flow
    const regRes = await request(app).post('/api/registrations').send({
      event_id: 'EVT-CODE-03',
      participant_name: 'Alice Turing',
      email: 'alice.turing@cambridge.ac.uk',
      phone: '+44 7700 900077',
      college: 'Cambridge University',
      department: 'Informatics',
      year: '2nd Year'
    });
    testPassId = regRes.body.data.id;
  });

  test('POST /api/checkin/verify should correctly verify a valid Pass ID', async () => {
    const res = await request(app).post('/api/checkin/verify').send({
      pass_id: testPassId
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testPassId);
    expect(res.body.data.participant_name).toBe('Alice Turing');
    expect(res.body.data.already_checked_in).toBe(false);
  });

  test('POST /api/checkin/confirm should successfully check in an attendee', async () => {
    const res = await request(app).post('/api/checkin/confirm').send({
      pass_id: testPassId
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.checked_in).toBe(1);
    expect(res.body.data).toHaveProperty('checkin_time');
    expect(res.body.message).toContain('Entry Approved');
  });

  test('POST /api/checkin/confirm should block DUPLICATE check-in of the same pass', async () => {
    // Attempt to check in second time with same pass
    const res = await request(app).post('/api/checkin/confirm').send({
      pass_id: testPassId
    });

    expect(res.status).toBe(409); // 409 Conflict
    expect(res.body.success).toBe(false);
    expect(res.body.already_checked_in).toBe(true);
    expect(res.body.message).toContain('ALREADY CHECKED IN');
  });

  test('POST /api/checkin/verify should return 404 for a fake or invalid Pass ID', async () => {
    const res = await request(app).post('/api/checkin/verify').send({
      pass_id: 'REG-FAKE-9999'
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

});
