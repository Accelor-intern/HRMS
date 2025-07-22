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
import { updateAttendanceWithLeaves } from './utils/processAttendance.js';
import { updateAttendanceWithOD } from './utils/processAttendance.js';
import { processLateArrivalStatus } from './utils/processAttendance.js';
import { processPunchLogAttendance } from './utils/processAttendance.js';
import { processUnclaimedOT } from './utils/processUnclaimedOT.js';
import { processPunchLogOD } from './utils/processAttendance.js';
import { checkAbsences } from './utils/absenceCron.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.get('/', (req, res) => {
  res.send('HRMS Backend is running!');
});

const allowedOrigins = [
  'http://192.168.1.20:5001',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://192.168.59.225:5001',
  'https://hrms-rho-brown.vercel.app',
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
import holidaysRouter from './routes/holidays.js';

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
app.use('/api/holidays', holidaysRouter);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // GridFS and cron jobs can run asynchronously
    const checkGridFS = setInterval(() => {
      if (gfsReady()) {
        clearInterval(checkGridFS);
        console.log('GridFS initialized successfully');

        // Schedule your cron jobs here (as shown in your code)
        cron.schedule('39 09 * * *', async () => {
          console.log('Running processPunchLogAttendance at 09:33 AM...');
          await processPunchLogAttendance();
          console.log('processPunchLogAttendance at 09:33 AM completed.');
        }, { timezone: 'Asia/Kolkata' });

        // Add other cron jobs as needed
      }
    }, 100);

    setTimeout(() => {
      if (!gfsReady()) {
        console.error('GridFS failed to initialize within 10 seconds');
        // Optionally log a warning but don't exit
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



