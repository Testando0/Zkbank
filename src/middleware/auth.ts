import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'ghostzin-zk-secret-2024';

export interface AuthRequest extends Request {
  user?: { userId: string; accountId: string; role: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token missing' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, SECRET) as any;
    req.user = {
      userId: payload.userId,
      accountId: payload.accountId,
      role: payload.role
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
