import mongoose from 'mongoose';

export const ISSUE_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
export const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const issueSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    //not required, can be null if no one is assigned
    //can be changed by the project members
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ISSUE_STATUSES,
      default: 'TODO',
    },
    priority: {
      type: String,
      enum: ISSUE_PRIORITIES,
      default: 'MEDIUM',
    },
  },
  { timestamps: true },
);

issueSchema.index({ project: 1, status: 1 });

export const Issue = mongoose.model('Issue', issueSchema);