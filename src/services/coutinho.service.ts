import db from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { notifyAccount } from '../ws/socket.handler';

// Rendimento simulado: ~1% ao mês aplicado proporcionalmente a cada hora
const HOURLY_RATE = 0.01 / 720;

export class CoutinhoService {
  constructor(private io: Server) {}

  applyYield() {
    const accounts = db.prepare('SELECT id, coutinho_balance FROM accounts WHERE coutinho_balance > 0').all() as any[];
    
    const update = db.transaction(() => {
      for (const acc of accounts) {
        const yieldAmount = Math.round(acc.coutinho_balance * HOURLY_RATE * 100) / 100;
        if (yieldAmount <= 0) continue;

        db.prepare('UPDATE accounts SET coutinho_balance = coutinho_balance + ?, last_yield_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(yieldAmount, acc.id);

        db.prepare(`INSERT INTO transactions (id, to_account, amount, type, description) 
                    VALUES (?, ?, ?, 'yield', 'Coutinho Yield')`).run(uuidv4(), acc.id, yieldAmount);

        notifyAccount(this.io, acc.id, 'coutinho:yield', { amount: yieldAmount, date: new Date().toISOString() });
      }
    });

    try {
      update();
      console.log(`💰 Coutinho yield applied to ${accounts.length} accounts`);
    } catch (err) {
      console.error('Coutinho yield error:', err);
    }
  }
}
