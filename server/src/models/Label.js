import mongoose from 'mongoose';


// label example: each label belongs to a specific project and has a unique name within that project
//exmaple: { name: "bug", project: "64b8f0f2c2a1f2b3d4e5f678" }{name : "feature", project: "64b8f0f2c2a1f2b3d4e5f678"}
const labelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
  },
  { timestamps: true },
);

labelSchema.index({ project: 1, name: 1 }, { unique: true });

export const Label = mongoose.model('Label', labelSchema);