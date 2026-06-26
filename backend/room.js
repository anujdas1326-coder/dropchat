const router = require('express').Router();
const { Rooms, Messages, Users } = require('./models/store');
const { authMiddleware } = require('./auth');

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Room name required' });
    const room = await Rooms.create({ name, description, createdBy: req.user.userId });
    res.json({ room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const rooms = await Rooms.getByUserId(req.user.userId);
    const enriched = [];
    for (const r of rooms) {
      const creator = await Users.findById(r.createdBy);
      enriched.push({
        _id: r._id,
        name: r.name,
        description: r.description,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        memberCount: r.members.length,
        creatorName: creator ? creator.displayName : 'Unknown'
      });
    }
    res.json({ rooms: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'Room ID required' });

    const room = await Rooms.findById(roomId.trim().toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (await Rooms.isMember(room._id, req.user.userId)) {
      return res.json({ room, message: 'Already a member' });
    }

    await Rooms.addMember(room._id, req.user.userId);
    res.json({ room, message: 'Joined successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const room = await Rooms.findById(req.params.roomId.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!(await Rooms.isMember(room._id, req.user.userId))) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const messages = await Messages.getByRoom(room._id);
    const members = [];
    for (const uid of room.members) {
      const u = await Users.findById(uid);
      if (u) {
        members.push({ id: u._id, username: u.username, displayName: u.displayName });
      }
    }

    res.json({ 
      room: { 
        _id: room._id, 
        name: room.name, 
        description: room.description, 
        createdBy: room.createdBy, 
        createdAt: room.createdAt, 
        members 
      }, 
      messages 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;