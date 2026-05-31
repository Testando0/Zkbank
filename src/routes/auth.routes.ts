import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const SECRET = process.env.JWT_SECRET || 'ghostzin-zk-secret-2024';

router.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 12);
    const userId = uuidv4();
    const accountId = uuidv4();

    const create = db.transaction(() => {
      db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(userId, name, email, hash);
      db.prepare('INSERT INTO accounts (id, user_id) VALUES (?, ?)').run(accountId, userId);
    });
    create();

    const token = jwt.sign({ userId, accountId, role: 'user' }, SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: userId, name, email, role: 'user' }, accountId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const account = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(user.id) as any;
    const token = jwt.sign({ userId: user.id, accountId: account.id, role: user.role }, SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, accountId: account.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user!.userId) as any;
  const account = db.prepare('SELECT balance, coutinho_balance FROM accounts WHERE id = ?').get(req.user!.accountId) as any;
  res.json({ user, account });
});

export default router;
