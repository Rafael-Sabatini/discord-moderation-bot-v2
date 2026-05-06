import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageLog extends Document {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorTag: string;
  content: string;
  action: 'deleted' | 'edited';
  actionBy?: string; // User ID of who deleted/edited
  actionByTag?: string; // Tag of who deleted/edited
  oldContent?: string; // For edited messages
  newContent?: string; // For edited messages
  createdAt: Date;
  updatedAt: Date;
}

const messageLogSchema = new Schema<IMessageLog>(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    authorId: {
      type: String,
      required: true,
    },
    authorTag: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ['deleted', 'edited'],
      required: true,
    },
    actionBy: {
      type: String,
    },
    actionByTag: {
      type: String,
    },
    oldContent: {
      type: String,
    },
    newContent: {
      type: String,
    },
  },
  { timestamps: true }
);

export const MessageLog = mongoose.model<IMessageLog>('MessageLog', messageLogSchema);
