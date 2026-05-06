import mongoose, { Schema, Document } from 'mongoose';

export interface IMute extends Document {
  userId: string;
  guildId: string;
  moderatorId: string;
  reason: string;
  muteDate: Date;
  expiryDate: Date | null;
  isPermanent: boolean;
  isActive: boolean;
}

const muteSchema = new Schema<IMute>(
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
    muteDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    isPermanent: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

muteSchema.index({ userId: 1, guildId: 1 });
muteSchema.index({ expiryDate: 1 }, { sparse: true });

export const Mute = mongoose.model<IMute>('Mute', muteSchema, 'mutes');
