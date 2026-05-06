import mongoose, { Schema, Document } from 'mongoose';

export interface ITrust extends Document {
  userId: string;
  guildId: string;
  trustDate: Date;
  isActive: boolean;
}

const trustSchema = new Schema<ITrust>(
  {
    userId: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    trustDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

trustSchema.index({ userId: 1, guildId: 1 });

export const Trust = mongoose.model<ITrust>('Trust', trustSchema, 'trusts');
