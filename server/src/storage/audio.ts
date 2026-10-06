import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { AudioAssetModel, type AudioAssetRecord } from '../models.js';

export interface AudioStorage {
  write(asset: AudioAssetRecord, data: Buffer, signal: AbortSignal): Promise<void>;
  read(fileId: string, start?: number, end?: number): Readable;
  remove(fileId: string): Promise<void>;
}
export class GridFsAudioStorage implements AudioStorage {
  private bucket() {
    if (!mongoose.connection.db) throw new Error('Audio storage unavailable');
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'lessonAudio' });
  }
  async write(asset: AudioAssetRecord, data: Buffer, signal: AbortSignal) {
    const upload = this.bucket().openUploadStreamWithId(
      new mongoose.mongo.ObjectId(asset.fileId),
      `${asset._id}.wav`,
      {
        metadata: {
          ownerSub: asset.ownerSub,
          courseId: asset.courseId,
          lessonId: asset.lessonId,
          enhancementId: asset.enhancementId,
          mimeType: asset.mimeType,
        },
        chunkSizeBytes: 64 * 1024,
      },
    );
    await pipeline(Readable.from([data]), upload, { signal });
  }
  read(fileId: string, start?: number, end?: number) {
    return this.bucket().openDownloadStream(new mongoose.mongo.ObjectId(fileId), { start, end });
  }
  async remove(fileId: string) {
    // Delete by a recorded internal ID, including chunks left by an interrupted upload without a files document.
    const db = mongoose.connection.db!;
    const id = new mongoose.mongo.ObjectId(fileId);
    await db.collection('lessonAudio.files').deleteOne({ _id: id });
    await db.collection('lessonAudio.chunks').deleteMany({ files_id: id });
  }
}
export async function cleanupAudio(storage: AudioStorage, now = new Date()) {
  const assets = await AudioAssetModel.find({
    $or: [{ status: 'deleting' }, { status: 'uploading', cleanupAfter: { $lte: now } }],
  })
    .limit(100)
    .lean();
  for (const asset of assets) {
    const marked = await AudioAssetModel.updateOne(
      { _id: asset._id, status: { $ne: 'ready' } },
      { $set: { status: 'deleting' } },
    );
    if (!marked.matchedCount) continue;
    try {
      await storage.remove(asset.fileId);
    } catch {
      console.error(JSON.stringify({ event: 'audio_cleanup_failed', code: 'STORAGE_UNAVAILABLE' }));
      continue;
    }
    // Keep tombstones through the bounded upload lifetime to catch late chunks, including after restart.
    if (asset.cleanupAfter <= now)
      await AudioAssetModel.deleteOne({ _id: asset._id, status: 'deleting' });
  }
}
