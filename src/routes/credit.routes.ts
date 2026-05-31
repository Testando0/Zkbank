import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { notifyMasters, notifyAccount } from '../ws/socket.handler';

const router = Router();

router.post('/request', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    const id = uuidv4();
    db.prepare('INSERT INTO credit_requests (id, user_id, amount) VALUES (?, ?, ?)').run(id, req.user!.userId, amount);

    const io = req.app.get('io');
    notifyMasters(io, 'credit:new_request', { id, userId: req.user!.userId, amount, date: new Date().toISOString() });

    res.status(201).json({ message: 'Credit request submitted', requestId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requests', authMiddleware, (req: AuthRequest, res) => {
  if (req.user!.role !== 'master') {
    const myRequests = db.prepare('SELECT * FROM credit_requests WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.userId);
    return res.json(myRequests);
  }
  const all = db.prepare(`SELECT cr.*, u.name, u.email FROM credit_requests cr 
    JOIN users u ON cr.user_id = u.id 
    ORDER BY CASE cr.status WHEN 'pending' THEN 0 ELSE 1 END, cr.updated_at DESC`).all();
  res.json(all);
});

router.post('/:id/decide', authMiddleware, (req: AuthRequest, res) => {
  if (req.user!.role !== 'master') return res.status(403).json({ error: 'Only masters can decide' });

  try {
    const { status, notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const request = db.prepare('SELECT * FROM credit_requests WHERE id = ? AND status = ?').get(req.params.id, 'pending') as any;
    if (!request) return res.status(404).json({ error: 'Request not found or already processed' });

    const decide = db.transaction(() => {
      db.prepare('UPDATE credit_requests SET status = ?, master_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(status, notes || null, req.params.id);

      if (status === 'approved') {
        const acc = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(request.user_id) as any;
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(request.amount, acc.id);
        db.prepare(`INSERT INTO transactions (id, to_account, amount, type, description) 
                    VALUES (?, ?, ?, 'credit', 'Approved Credit')`).run(uuidv4(), acc.id, request.amount);
      }
    });
    decide();

    const io = req.app.get('io');
    notifyAccount(io, request.user_id, 'credit:decision', { requestId: req.params.id, status, amount: request.amount, notes });

    res.json({ message: `Credit ${status}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
