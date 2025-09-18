export type CaptureSource = 'display' | 'virtual-device' | 'loopback' | 'none';

export interface SystemAudioCaptureResult {
  stream: MediaStream | null;
  source: CaptureSource;
  warnings: string[];
  error?: string;
}

export interface SystemAudioCaptureOptions {
  platform?: NodeJS.Platform | 'unknown';
  /**
   * When true, try display capture first. macOS requires this to grab system audio.
   */
  preferDisplayCapture?: boolean;
  /**
   * Provide a way to log diagnostic messages without coupling to UI.
   */
  logger?: (message: string, data?: unknown) => void;
}

export interface MicrophoneCaptureOptions {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  logger?: (message: string, data?: unknown) => void;
}

const SYSTEM_AUDIO_KEYWORDS = [
  'stereo mix',
  '立體聲混音',
  'what u hear',
  'loopback',
  'cable',
  'voicemeeter',
  'virtual',
  'system'
];

const log = (logger?: (message: string, data?: unknown) => void, message?: string, data?: unknown) => {
  if (logger && message) {
    logger(message, data);
  } else if (message) {
    console.log(message, data ?? '');
  }
};

export const requestMicrophoneStream = async (
  options: MicrophoneCaptureOptions = {}
): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('瀏覽器不支援音訊擷取');
  }

  const {
    deviceId,
    echoCancellation = true,
    noiseSuppression = true,
    autoGainControl = true,
    sampleRate = 44100
  } = options;

  log(options.logger, '🎙️ 正在請求麥克風串流');

  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId,
      echoCancellation,
      noiseSuppression,
      autoGainControl,
      sampleRate
    },
    video: false
  });
};

export const requestSystemAudioStream = async (
  options: SystemAudioCaptureOptions = {}
): Promise<SystemAudioCaptureResult> => {
  const platform = options.platform ?? 'unknown';
  const preferDisplayCapture = options.preferDisplayCapture ?? platform === 'darwin';
  const warnings: string[] = [];

  // Try display capture (works on macOS and modern Windows builds)
  if (preferDisplayCapture && navigator.mediaDevices?.getDisplayMedia) {
    try {
      log(options.logger, '🖥️ 嘗試透過螢幕錄製取得系統聲音');
      const displayConstraints: DisplayMediaStreamOptions = {
        audio: true,
        video: {
          width: 1,
          height: 1,
          frameRate: 1
        }
      };

      // On Windows we prefer audio only, but some platforms require video flag
      if (platform !== 'darwin') {
        displayConstraints.video = false;
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      const audioTracks = displayStream.getAudioTracks();

      if (audioTracks.length > 0) {
        log(options.logger, '✅ 已取得螢幕音訊軌道', audioTracks.map(track => ({
          id: track.id,
          label: track.label,
          kind: track.kind
        })));

        // Stop all video tracks immediately – we only care about audio
        displayStream.getVideoTracks().forEach(track => track.stop());

        const audioStream = new MediaStream();
        audioTracks.forEach(track => audioStream.addTrack(track));

        return {
          stream: audioStream,
          source: 'display',
          warnings
        };
      }

      warnings.push('螢幕錄製未提供任何音訊軌道');
      displayStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`螢幕錄製失敗：${message}`);
      log(options.logger, '❌ 螢幕錄製取得系統聲音失敗', error);
    }
  }

  // Fallback: look for virtual/loopback audio input devices (primarily Windows)
  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      const virtualDevice = audioInputs.find(device => {
        const label = device.label.toLowerCase();
        return SYSTEM_AUDIO_KEYWORDS.some(keyword => label.includes(keyword));
      });

      if (virtualDevice) {
        log(options.logger, '🎧 使用虛擬音訊設備擷取系統聲音', virtualDevice.label);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: virtualDevice.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        });

        return {
          stream,
          source: 'virtual-device',
          warnings
        };
      }

      warnings.push('未偵測到虛擬音訊或立體聲混音設備');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`偵測音訊設備失敗：${message}`);
      log(options.logger, '❌ 偵測音訊設備失敗', error);
    }
  } else {
    warnings.push('當前環境不支援裝置偵測');
  }

  return {
    stream: null,
    source: 'none',
    warnings,
    error: warnings[warnings.length - 1]
  };
};

export const mergeMediaStreams = (streams: MediaStream[]): MediaStream => {
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  streams.forEach(stream => {
    if (stream.getAudioTracks().length > 0) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
    }
  });

  return destination.stream;
};

export const stopStream = (stream: MediaStream | null | undefined): void => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach(track => {
    track.stop();
  });
};
