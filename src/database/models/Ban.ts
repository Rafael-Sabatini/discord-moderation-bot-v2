import mongoose, { Schema, Document } from 'mongoose';

export interface IBan extends Document {
  userId: string;
  guildId: string;
  moderatorId: string;
  reason: string;
  banDate: Date;
  expiryDate: Date | null;
  isPermanent: boolean;
  isActive: boolean;
}

const banSchema = new Schema<IBan>(
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
    banDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    isPermanent: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

banSchema.index({ userId: 1, guildId: 1 });
banSchema.index({ expiryDate: 1 }, { sparse: true });

export const Ban = mongoose.model<IBan>('Ban', banSchema, 'bans');
