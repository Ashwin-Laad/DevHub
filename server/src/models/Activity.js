import mongoose from 'mongoose';

export const ACTIVITY_TYPES = [
  'ISSUE_CREATED',
  'ISSUE_ASSIGNED',
  'ISSUE_STATUS_CHANGED',
  'ISSUE_PRIORITY_CHANGED',
  'COMMENT_CREATED',
  'LABEL_ADDED',
];

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ACTIVITY_TYPES,
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

activitySchema.index({ project: 1, createdAt: -1 });

export const Activity = mongoose.model('Activity', activitySchema);