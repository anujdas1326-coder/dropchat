require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./authroutes');
const roomRoutes = require('./room');
const userRoutes = require('./users');
const { initSocket } = require('./socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || null;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB initial connection error:', err));
} else {
  console.log('Error: No MONGO_URI environment variable detected configured.');
}

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

initSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`DropChat backend running on http://localhost:${PORT}`);
});