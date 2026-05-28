import db from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { notifyAccount } from '../ws/socket.handler';

export class PixService {
  constructor(private io: Server) {}

  transfer(fromAccountId: string, targetKey: string, amount: number, desc: string) {
    const run = db.transaction(() => {
      const keyRow = db.prepare('SELECT account_id FROM pix_keys WHERE key_value = ?').get(targetKey) as any;
      if (!keyRow) throw new Error('PIX_KEY_NOT_FOUND');
      if (keyRow.account_id === fromAccountId) throw new Error('SELF_TRANSFER_NOT_ALLOWED');

      const sender = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(fromAccountId) as any;
      if (!sender || sender.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, fromAccountId);
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, keyRow.account_id);

      const txId = uuidv4();
      db.prepare(`INSERT INTO transactions (id, from_account, to_account, amount, type, description) 
                  VALUES (?, ?, ?, ?, 'pix', ?)`).run(txId, fromAccountId, keyRow.account_id, amount, desc || 'PIX Transfer');

      return { txId, toAccountId: keyRow.account_id };
    });

    const result = run();

    notifyAccount(this.io, fromAccountId, 'pix:sent', { amount, toKey: targetKey, desc, date: new Date().toISOString() });
    notifyAccount(this.io, result.toAccountId, 'pix:received', { amount, fromAccountId, desc, date: new Date().toISOString() });

    return result;
  }
}
