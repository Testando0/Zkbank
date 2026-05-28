import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { PixService } from '../services/pix.service';

const router = Router();

router.post('/keys', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { keyValue, type } = req.body;
    if (!keyValue || !type) return res.status(400).json({ error: 'keyValue and type required' });

    const exists = db.prepare('SELECT key_value FROM pix_keys WHERE key_value = ?').get(keyValue);
    if (exists) return res.status(409).json({ error: 'PIX key already registered' });

    db.prepare('INSERT INTO pix_keys (key_value, account_id, type) VALUES (?, ?, ?)').run(keyValue, req.user!.accountId, type);
    res.status(201).json({ message: 'PIX key registered', key: { keyValue, type } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/keys', authMiddleware, (req: AuthRequest, res) => {
  const keys = db.prepare('SELECT key_value, type, created_at FROM pix_keys WHERE account_id = ?').all(req.user!.accountId);
  res.json(keys);
});

router.post('/send', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { targetKey, amount, description } = req.body;
    if (!targetKey || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid PIX data' });

    const io = req.app.get('io');
    const pixService = new PixService(io);
    const result = pixService.transfer(req.user!.accountId, targetKey, amount, description);

    res.json({ message: 'PIX sent successfully', ...result });
  } catch (err: any) {
    const status = err.message === 'INSUFFICIENT_FUNDS' ? 422 : err.message === 'PIX_KEY_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/history', authMiddleware, (req: AuthRequest, res) => {
  const txs = db.prepare(`SELECT * FROM transactions 
    WHERE from_account = ? OR to_account = ? 
    ORDER BY created_at DESC LIMIT 50`).all(req.user!.accountId, req.user!.accountId);
  res.json(txs);
});

export default router;
