import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

const generateToken = (userId, email) => {
  return jwt.sign(
    { id: userId, email },
    process.env.JWT_SECRET || 'secret_key_finance_tracker',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// POST /auth/register
export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, currencyCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user in MongoDB
    const user = await User.create({
      name,
      email,
      passwordHash,
      currencyCode: currencyCode || 'INR'
    });

    return res.status(201).json({
      message: 'User registered successfully. Please sign in.',
      user: user.toJSON()
    });
  } catch (err) {
    next(err);
  }
};

// POST /auth/login
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Retrieve user including the passwordHash field
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password using bcrypt method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken(user._id, user.email);

    // Set secure httpOnly cookie
    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: user.toJSON()
    });
  } catch (err) {
    next(err);
  }
};

// POST /auth/logout
export const logoutUser = (req, res) => {
  res.clearCookie('token', getCookieOptions());
  return res.status(200).json({ message: 'Logged out successfully' });
};
