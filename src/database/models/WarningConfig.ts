import mongoose, { Schema, Document } from 'mongoose';

export interface IWarningConfig extends Document {
  guildId: string;
  warnThreshold: number;
  applyBan: boolean;
  applyTimeout: boolean;
  duration: number; // in milliseconds
  createdAt: Date;
  updatedAt: Date;
}

const warningConfigSchema = new Schema<IWarningConfig>(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
    },
    warnThreshold: {
      type: Number,
      required: true,
      min: 1,
    },
    applyBan: {
      type: Boolean,
      default: false,
    },
    applyTimeout: {
      type: Boolean,
      default: false,
    },
    duration: {
      type: Number,
      default: 0, // 0 means permanent
    },
  },
  { timestamps: true }
);

warningConfigSchema.index({ guildId: 1 });

export const WarningConfig = mongoose.model<IWarningConfig>('WarningConfig', warningConfigSchema, 'warningconfigs');
