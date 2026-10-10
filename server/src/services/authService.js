import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;

export class AuthServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new AuthServiceError('Authentication is not configured.', 'INTERNAL_SERVER_ERROR');
  }

  return process.env.JWT_SECRET;
}

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function registerUser({ name, email, password }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedName) {
    throw new AuthServiceError('Name is required.', 'BAD_USER_INPUT');
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new AuthServiceError('A valid email address is required.', 'BAD_USER_INPUT');
  }

  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES
  ) {
    throw new AuthServiceError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters and no more than ${PASSWORD_MAX_BYTES} UTF-8 bytes.`,
      'BAD_USER_INPUT',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
    });

    return toPublicUser(user);
  } catch (error) {
    if (error?.code === 11000 && (error?.keyPattern?.email || error?.keyValue?.email)) {
      throw new AuthServiceError('An account with this email already exists.', 'BAD_USER_INPUT');
    }

    throw error;
  }
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = EMAIL_PATTERN.test(normalizedEmail)
    ? await User.findOne({ email: normalizedEmail }).select('+passwordHash')
    : null;

  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthServiceError('Invalid email or password.', 'UNAUTHENTICATED');
  }

  const token = jwt.sign(
    { sub: user._id.toString() },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
  );

  return { token, user: toPublicUser(user) };
}