import mongoose, { Schema, Document } from 'mongoose';

export interface IJailedUser extends Document {
  userId: string;
  guildId: string;
  jailedAt: Date;
  reason: string;
  previousRoles: string[];
}

const jailedUserSchema = new Schema<IJailedUser>(
  {
    userId: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    jailedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      default: 'No reason provided',
    },
    previousRoles: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

jailedUserSchema.index({ userId: 1, guildId: 1 }, { unique: true });

export const JailedUser = mongoose.model<IJailedUser>('JailedUser', jailedUserSchema, 'jailedusers');
