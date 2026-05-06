import mongoose, { Schema, Document } from 'mongoose';

export interface IBlockedWord extends Document {
  guildId: string;
  ruleName: string;
  pattern: string;
  severity: 'critical' | 'non-critical';
  createdBy: string;
  createdAt: Date;
}

const blockedWordSchema = new Schema<IBlockedWord>(
  {
    guildId: {
      type: String,
      required: true,
    },
    ruleName: {
      type: String,
      required: true,
    },
    pattern: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ['critical', 'non-critical'],
      default: 'non-critical',
      required: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

blockedWordSchema.index({ guildId: 1 });
blockedWordSchema.index({ guildId: 1, ruleName: 1 });

export const BlockedWord = mongoose.model<IBlockedWord>('BlockedWord', blockedWordSchema, 'blockedwords');
