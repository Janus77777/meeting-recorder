import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPCRecordingStart, IPCRecordingStop, IPCRecordingError } from '@shared/types';

// Recording state
interface RecordingSession {
  isRecording: boolean;
  startTime?: Date;
  outputPath?: string;
}

let currentSession: RecordingSession = {
  isRecording: false
};

export function setupRecordingIPC(): void {
  // Get available recording devices
  ipcMain.handle('recording:getDevices', async () => {
    try {
      // Note: In a real implementation, we might need to use native modules
      // or system commands to enumerate audio devices. For now, we'll return
      // a basic structure that the renderer can use with MediaDevices API.
      
      // The actual device enumeration should happen in the renderer process
      // using navigator.mediaDevices.enumerateDevices() for web compatibility
      return {
        success: true,
        message: 'Use MediaDevices API in renderer'
      };
    } catch (error) {
      console.error('Failed to get recording devices:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Start recording
  ipcMain.handle('recording:start', async (event, params: IPCRecordingStart) => {
    try {
      if (currentSession.isRecording) {
        throw new Error('Recording already in progress');
      }

      // Generate unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${timestamp}.webm`;
      const tempDir = app.getPath('temp');
      const outputPath = path.join(tempDir, 'meeting-recorder', filename);

      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Update session state
      currentSession = {
        isRecording: true,
        startTime: new Date(),
        outputPath
      };

      console.log(`Recording started: ${outputPath}`);

      return {
        success: true,
        outputPath,
        deviceId: params.deviceId
      };

    } catch (error) {
      console.error('Failed to start recording:', error);
      
      const errorResponse: IPCRecordingError = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      return {
        success: false,
        ...errorResponse
      };
    }
  });

  // Stop recording
  ipcMain.handle('recording:stop', async () => {
    try {
      if (!currentSession.isRecording || !currentSession.outputPath || !currentSession.startTime) {
        throw new Error('No recording in progress');
      }

      const duration = Date.now() - currentSession.startTime.getTime();
      const filePath = currentSession.outputPath;

      // Reset session state
      const session = currentSession;
      currentSession = { isRecording: false };

      console.log(`Recording stopped: ${filePath}, duration: ${duration}ms`);

      const stopResult: IPCRecordingStop = {
        filePath,
        duration: Math.floor(duration / 1000) // Convert to seconds
      };

      return {
        success: true,
        ...stopResult
      };

    } catch (error) {
      console.error('Failed to stop recording:', error);
      
      // Reset state on error
      currentSession = { isRecording: false };
      
      const errorResponse: IPCRecordingError = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      return {
        success: false,
        ...errorResponse
      };
    }
  });

  // Get recording status
  ipcMain.handle('recording:getStatus', async () => {
    const duration = currentSession.isRecording && currentSession.startTime 
      ? Date.now() - currentSession.startTime.getTime()
      : 0;

    return {
      isRecording: currentSession.isRecording,
      duration: Math.floor(duration / 1000), // Convert to seconds
      outputPath: currentSession.outputPath
    };
  });

  // Save audio blob to file (called from renderer after recording)
  ipcMain.handle('recording:saveBlob', async (event, filePath: string, buffer: ArrayBuffer) => {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write buffer to file
      const uint8Array = new Uint8Array(buffer);
      fs.writeFileSync(filePath, uint8Array);

      console.log(`Audio blob saved to: ${filePath}`);

      return {
        success: true,
        filePath,
        size: uint8Array.length
      };

    } catch (error) {
      console.error('Failed to save audio blob:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Clean up temporary files
  ipcMain.handle('recording:cleanup', async (event, filePaths: string[]) => {
    try {
      let deletedCount = 0;
      
      for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      console.log(`Cleaned up ${deletedCount} temporary files`);

      return {
        success: true,
        deletedCount
      };

    } catch (error) {
      console.error('Failed to cleanup files:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get temp directory for recordings
  ipcMain.handle('recording:getTempDir', async () => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'meeting-recorder');
      
      // Ensure directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      return {
        success: true,
        tempDir
      };

    } catch (error) {
      console.error('Failed to get temp directory:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}