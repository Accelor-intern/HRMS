import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Employee from '../models/Employee.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter: Max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests
  message: {
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expect "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded token (contains id, loginType, employeeId)
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// POST /api/auth/login - Login an employee
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await Employee.findOne({ email }).populate('department');
    console.log('Found user:', user);
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, loginType: user.loginType, employeeId: user.employeeId },
      process.env.JWT_SECRET,
      { expiresIn: '100h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        loginType: user.loginType,
        name: user.name,
        employeeId: user.employeeId,
        email: user.email,
        department: user.department ? { _id: user.department._id, name: user.department.name } : null,
        designation: user.designation,
        role: user.loginType, // Added role
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me - Get authenticated employee's details
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id)
      .select('_id loginType name email employeeId gender department designation employeeType profilePicture')
      .populate('department');
    if (!user) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json({
      id: user._id,
      loginType: user.loginType,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      gender: user.gender,
      department: user.department ? { _id: user.department._id, name: user.department.name } : null,
      designation: user.designation,
      employeeType: user.employeeType,
      profilePicture: user.profilePicture, //Added Profile Picture
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
