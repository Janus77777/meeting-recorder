import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRecordingStore, useToastActions } from '../services/store';
import { DeviceInfo } from '@shared/types';
import { FLAGS } from '@shared/flags';

interface RecorderPanelProps {
  onRecordingComplete?: (audioBlob: Blob, duration: number) => void;
  disabled?: boolean;
  className?: string;
}

export const RecorderPanel: React.FC<RecorderPanelProps> = ({
  onRecordingComplete,
  disabled = false,
  className = ''
}) => {
  // Store hooks
  const {
    state: recordingState,
    availableDevices,
    selectedDeviceId,
    setRecording,
    setDuration,
    setVolume,
    setDevices,
    selectDevice,
    resetRecording
  } = useRecordingStore();

  const { showError, showSuccess } = useToastActions();

  // Local state
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  
  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize devices on mount
  useEffect(() => {
    initializeDevices();
    return () => {
      cleanup();
    };
  }, []);

  // Initialize available recording devices
  const initializeDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error('Media devices not supported');
      }

      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        stream.getTracks().forEach(track => track.stop());
      });

      // Get devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          kind: device.kind
        } as DeviceInfo));

      if (audioInputs.length === 0) {
        throw new Error('No audio input devices found');
      }

      setDevices(audioInputs);

    } catch (error) {
      console.error('Failed to initialize devices:', error);
      showError('無法初始化錄音設備：' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      if (!selectedDeviceId) {
        throw new Error('No device selected');
      }

      // Get media stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      // Setup MediaRecorder
      const recorder = new MediaRecorder(mediaStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const duration = recordingState.duration;
        
        if (onRecordingComplete) {
          onRecordingComplete(audioBlob, duration);
        }

        showSuccess(`錄音完成，時長 ${formatDuration(duration)}`);
        setAudioChunks(chunks);
      };

      recorder.onerror = (event) => {
        console.error('Recording error:', event);
        showError('錄音過程發生錯誤');
        stopRecording();
      };

      // Start recording
      recorder.start(1000); // Collect data every second
      setMediaRecorder(recorder);
      setStream(mediaStream);
      setRecording(true);

      // Setup audio analysis for volume visualization
      if (FLAGS.VOLUME_VISUALIZATION) {
        setupVolumeAnalysis(mediaStream);
      }

      // Start timer
      startTimer();

      // Notify IPC (optional, for future system integration)
      if (window.electronAPI) {
        await window.electronAPI.recording.start({ deviceId: selectedDeviceId });
      }

    } catch (error) {
      console.error('Failed to start recording:', error);
      showError('開始錄音失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      // Stop MediaRecorder
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }

      // Stop all tracks
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

      // Clean up audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
      }

      // Stop timer and volume animation
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      setRecording(false);
      setVolume(0);
      setMediaRecorder(null);

      // Notify IPC
      if (window.electronAPI) {
        await window.electronAPI.recording.stop();
      }

    } catch (error) {
      console.error('Failed to stop recording:', error);
      showError('停止錄音失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  }, [mediaRecorder, stream, setRecording, setVolume, showError]);

  // Setup volume analysis
  const setupVolumeAnalysis = (mediaStream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(mediaStream);
      
      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;
      
      microphone.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      updateVolume();
    } catch (error) {
      console.error('Failed to setup volume analysis:', error);
    }
  };

  // Update volume level
  const updateVolume = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    
    const rms = Math.sqrt(sum / bufferLength);
    const volume = Math.min(100, (rms / 128) * 100);
    
    setVolume(volume);
    
    if (recordingState.isRecording) {
      animationRef.current = requestAnimationFrame(updateVolume);
    }
  };

  // Timer for recording duration
  const startTimer = () => {
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((prev: number) => prev + 1);
    }, 1000);
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup function
  const cleanup = () => {
    if (recordingState.isRecording) {
      stopRecording();
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  // Toggle recording
  const toggleRecording = () => {
    if (recordingState.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      {/* Device Selection */}
      {FLAGS.DEVICE_SELECTION && availableDevices.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            錄音設備
          </label>
          <select
            value={selectedDeviceId || ''}
            onChange={(e) => selectDevice(e.target.value)}
            disabled={recordingState.isRecording || disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Recording Controls */}
      <div className="flex items-center justify-center mb-4">
        <button
          onClick={toggleRecording}
          disabled={disabled || !selectedDeviceId}
          className={`
            flex items-center justify-center w-16 h-16 rounded-full text-white font-semibold
            transition-all duration-200 hover:scale-105 active:scale-95
            ${recordingState.isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-blue-500 hover:bg-blue-600'
            }
            disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:scale-100
          `}
        >
          {recordingState.isRecording ? (
            <div className="w-4 h-4 bg-white rounded-sm"></div>
          ) : (
            <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-1"></div>
          )}
        </button>
      </div>

      {/* Recording Status */}
      <div className="text-center mb-4">
        <div className="text-2xl font-mono font-bold text-gray-800">
          {formatDuration(recordingState.duration)}
        </div>
        <div className="text-sm text-gray-500">
          {recordingState.isRecording ? '錄音中...' : '準備錄音'}
        </div>
      </div>

      {/* Volume Visualization */}
      {FLAGS.VOLUME_VISUALIZATION && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">音量</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-100"
              style={{ width: `${recordingState.volume}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Recording Tips */}
      {!recordingState.isRecording && (
        <div className="text-xs text-gray-500 text-center">
          <p>點擊按鈕開始錄音</p>
          <p>確保麥克風權限已開啟</p>
        </div>
      )}
    </div>
  );
};