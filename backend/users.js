const router = require('express').Router();
const { Users } = require('./models/store');
const { authMiddleware } = require('./auth');

router.get('/lookup/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await Users.findById(req.params.userId.trim().toUpperCase());
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;