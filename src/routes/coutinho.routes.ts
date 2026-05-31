import { Router } from 'express';
import db from '../config/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/deposit', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    const deposit = db.transaction(() => {
      const acc = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(req.user!.accountId) as any;
      if (!acc || acc.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

      db.prepare('UPDATE accounts SET balance = balance - ?, coutinho_balance = coutinho_balance + ? WHERE id = ?')
        .run(amount, amount, req.user!.accountId);
    });
    deposit();

    res.json({ message: 'Deposited to Coutinho successfully' });
  } catch (err: any) {
    const status = err.message === 'INSUFFICIENT_FUNDS' ? 422 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/withdraw', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    const withdraw = db.transaction(() => {
      const acc = db.prepare('SELECT coutinho_balance FROM accounts WHERE id = ?').get(req.user!.accountId) as any;
      if (!acc || acc.coutinho_balance < amount) throw new Error('INSUFFICIENT_COUTINHO');

      db.prepare('UPDATE accounts SET balance = balance + ?, coutinho_balance = coutinho_balance - ? WHERE id = ?')
        .run(amount, amount, req.user!.accountId);
    });
    withdraw();

    res.json({ message: 'Withdrawn from Coutinho successfully' });
  } catch (err: any) {
    const status = err.message === 'INSUFFICIENT_COUTINHO' ? 422 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/balance', authMiddleware, (req: AuthRequest, res) => {
  const acc = db.prepare('SELECT coutinho_balance, last_yield_at FROM accounts WHERE id = ?').get(req.user!.accountId) as any;
  res.json(acc);
});

export default router;
