import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'ghostzin-zk-secret-2024';

interface AuthSocket extends Socket {
  userId?: string;
  accountId?: string;
  role?: string;
}

export function initWebSocket(io: Server) {
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      const payload = jwt.verify(token, SECRET) as any;
      socket.userId = payload.userId;
      socket.accountId = payload.accountId;
      socket.role = payload.role;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    if (socket.accountId) socket.join(`acc:${socket.accountId}`);
    if (socket.role === 'master') socket.join('masters');

    socket.on('ping', (cb) => cb?.('pong'));
  });
}

export const notifyAccount = (io: Server, accountId: string, event: string, data: any) => {
  io.to(`acc:${accountId}`).emit(event, data);
};

export const notifyMasters = (io: Server, event: string, data: any) => {
  io.to('masters').emit(event, data);
};
