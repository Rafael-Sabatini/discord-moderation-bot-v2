import mongoose, { Schema, Document } from 'mongoose';

export interface IServermute extends Document {
  userId: string;
  guildId: string;
  mutedDate: Date;
  expiryDate: Date | null;
  isPermanent: boolean;
  isActive: boolean;
}

const servermutedSchema = new Schema<IServermute>(
  {
    userId: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    mutedDate: {
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

servermutedSchema.index({ userId: 1, guildId: 1 });
servermutedSchema.index({ expiryDate: 1 }, { sparse: true });

export const Servermute = mongoose.model<IServermute>('Servermute', servermutedSchema, 'servermutes');
