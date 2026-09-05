const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const dbPath = process.env.NODE_ENV === 'test' 
  ? ':memory:' 
  : path.join(__dirname, 'fest_system.db');

const db = new Database(dbPath);

// Enable foreign keys and WAL mode for fast concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      venue TEXT NOT NULL,
      date_time TEXT NOT NULL,
      max_capacity INTEGER NOT NULL,
      current_registrations INTEGER DEFAULT 0,
      is_team_event INTEGER DEFAULT 0,
      min_team_size INTEGER DEFAULT 1,
      max_team_size INTEGER DEFAULT 1,
      registration_fee REAL DEFAULT 0,
      image_url TEXT,
      status TEXT DEFAULT 'OPEN',
      prize_pool TEXT DEFAULT '₹10,000'
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      college TEXT NOT NULL,
      department TEXT NOT NULL,
      year TEXT NOT NULL,
      team_name TEXT,
      team_members_json TEXT,
      qr_code_data TEXT NOT NULL,
      registration_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      checked_in INTEGER DEFAULT 0,
      checkin_time DATETIME,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      event_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS winners (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      winner_name TEXT NOT NULL,
      college TEXT NOT NULL,
      prize_title TEXT,
      announced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );
  `);

  // Check if events exist, if not seed initial fest events
  const count = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
  if (count === 0) {
    seedEvents();
  }
}

function seedEvents() {
  const seedList = [
    {
      id: 'EVT-HACK-01',
      title: 'HackGenesis 24-Hr Hackathon',
      category: 'Technical',
      description: 'Build futuristic software and hardware solutions addressing AI, Climate, and FinTech problems within 24 hours of non-stop innovation.',
      venue: 'Turing Innovation Lab, Block B',
      date_time: '2026-09-12 09:00 AM',
      max_capacity: 40,
      is_team_event: 1,
      min_team_size: 2,
      max_team_size: 4,
      registration_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=800&q=80',
      prize_pool: '₹50,000'
    },
    {
      id: 'EVT-ROBO-02',
      title: 'RoboClash: Combat Arena',
      category: 'Technical',
      description: 'Design and command your battle-ready bot in an intense obstacle-filled destruction arena.',
      venue: 'Central Open Quadrangle',
      date_time: '2026-09-12 02:00 PM',
      max_capacity: 25,
      is_team_event: 1,
      min_team_size: 2,
      max_team_size: 3,
      registration_fee: 200,
      image_url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&q=80',
      prize_pool: '₹30,000'
    },
    {
      id: 'EVT-CODE-03',
      title: 'CodeSprint: Algo Blitz',
      category: 'Technical',
      description: 'Fast-paced algorithmic programming contest. Solve tricky data structure challenges before the clock runs out!',
      venue: 'Computer Center 3, 2nd Floor',
      date_time: '2026-09-12 11:30 AM',
      max_capacity: 60,
      is_team_event: 0,
      min_team_size: 1,
      max_team_size: 1,
      registration_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80',
      prize_pool: '₹20,000'
    },
    {
      id: 'EVT-BAND-04',
      title: 'Symphony: Battle of the Bands',
      category: 'Cultural',
      description: 'Electrifying live rock & fusion band competition. Bring your instruments and rock the crowd with high-voltage tunes.',
      venue: 'Main University Amphitheatre',
      date_time: '2026-09-12 05:30 PM',
      max_capacity: 15,
      is_team_event: 1,
      min_team_size: 3,
      max_team_size: 8,
      registration_fee: 500,
      image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
      prize_pool: '₹40,000'
    },
    {
      id: 'EVT-DANC-05',
      title: 'StepUp: Western & Hip-Hop Dance',
      category: 'Cultural',
      description: 'Solo & Group freestyle dance face-off. Show your rhythm, sync, and energy on the main stage.',
      venue: 'Auditorium Hall A',
      date_time: '2026-09-13 10:00 AM',
      max_capacity: 30,
      is_team_event: 1,
      min_team_size: 1,
      max_team_size: 6,
      registration_fee: 150,
      image_url: 'https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=800&q=80',
      prize_pool: '₹25,000'
    },
    {
      id: 'EVT-GAME-06',
      title: 'Valorant & BGMI Esports Championship',
      category: 'Gaming',
      description: 'High-stakes 5v5 tactical shooter and battle royale championship with live shoutcasting on huge screens.',
      venue: 'E-Sports Arena / Media Hub',
      date_time: '2026-09-13 01:00 PM',
      max_capacity: 32,
      is_team_event: 1,
      min_team_size: 4,
      max_team_size: 5,
      registration_fee: 300,
      image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
      prize_pool: '₹35,000'
    },
    {
      id: 'EVT-AIWK-07',
      title: 'Generative AI & Agentic Systems Masterclass',
      category: 'Workshop',
      description: 'Hands-on practical workshop exploring LLMs, Multi-Agent pipelines, and real-time inference systems.',
      venue: 'Seminar Hall 2',
      date_time: '2026-09-13 03:00 PM',
      max_capacity: 50,
      is_team_event: 0,
      min_team_size: 1,
      max_team_size: 1,
      registration_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=800&q=80',
      prize_pool: 'Certificate + Swag Kit'
    }
  ];

  const insertEvent = db.prepare(`
    INSERT INTO events (
      id, title, category, description, venue, date_time, 
      max_capacity, current_registrations, is_team_event, 
      min_team_size, max_team_size, registration_fee, image_url, prize_pool
    ) VALUES (
      @id, @title, @category, @description, @venue, @date_time, 
      @max_capacity, 0, @is_team_event, 
      @min_team_size, @max_team_size, @registration_fee, @image_url, @prize_pool
    )
  `);

  const insertMany = db.transaction((events) => {
    for (const evt of events) insertEvent.run(evt);
  });

  insertMany(seedList);

  // Seed sample announcement
  db.prepare(`
    INSERT INTO announcements (id, title, message, type)
    VALUES (?, ?, ?, ?)
  `).run(
    'ANN-' + randomUUID().substring(0, 8),
    '🎉 Welcome to PULSE 2026!',
    'Registrations are officially live for all Technical, Cultural, Gaming, and Workshop events. Book your slots before capacity runs out!',
    'INFO'
  );
}

// Initialize tables
initDb();

module.exports = db;
