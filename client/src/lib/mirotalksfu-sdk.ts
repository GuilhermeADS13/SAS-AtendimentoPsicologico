/**
 * MiroTalk SFU SDK Integration
 * Wrapper para facilitar integração com MiroTalk SFU backend
 */

export interface MiroTalkConfig {
  apiUrl: string;
  apiKey?: string;
  debug?: boolean;
}

export interface RoomOptions {
  roomId: string;
  displayName: string;
  email?: string;
  avatar?: string;
  isPresenter?: boolean;
}

export interface RoomInfo {
  roomId: string;
  roomUrl: string;
  iframeUrl: string;
  apiUrl: string;
}

export class MiroTalkSFUSDK {
  private config: MiroTalkConfig;

  constructor(config: MiroTalkConfig) {
    this.config = {
      debug: false,
      ...config,
    };
  }

  /**
   * Gera URL para entrar em uma sala
   */
  getRoomUrl(roomId: string): string {
    return `${this.config.apiUrl}/join/${roomId}`;
  }

  /**
   * Gera URL do iframe para embutir a sala
   */
  getIframeUrl(roomId: string): string {
    return `${this.config.apiUrl}/join/${roomId}`;
  }

  /**
   * Cria uma nova sala
   */
  async createRoom(roomId: string): Promise<RoomInfo> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify({ roomId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create room: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        roomId,
        roomUrl: this.getRoomUrl(roomId),
        iframeUrl: this.getIframeUrl(roomId),
        apiUrl: this.config.apiUrl,
      };
    } catch (error) {
      if (this.config.debug) console.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Obtém informações da sala
   */
  async getRoomInfo(roomId: string): Promise<RoomInfo> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/rooms/${roomId}`, {
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get room info: ${response.statusText}`);
      }

      return {
        roomId,
        roomUrl: this.getRoomUrl(roomId),
        iframeUrl: this.getIframeUrl(roomId),
        apiUrl: this.config.apiUrl,
      };
    } catch (error) {
      if (this.config.debug) console.error('Error getting room info:', error);
      throw error;
    }
  }

  /**
   * Fecha/deleta uma sala
   */
  async closeRoom(roomId: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/rooms/${roomId}`, {
        method: 'DELETE',
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to close room: ${response.statusText}`);
      }
    } catch (error) {
      if (this.config.debug) console.error('Error closing room:', error);
      throw error;
    }
  }

  /**
   * Inicia gravação da sala
   */
  async startRecording(roomId: string): Promise<{ recordingId: string }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/rooms/${roomId}/recording/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to start recording: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (this.config.debug) console.error('Error starting recording:', error);
      throw error;
    }
  }

  /**
   * Para gravação da sala
   */
  async stopRecording(roomId: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/rooms/${roomId}/recording/stop`, {
        method: 'POST',
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to stop recording: ${response.statusText}`);
      }
    } catch (error) {
      if (this.config.debug) console.error('Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * Obtém lista de participantes
   */
  async getParticipants(roomId: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/rooms/${roomId}/participants`, {
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get participants: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (this.config.debug) console.error('Error getting participants:', error);
      return [];
    }
  }
}
