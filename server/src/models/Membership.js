import mongoose from 'mongoose';

export const MEMBERSHIP_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER'];

const membershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    role: {
      type: String,
      enum: MEMBERSHIP_ROLES,
      required: true,
    },
  },
  { timestamps: true },
);

membershipSchema.index({ user: 1, organization: 1 }, { unique: true });

export const Membership = mongoose.model('Membership', membershipSchema);
