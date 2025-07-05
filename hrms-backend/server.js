import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import { gfsReady } from './utils/gridfs.js';
import { syncAttendance } from './utils/syncAttendance.js';
import { processLateArrivalsAndAbsents } from './utils/processAttendance.js';
import { processUnclaimedOT } from './utils/processUnclaimedOT.js';
import { checkAbsences } from './utils/absenceCron.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://192.168.1.28:5001',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://192.168.59.225:5001',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

global._io = io;

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import employeeRoutes from './routes/employees.js';
import departmentRoutes from './routes/departments.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leaves.js';
import notificationRoutes from './routes/notifications.js';
import otRouter from './routes/ot.js';
import odRouter from './routes/od.js';
import punchMissedRouter from './routes/punchMissed.js';
import payrollRouter from './routes/payroll.js';

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ot', otRouter);
app.use('/api/od', odRouter);
app.use('/api/punch-missed', punchMissedRouter);
app.use('/api/payroll', payrollRouter);

// MongoDB connection
console.log('here');
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    // Wait for GridFS to be ready with a timeout
    const checkGridFS = setInterval(() => {
      if (gfsReady()) {
        clearInterval(checkGridFS);
        console.log('GridFS initialized successfully');

        // Schedule syncAttendance at 9:30 AM and 2:00 PM daily
        // cron.schedule('30 9 * * *', async () => {
        //   console.log('Running syncAttendance at 9:30 AM...');
        //   await syncAttendance();
        //   console.log('syncAttendance at 9:30 AM completed.');
        // }, { timezone: 'Asia/Kolkata' });

        // cron.schedule('00 14 * * *', async () => {
        //   console.log('Running syncAttendance at 2:00 PM...');
        //   await syncAttendance();
        //   console.log('syncAttendance at 2:00 PM completed.');
        // }, { timezone: 'Asia/Kolkata' });

        // // Schedule processLateArrivalsAndAbsents at 9:35 AM daily
        // cron.schedule('32 9 * * *', async () => {
        //   console.log('Running processLateArrivalsAndAbsents at 9:35 AM...');
        //   await processLateArrivalsAndAbsents();
        //   console.log('processLateArrivalsAndAbsents at 9:35 AM completed.');
        // }, { timezone: 'Asia/Kolkata' });

        // // Schedule processUnclaimedOT at 12:30 AM daily
        // cron.schedule('35 9 * * *', async () => {
        //   console.log('Running processUnclaimedOT at 9:30 AM... for the timing at 9:30 AM');
        //   await processUnclaimedOT();
        //   console.log('processUnclaimedOT at 9:30 AM completed.');
        // }, { timezone: 'Asia/Kolkata' });

        // // Schedule checkAbsences at midnight daily
        // cron.schedule('36 9 * * *', async () => {
        //   console.log('Running checkAbsences at midnight...');
        //   await checkAbsences();
        //   console.log('checkAbsences at midnight completed.');
        // }, { timezone: 'Asia/Kolkata' });

        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      }
    }, 100); // Check every 100ms
    // Timeout after 10 seconds if GridFS isn't ready
    setTimeout(() => {
      if (!gfsReady()) {
        console.error('GridFS failed to initialize within 10 seconds');
        process.exit(1);
      }
    }, 10000);
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Socket.io events
io.on('connection', socket => {
  console.log('User connected:', socket.id);

  // Join room based on employeeId from query
  const { employeeId } = socket.handshake.query;
  if (employeeId) {
    socket.join(employeeId);
    console.log(`Socket ${socket.id} joined room ${employeeId}`);
  } else {
    console.warn(`Socket ${socket.id} connected without employeeId`);
  }

  // Handle explicit 'join' event (for compatibility)
  socket.on('join', userId => {
    if (userId) {
      socket.join(userId);
      console.log(`Socket ${socket.id} joined room ${userId} via join event`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});
