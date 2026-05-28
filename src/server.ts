import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initWebSocket } from './ws/socket.handler';
import authRoutes from './routes/auth.routes';
import pixRoutes from './routes/pix.routes';
import creditRoutes from './routes/credit.routes';
import coutinhoRoutes from './routes/coutinho.routes';
import { CoutinhoService } from './services/coutinho.service';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.set('io', io);
initWebSocket(io);

app.use('/api/auth', authRoutes);
app.use('/api/pix', pixRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/coutinho', coutinhoRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok', bank: 'Ghostzin`zk Bank', timestamp: new Date().toISOString() }));

// Coutinho yield a cada hora
const coutinho = new CoutinhoService(io);
setInterval(() => coutinho.applyYield(), 3600000);

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`👻 Ghostzin\`zk Bank running on port ${PORT}`);
  console.log(`📡 WebSocket ready | 🗄️ SQLite WAL mode active`);
});
