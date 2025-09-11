import { getAPI } from './api';
import { MeetingJob } from '@shared/types';
import { FLAGS } from '@shared/flags';

export interface UploadProgress {
  progress: number;
  stage: 'uploading' | 'processing' | 'completed' | 'error';
  message?: string;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  chunkSize?: number; // For future chunked upload
}

export class Uploader {
  private api = getAPI();

  // MVP: Simple file upload
  async uploadMeeting(
    title: string,
    participants: string[],
    audioFile: File,
    options: UploadOptions = {}
  ): Promise<MeetingJob> {
    const { onProgress } = options;

    try {
      // Stage 1: Create meeting
      onProgress?.({
        progress: 10,
        stage: 'uploading',
        message: '建立會議記錄...'
      });

      const meeting = await this.api.createMeeting({
        title,
        participants,
        options: {
          language: 'zh-TW'
        }
      });

      // Stage 2: Upload audio
      onProgress?.({
        progress: 30,
        stage: 'uploading',
        message: '上傳音檔...'
      });

      await this.api.uploadAudio(meeting.id, audioFile);

      // Stage 3: Complete and start processing
      onProgress?.({
        progress: 50,
        stage: 'processing',
        message: '開始處理...'
      });

      await this.api.completeMeeting(meeting.id);

      // Create job object
      const job: MeetingJob = {
        id: meeting.id,
        meetingId: meeting.id,
        filename: audioFile.name,
        title,
        participants,
        status: 'queued',
        progress: 60,
        createdAt: meeting.createdAt,
        audioFile: audioFile.name
      };

      // Stage 4: Start polling for status
      onProgress?.({
        progress: 60,
        stage: 'processing',
        message: '等待處理結果...'
      });

      // Start polling in background
      this.pollMeetingProgress(job, onProgress);

      return job;

    } catch (error) {
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: error instanceof Error ? error.message : '上傳失敗'
      });
      throw error;
    }
  }

  // Background polling for meeting progress
  private async pollMeetingProgress(
    job: MeetingJob,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    try {
      const finalStatus = await this.api.pollMeetingStatus(
        job.id,
        (status) => {
          // Update progress based on status
          let progress = 60;
          let message = '';

          switch (status.status) {
            case 'queued':
              progress = 60;
              message = '排隊處理中...';
              break;
            case 'stt':
              progress = 70;
              message = '語音轉文字中...';
              break;
            case 'summarize':
              progress = 85;
              message = '生成摘要中...';
              break;
            case 'done':
              progress = 100;
              message = '處理完成';
              break;
            case 'failed':
              progress = 0;
              message = '處理失敗';
              break;
          }

          onProgress?.({
            progress,
            stage: status.status === 'done' ? 'completed' : 
                   status.status === 'failed' ? 'error' : 'processing',
            message
          });
        }
      );

      if (finalStatus.status === 'done') {
        onProgress?.({
          progress: 100,
          stage: 'completed',
          message: '轉錄完成！'
        });
      } else if (finalStatus.status === 'failed') {
        onProgress?.({
          progress: 0,
          stage: 'error',
          message: '處理失敗，請重試'
        });
      }

    } catch (error) {
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: error instanceof Error ? error.message : '處理失敗'
      });
    }
  }

  // TODO: Implement chunked upload for large files
  async chunkUpload(
    meetingId: string, 
    audioFile: File,
    options: UploadOptions = {}
  ): Promise<void> {
    if (!FLAGS.CHUNK_UPLOAD) {
      throw new Error('Chunked upload is not enabled');
    }
    
    // TODO: Implement chunked upload logic
    // - Split file into chunks
    // - Upload chunks with retry logic
    // - Handle resume/continuation
    throw new Error('Chunked upload not implemented yet');
  }

  // Retry upload helper
  async retryUpload(
    job: MeetingJob,
    audioFile: File,
    options: UploadOptions = {}
  ): Promise<MeetingJob> {
    return this.uploadMeeting(
      job.title,
      job.participants,
      audioFile,
      options
    );
  }
}

// Export singleton instance
export const uploader = new Uploader();