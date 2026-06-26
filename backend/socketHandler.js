const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const { Messages, Rooms } = require('./models/store');

const onlineUsers = new Map(); // socketId -> { userId, username, displayName, roomId }
const roomOnline = new Map();  // roomId -> Set of socketIds (Fixes tab syncing bug)

function initSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, username, displayName } = socket.user;
    console.log(`[socket] ${displayName} (${userId}) connected`);

    socket.on('join_room', async ({ roomId }) => {
      if (!(await Rooms.isMember(roomId, userId))) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }

      const prev = onlineUsers.get(socket.id);
      if (prev?.roomId) {
        socket.leave(prev.roomId);
        const prevSet = roomOnline.get(prev.roomId);
        if (prevSet) {
          prevSet.delete(socket.id);
          io.to(prev.roomId).emit('online_users', [...prevSet].map(sid => onlineUsers.get(sid)?.userId).filter(Boolean));
        }
      }

      socket.join(roomId);
      onlineUsers.set(socket.id, { userId, username, displayName, roomId });

      if (!roomOnline.has(roomId)) roomOnline.set(roomId, new Set());
      roomOnline.get(roomId).add(socket.id);

      const uniqueUserIds = [...roomOnline.get(roomId)].map(sid => onlineUsers.get(sid)?.userId).filter(Boolean);
      io.to(roomId).emit('online_users', [...new Set(uniqueUserIds)]);
      io.to(roomId).emit('user_joined', { userId, displayName });

      const history = await Messages.getByRoom(roomId, 60);
      socket.emit('message_history', history);
    });

    socket.on('send_message', async ({ roomId, text }) => {
      if (!text?.trim()) return;
      if (!(await Rooms.isMember(roomId, userId))) return;

      const msg = await Messages.add(roomId, { userId, username, displayName, text: text.trim() });
      io.to(roomId).emit('new_message', msg);
    });

    socket.on('toggle_reaction', async ({ roomId, messageId, emoji }) => {
      if (!(await Rooms.isMember(roomId, userId))) return;
      const updated = await Messages.addReaction(roomId, messageId, emoji, userId);
      if (updated) {
        io.to(roomId).emit('reaction_updated', { messageId, reactions: updated.reactions });
      }
    });

    socket.on('typing_start', ({ roomId }) => {
      socket.to(roomId).emit('user_typing', { userId, displayName });
    });

    socket.on('typing_stop', ({ roomId }) => {
      socket.to(roomId).emit('user_stop_typing', { userId });
    });

    socket.on('disconnect', () => {
      const info = onlineUsers.get(socket.id);
      if (info?.roomId) {
        const set = roomOnline.get(info.roomId);
        if (set) {
          set.delete(socket.id);
          const uniqueUserIds = [...set].map(sid => onlineUsers.get(sid)?.userId).filter(Boolean);
          io.to(info.roomId).emit('online_users', [...new Set(uniqueUserIds)]);
          io.to(info.roomId).emit('user_left', { userId, displayName });
        }
      }
      onlineUsers.delete(socket.id);
    });
  });
}

module.exports = { initSocket };