import { 
  CreateMeetingRequest, 
  CreateMeetingResponse,
  UploadAudioResponse,
  CompleteResponse,
  StatusResponse,
  ResultResponse,
  AppSettings
} from '@shared/types';

// Mock data import
import mockMeeting from './mock/meeting.json';

class APIClient {
  private settings: AppSettings;
  private mockData: any;

  constructor(settings: AppSettings) {
    this.settings = settings;
    this.mockData = mockMeeting;
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    // Handle mock mode
    if (this.settings.useMock) {
      return this.handleMockRequest<T>(endpoint, options);
    }

    // Real API request
    const url = `${this.settings.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.settings.apiKey}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async handleMockRequest<T>(endpoint: string, options: RequestInit): Promise<T> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const method = options.method || 'GET';
    
    // Mock responses based on endpoint and method
    if (method === 'POST' && endpoint === '/api/meetings') {
      return {
        id: this.mockData.meeting.id,
        createdAt: new Date().toISOString()
      } as T;
    }

    if (method === 'POST' && endpoint.includes('/audio')) {
      return { ok: true } as T;
    }

    if (method === 'POST' && endpoint.includes('/complete')) {
      return { status: 'queued' } as T;
    }

    if (method === 'GET' && endpoint.includes('/status')) {
      // Simulate status progression
      const statuses = ['queued', 'stt', 'summarize', 'done'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      return { 
        status: randomStatus,
        progress: randomStatus === 'done' ? 100 : Math.floor(Math.random() * 80) + 20
      } as T;
    }

    if (method === 'GET' && endpoint.includes('/result')) {
      return this.mockData as T;
    }

    throw new Error(`Mock endpoint not implemented: ${method} ${endpoint}`);
  }

  // API Methods
  async createMeeting(request: CreateMeetingRequest): Promise<CreateMeetingResponse> {
    return this.makeRequest<CreateMeetingResponse>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  async uploadAudio(meetingId: string, audioFile: File): Promise<UploadAudioResponse> {
    const formData = new FormData();
    formData.append('file', audioFile);

    return this.makeRequest<UploadAudioResponse>(`/api/meetings/${meetingId}/audio`, {
      method: 'POST',
      body: formData,
      headers: {} // Let browser set Content-Type for FormData
    });
  }

  async completeMeeting(meetingId: string): Promise<CompleteResponse> {
    return this.makeRequest<CompleteResponse>(`/api/meetings/${meetingId}/complete`, {
      method: 'POST'
    });
  }

  async getMeetingStatus(meetingId: string): Promise<StatusResponse> {
    return this.makeRequest<StatusResponse>(`/api/meetings/${meetingId}/status`);
  }

  async getMeetingResult(meetingId: string): Promise<ResultResponse> {
    return this.makeRequest<ResultResponse>(`/api/meetings/${meetingId}/result`);
  }

  // Polling helper for status updates
  async pollMeetingStatus(
    meetingId: string, 
    onUpdate?: (status: StatusResponse) => void,
    intervalMs: number = 2000,
    maxAttempts: number = 150 // 5 minutes with 2s intervals
  ): Promise<StatusResponse> {
    let attempts = 0;
    
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          attempts++;
          const status = await this.getMeetingStatus(meetingId);
          
          if (onUpdate) {
            onUpdate(status);
          }

          if (status.status === 'done' || status.status === 'failed') {
            resolve(status);
            return;
          }

          if (attempts >= maxAttempts) {
            reject(new Error('Polling timeout: Meeting processing took too long'));
            return;
          }

          setTimeout(poll, intervalMs);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}

// Global API client instance
let apiClient: APIClient | null = null;

export const initializeAPI = (settings: AppSettings): APIClient => {
  apiClient = new APIClient(settings);
  return apiClient;
};

export const getAPI = (): APIClient => {
  if (!apiClient) {
    throw new Error('API client not initialized. Call initializeAPI first.');
  }
  return apiClient;
};

export const updateAPISettings = (settings: AppSettings): void => {
  if (apiClient) {
    apiClient.updateSettings(settings);
  }
};