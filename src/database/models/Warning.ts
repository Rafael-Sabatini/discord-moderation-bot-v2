import mongoose, { Schema, Document } from 'mongoose';

export interface IWarning extends Document {
  userId: string;
  guildId: string;
  moderatorId: string;
  reason: string;
  timestamp: Date;
}

const warningSchema = new Schema<IWarning>(
  {
    userId: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    moderatorId: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

warningSchema.index({ userId: 1, guildId: 1 });

export const Warning = mongoose.model<IWarning>('Warning', warningSchema, 'warnings');
