const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  displayName: { type: String },
  joinedRooms: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true },
  members: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  displayName: { type: String },
  text: { type: String, required: true },
  reactions: { type: Map, of: [String], default: {} },
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', UserSchema);
const RoomModel = mongoose.model('Room', RoomSchema);
const MessageModel = mongoose.model('Message', MessageSchema);

const Users = {
  async create({ username, email, password, displayName }) {
    const { v4: uuidv4 } = require('uuid');
    const userId = uuidv4().slice(0, 8).toUpperCase();

    const user = new UserModel({
      _id: userId,
      username,
      email,
      password,
      displayName: displayName || username,
      joinedRooms: []
    });
    return await user.save();
  },

  async findByUsername(username) {
    return await UserModel.findOne({ username: username.toLowerCase() });
  },

  async findByEmail(email) {
    return await UserModel.findOne({ email: email.toLowerCase() });
  },

  async findById(id) {
    return await UserModel.findById(id);
  },

  async addRoom(userId, roomId) {
    await UserModel.findByIdAndUpdate(userId, {
      $addToSet: { joinedRooms: roomId }
    });
  },

  async removeRoom(userId, roomId) {
    await UserModel.findByIdAndUpdate(userId, {
      $pull: { joinedRooms: roomId }
    });
  }
};

const Rooms = {
  async create({ name, description, createdBy }) {
    const { v4: uuidv4 } = require('uuid');
    let attempts = 0;

    // FIX: retry on duplicate ID collision (error code 11000)
    while (attempts < 5) {
      try {
        const roomId = uuidv4().slice(0, 6).toUpperCase();

        const room = new RoomModel({
          _id: roomId,
          name,
          description,
          createdBy,
          members: [createdBy]
        });

        await room.save();
        await Users.addRoom(createdBy, roomId);
        return room;
      } catch (err) {
        if (err.code === 11000) {
          attempts++;
          continue; // duplicate ID, try again
        }
        throw err; // any other error, rethrow immediately
      }
    }

    throw new Error('Could not generate a unique room ID after 5 attempts');
  },

  async findById(id) {
    return await RoomModel.findById(id);
  },

  async addMember(roomId, userId) {
    const room = await RoomModel.findById(roomId);
    if (room && !room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
      await Users.addRoom(userId, roomId);
      return true;
    }
    return false;
  },

  async isMember(roomId, userId) {
    const room = await RoomModel.findById(roomId);
    return room ? room.members.includes(userId) : false;
  },

  async getByUserId(userId) {
    const user = await UserModel.findById(userId);
    if (!user) return [];
    return await RoomModel.find({ _id: { $in: user.joinedRooms } });
  }
};

const Messages = {
  async add(roomId, { userId, username, displayName, text }) {
    const msg = new MessageModel({
      roomId,
      userId,
      username,
      displayName,
      text,
      reactions: {}
    });
    return await msg.save();
  },

  async getByRoom(roomId, limit = 50) {
    return await MessageModel
      .find({ roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .then(msgs => msgs.reverse());
  },

  async addReaction(roomId, messageId, emoji, userId) {
    const msg = await MessageModel.findById(messageId);
    if (!msg) return null;
    if (!emoji) return msg;

    if (!msg.reactions) msg.reactions = new Map();

    const currentReactions = msg.reactions.get(emoji) || [];
    const idx = currentReactions.indexOf(userId);

    if (idx === -1) {
      currentReactions.push(userId);
      msg.reactions.set(emoji, currentReactions);
    } else {
      currentReactions.splice(idx, 1);
      if (currentReactions.length === 0) {
        msg.reactions.delete(emoji);
      } else {
        msg.reactions.set(emoji, currentReactions);
      }
    }

    msg.markModified('reactions');
    return await msg.save();
  }
};

module.exports = { Users, Rooms, Messages };