const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const { Messages, Rooms } = require('./models/store');

const onlineUsers = new Map(); // socketId -> { userId, username, displayName, roomId }
const roomOnline = new Map();  // roomId -> Set of socketIds

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
      const rid = roomId?.trim().toUpperCase(); // FIX: normalize roomId

      if (!(await Rooms.isMember(rid, userId))) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }

      // Leave previous room if any
      const prev = onlineUsers.get(socket.id);
      if (prev?.roomId) {
        socket.leave(prev.roomId);
        const prevSet = roomOnline.get(prev.roomId);
        if (prevSet) {
          prevSet.delete(socket.id);
          const prevUserIds = [...prevSet]
            .map(sid => onlineUsers.get(sid)?.userId)
            .filter(Boolean);
          io.to(prev.roomId).emit('online_users', [...new Set(prevUserIds)]);
        }
      }

      socket.join(rid);
      onlineUsers.set(socket.id, { userId, username, displayName, roomId: rid });

      if (!roomOnline.has(rid)) roomOnline.set(rid, new Set());
      roomOnline.get(rid).add(socket.id);

      const uniqueUserIds = [...roomOnline.get(rid)]
        .map(sid => onlineUsers.get(sid)?.userId)
        .filter(Boolean);

      io.to(rid).emit('online_users', [...new Set(uniqueUserIds)]);
      io.to(rid).emit('user_joined', { userId, displayName });

      const history = await Messages.getByRoom(rid, 60);
      socket.emit('message_history', history);
    });

    socket.on('send_message', async ({ roomId, text }) => {
      const rid = roomId?.trim().toUpperCase(); // FIX: normalize roomId

      if (!text?.trim()) return;
      if (!(await Rooms.isMember(rid, userId))) return;

      const msg = await Messages.add(rid, {
        userId,
        username,
        displayName,
        text: text.trim()
      });

      io.to(rid).emit('new_message', msg);
    });

    socket.on('toggle_reaction', async ({ roomId, messageId, emoji }) => {
      const rid = roomId?.trim().toUpperCase(); // FIX: normalize roomId

      if (!(await Rooms.isMember(rid, userId))) return;

      const updated = await Messages.addReaction(rid, messageId, emoji, userId);
      if (updated) {
        io.to(rid).emit('reaction_updated', {
          messageId,
          reactions: updated.reactions
        });
      }
    });

    socket.on('typing_start', ({ roomId }) => {
      const rid = roomId?.trim().toUpperCase(); // FIX: normalize roomId
      socket.to(rid).emit('user_typing', { userId, displayName });
    });

    socket.on('typing_stop', ({ roomId }) => {
      const rid = roomId?.trim().toUpperCase(); // FIX: normalize roomId
      socket.to(rid).emit('user_stop_typing', { userId });
    });

    socket.on('disconnect', () => {
      const info = onlineUsers.get(socket.id);
      if (info?.roomId) {
        const set = roomOnline.get(info.roomId);
        if (set) {
          set.delete(socket.id);
          const uniqueUserIds = [...set]
            .map(sid => onlineUsers.get(sid)?.userId)
            .filter(Boolean);
          io.to(info.roomId).emit('online_users', [...new Set(uniqueUserIds)]);
          io.to(info.roomId).emit('user_left', { userId, displayName });
        }
      }
      onlineUsers.delete(socket.id);
    });
  });
}

module.exports = { initSocket };