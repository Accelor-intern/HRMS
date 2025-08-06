import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import axios from 'axios';
import xml2js from 'xml2js';
import { gfsReady } from './utils/gridfs.js';
import RawPunchlog from './models/RawPunchlog.js';
import RawESSLData from './models/RawESSLData.js';
import Attendance from './models/Attendance.js';
import { processPunchLogAttendance } from './utils/processAttendance.js';
import { processLateArrivalStatus } from './utils/processAttendance.js';
import { updateAttendanceWithShift } from './utils/processAttendance.js';
import { updateAttendanceWithLeaves } from './utils/processAttendance.js';


dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://192.168.1.20:5001',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://192.168.59.225:5001',
  'https://hrms-rho-brown.vercel.app',
  'https://hrms-0fcn.onrender.com',
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

// Routes
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

// Reusable ESSL sync function
async function syncESSLAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const soapRequest = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><GetTransactionsLog xmlns="http://tempuri.org/"><FromDateTime>${today} 00:00:00</FromDateTime><ToDateTime>${today} 23:59:59</ToDateTime><SerialNumber>QJT3243900243</SerialNumber><UserName>admin</UserName><UserPassword>Admin@123</UserPassword><strDataList></strDataList></GetTransactionsLog></soap12:Body></soap12:Envelope>`;

  try {
    console.log('Sending SOAP request to ESSL API...');
    const response = await axios.post('http://www.iseorg.com/accelore/webapiservice.asmx', soapRequest, {
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/GetTransactionsLog',
      },
    });

    console.log('Received response from ESSL API:', response.data);
    const strDataListMatch = response.data.match(/<strDataList>([\s\S]*?)<\/strDataList>/);
    if (!strDataListMatch) {
      console.warn('strDataList not found in response');
      return { count: 0, message: 'No attendance data to process' };
    }

    const strDataList = strDataListMatch[1].trim();
    const lines = strDataList.split(/\r?\n/).filter(line => line.trim());
    console.log('Number of processed lines:', lines.length);

    // Save raw data to RawESSLData
    const rawDataEntry = new RawESSLData({ rawData: strDataList });
    await rawDataEntry.save();
    console.log('Raw ESSL data saved:', rawDataEntry._id);

    // Process the raw data
    const punchLogs = [];
    const processedEntries = new Set();

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      console.log(`Processing line ${index + 1}: "${line}"`);

      // Use regex to split on one or more whitespace characters and extract userId and date-time
      const parts = line.match(/^(\d+)\s+(.+)$/);
      if (!parts || parts.length < 3) {
        console.warn(`Invalid log entry format at line ${index + 1}: "${line}"`);
        continue;
      }

      const userId = parts[1];
      const dateTimeStr = parts[2].trim();

      if (!/^\d+$/.test(userId)) {
        console.warn(`Invalid userId format at line ${index + 1}: "${userId}"`);
        continue;
      }

      // Split date-time string to extract date and time
      const [dateStr, timeStr] = dateTimeStr.split(/\s+/);
      if (!dateStr || !timeStr) {
        console.warn(`Invalid date or time format at line ${index + 1}: "${dateTimeStr}"`);
        continue;
      }

      // Validate date format (YYYY-MM-DD)
      if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn(`Invalid date format at line ${index + 1}: "${dateStr}"`);
        continue;
      }

      // Validate time format (HH:mm:ss)
      if (!timeStr.match(/^(\d{2}:){2}\d{2}$/)) {
        console.warn(`Invalid time format at line ${index + 1}: "${timeStr}"`);
        continue;
      }

      // Create a Date object for the full date-time
      const logDateTime = new Date(`${dateStr}T${timeStr}Z`);
      if (isNaN(logDateTime)) {
        console.warn(`Invalid date-time format at line ${index + 1}: "${dateTimeStr}"`);
        continue;
      }

      // Create a unique key for deduplication
      const entryKey = `${userId}_${dateTimeStr}`;
      if (processedEntries.has(entryKey)) {
        console.log(`Skipping duplicate entry: userId "${userId}", dateTime "${dateTimeStr}"`);
        continue;
      }
      processedEntries.add(entryKey);

      punchLogs.push({
        UserID: userId,
        LogDate: logDateTime,
        LogTime: timeStr,
        Direction: 'in', // Default direction, adjust logic if needed
        processed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (punchLogs.length === 0) {
      console.warn('No valid punch logs to save');
      return { count: 0, message: 'No valid punch logs to process' };
    }

    // Sort logs by userId and LogDate for consistent processing
    punchLogs.sort((a, b) => {
      const aTime = new Date(`${a.LogDate.toISOString().split('T')[0]}T${a.LogTime}Z`);
      const bTime = new Date(`${b.LogDate.toISOString().split('T')[0]}T${b.LogTime}Z`);
      return a.UserID.localeCompare(b.UserID) || aTime - bTime;
    });

    // Assign directions (in/out) based on time differences
    const finalPunchLogs = [];
    const userLogs = {};

    // Group logs by userId and date
    punchLogs.forEach(log => {
      const key = `${log.UserID}_${log.LogDate.toISOString().split('T')[0]}`;
      if (!userLogs[key]) userLogs[key] = [];
      userLogs[key].push(log);
    });

    for (const key in userLogs) {
      const logs = userLogs[key];
      let lastTime = null;
      let lastDirection = null;

      for (const log of logs) {
        const currentTime = new Date(`${log.LogDate.toISOString().split('T')[0]}T${log.LogTime}Z`).getTime();
        let direction = 'in';

        if (lastTime) {
          const timeDiff = (currentTime - lastTime) / 1000; // Time difference in seconds
          if (timeDiff > 60 && lastDirection === 'in') {
            direction = 'out';
          }
        }

        finalPunchLogs.push({ ...log, Direction: direction });
        lastTime = currentTime;
        lastDirection = direction;
      }
    }

    const result = await RawPunchlog.insertMany(finalPunchLogs, { ordered: false });
    console.log(`Saved ${result.length} new punch logs to RawPunchlog`);

    // Update RawESSLData as processed
    await RawESSLData.updateOne({ _id: rawDataEntry._id }, { processed: true });

    // Process into Attendance
    await processToAttendance();

    return { count: result.length, message: 'Attendance data processed' };
  } catch (error) {
    if (error.code === 11000) {
      console.warn('Duplicate key error encountered, skipped duplicates');
      return { count: 0, message: 'Attendance data processed with duplicates skipped' };
    }
    console.error('Error in syncESSLAttendance:', error.message, error.response ? error.response.data : '');
    throw error;
  }
}

// Process RawPunchlog to Attendance
async function processToAttendance() {
  try {
    const unprocessedLogs = await RawPunchlog.find({ processed: false });
    const attendanceRecords = {};

    unprocessedLogs.forEach(log => {
      const key = `${log.UserID}_${log.LogDate.toISOString().split('T')[0]}`;
      if (!attendanceRecords[key]) {
        attendanceRecords[key] = {
          userId: log.UserID,
          LogDate: log.LogDate,
          inTime: null,
          outTime: null,
        };
      }

      if (log.Direction === 'in' && !attendanceRecords[key].inTime) {
        attendanceRecords[key].inTime = log.LogTime;
      } else if (log.Direction === 'out') {
        attendanceRecords[key].outTime = log.LogTime;
      }
    });

    const attendanceDocs = Object.values(attendanceRecords);
    for (const doc of attendanceDocs) {
      await Attendance.updateOne(
        { userId: doc.userId, LogDate: doc.LogDate },
        { $set: { inTime: doc.inTime, outTime: doc.outTime, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    await RawPunchlog.updateMany({ processed: false }, { processed: true });
    console.log(`Processed ${attendanceDocs.length} attendance records`);
  } catch (error) {
    console.error('Error processing to Attendance:', error.message);
    throw error;
  }
}

// ESSL Attendance Endpoint
app.get('/api/attendance/essl', async (req, res) => {
  try {
    const result = await syncESSLAttendance();
    res.json(result);
  } catch (error) {
    console.error('Error fetching ESSL attendance:', error.message, error.response ? error.response.data : '');
    res.status(500).send('Error fetching attendance data');
  }
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    const checkGridFS = setInterval(() => {
      if (gfsReady()) {
        clearInterval(checkGridFS);
        console.log('GridFS initialized successfully');

        // Schedule ESSL attendance sync
        cron.schedule('0 09 09 * * *', async () => {
          console.log('Running ESSL attendance sync at', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
          try {
            await syncESSLAttendance();
          } catch (error) {
            console.error('ESSL attendance sync failed:', error.message, error.response ? error.response.data : '');
          }
        }, { timezone: 'Asia/Kolkata' });
      }
    }, 100);

    setTimeout(() => {
      if (!gfsReady()) {
        console.error('GridFS failed to initialize within 10 seconds');
      }
    }, 10000);
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT} with MongoDB error`));
  });

  
  cron.schedule('12 09 * * *', async () => {
          console.log('Running processPunchLogAttendance at 11:52 AM...');
          await processPunchLogAttendance();
          console.log('processPunchLogAttendance at 11:52 AM completed.');
        }, { timezone: 'Asia/Kolkata' });


        cron.schedule('13 09 * * *', async () => {
          console.log('Running processLateArrivalStatus at 11:52 AM...');
          await processLateArrivalStatus();
          console.log('processLateArrivalStatus at 11:52 AM completed.');
        }, { timezone: 'Asia/Kolkata' });

       
        cron.schedule('14 09 * * *', async () => {
          console.log('Running  updateAttendanceWithShift at 11:52 AM...');
          await  updateAttendanceWithShift();
          console.log(' updateAttendanceWithShift at 11:52 AM completed.');
        }, { timezone: 'Asia/Kolkata' });

        

         cron.schedule('21 09 * * *', async () => {
          console.log('Running  updateAttendanceWithLeaves at 11:52 AM...');
          await  updateAttendanceWithLeaves();
          console.log(' updateAttendanceWithLeaves at 11:52 AM completed.');
        }, { timezone: 'Asia/Kolkata' });


        // Example endpoint to fetch employees with birthdays today
app.get('/api/employee-birthdays', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // e.g., "2025-08-02"
    const employees = await Employee.find({
      dateOfBirth: {
        $expr: { $eq: [{ $dayOfMonth: '$dateOfBirth' }, new Date(today).getDate()] },
        $expr: { $eq: [{ $month: '$dateOfBirth' }, new Date(today).getMonth() + 1] },
      },
    }).select('name employeeId dateOfBirth');
    res.json(employees.map(emp => ({
      name: emp.name,
      message: `🎂 Happy Birthday to ${emp.name}!`,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch birthdays' });
  }
});


 

// Socket.io Events
io.on('connection', socket => {
  console.log('User connected:', socket.id);

  const { employeeId } = socket.handshake.query;
  if (employeeId) {
    socket.join(employeeId);
    console.log(`Socket ${socket.id} joined room ${employeeId}`);
  } else {
    console.warn(`Socket ${socket.id} connected without employeeId`);
  }

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

// Remove duplicate route definitions
app.get('/', (req, res) => {
  res.send('HRMS Backend is running!');
});

app.get('/health', (req, res) => {
  res.send('OK');
});