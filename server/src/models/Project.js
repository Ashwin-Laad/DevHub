import mongoose from 'mongoose';

export const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'];

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: 'ACTIVE',
    },
  },
  { timestamps: true },
);

projectSchema.index({ organization: 1, status: 1 });


//here this Project model represents a project within an organization, including its name, description, creator, and status.

//we can call different fucntion on the Project model, such as Project.find(), Project.create(), Project.findById(), etc.
export const Project = mongoose.model('Project', projectSchema);