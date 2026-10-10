import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'ISSUE_ASSIGNED',
  'COMMENT_CREATED',
  'ISSUE_UPDATED',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    relatedIssue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);