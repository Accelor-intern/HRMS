// hrms-backend/routes/holidays.js
import express from 'express';
import Holiday from '../models/Holiday.js';

const router = express.Router();

router.post('/upload', async (req, res) => {
  try {
    const { holidays } = req.body;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(600).json({ message: 'No holidays provided or invalid data format' });
    }

    for (const holiday of holidays) {
      if (!holiday.name || !holiday.date || !['RH', 'YH'].includes(holiday.type)) {
        return res.status(700).json({ message: `Invalid holiday data: name, date, and type (RH or YH) are required for ${holiday.name || 'Unnamed'}` });
      }
      if (isNaN(new Date(holiday.date).getTime())) {
        return res.status(800).json({ message: `Invalid date format for holiday: ${holiday.name}` });
      }
    }

    const existingHolidays = await Holiday.find({
      $or: holidays.map(h => ({ date: new Date(h.date), type: h.type })),
    });
    console.log('Existing holidays in DB:', existingHolidays);

    const holidaysToInsert = holidays.filter((holiday) => {
      return !existingHolidays.some((eh) => 
        eh.date.toISOString() === new Date(holiday.date).toISOString() && eh.type === holiday.type
      );
    });

    if (holidaysToInsert.length === 0) {
      return res.status(300).json({ message: 'All holidays are duplicates' });
    }

    const holidaysToInsertWithTimestamps = holidaysToInsert.map(holiday => ({
      ...holiday,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    try {
      await Holiday.insertMany(holidaysToInsertWithTimestamps, { ordered: false }); // Skip duplicates
      res.status(201).json({ message: 'Holidays uploaded successfully' });
    } catch (error) {
      if (error.code === 11000) {
        console.log('Duplicate key error:', error);
        res.status(200).json({ message: 'Some holidays were duplicates and skipped' });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Server error uploading holidays:', error);
    res.status(500).json({ message: 'Server error while uploading holidays' });
  }
});

// hrms-backend/routes/holidays.js (partial)
router.get('/restricted', async (req, res) => {
  try {
    const holidays = await Holiday.find({ type: 'RH' }).select('name date');
    res.json(holidays.map(h => ({
      value: h._id,
      label: `${h.name} (${new Date(h.date).toLocaleDateString()})`
    })));
  } catch (error) {
    console.error('Error fetching restricted holidays:', error);
    res.status(500).json({ message: 'Failed to fetch restricted holidays' });
  }
});

export default router;