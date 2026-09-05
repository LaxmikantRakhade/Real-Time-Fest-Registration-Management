const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach Socket.IO to request object for route handlers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/events', require('./routes/events'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/stats', require('./routes/stats'));

// Root fallback to frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io Real-Time Connection
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id} (Total active: ${io.engine.clientsCount})`);

  // Broadcast live active attendees count
  io.emit('active_users_count', io.engine.clientsCount);

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    io.emit('active_users_count', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 Fest Management System running at http://localhost:${PORT}`);
    console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin.html`);
    console.log(`📷 QR Scanner Portal: http://localhost:${PORT}/scanner.html`);
  });
}

module.exports = { app, server, io };
