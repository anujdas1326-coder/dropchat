const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Users } = require('./models/store');
const { JWT_SECRET } = require('./auth');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    const existingUsername = await Users.findByUsername(username);
    if (existingUsername) return res.status(409).json({ error: 'Username already taken' });

    const existingEmail = await Users.findByEmail(email);
    if (existingEmail) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await Users.create({ username, email, password: hashed, displayName });

    const token = jwt.sign(
      { userId: user._id, username: user.username, displayName: user.displayName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await Users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, username: user.username, displayName: user.displayName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;