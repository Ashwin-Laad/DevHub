import mongoose from 'mongoose';
import { User } from '../models/User.js';


//here it defines a service function to fetch a user by their ID from the database
export async function getUserById(userId) {
  if (!userId || !mongoose.isObjectIdOrHexString(userId)) {
    return null;
  }

  return User.findById(userId);
}