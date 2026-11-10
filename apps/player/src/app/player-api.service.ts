import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PLAYER_CONFIG } from './runtime-config';

export interface PlayerVenue { id: string; name: string; }
export interface PlayerDevice { id: string; name: string; }
export interface PlayerMedia {
  id: string;
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  url: string;
  urlExpiresAt: string;
}
export interface PlayerConfiguration {
  serverTime: string;
  device: { id: string; name: string; venueId: string };
  assignment: null | {
    revision: number;
    startedAt: string;
    imageDurationMs: number;
    media: PlayerMedia;
  };
}

@Injectable({ providedIn: 'root' })
export class PlayerApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(PLAYER_CONFIG);
  private readonly baseUrl = this.config.apiBaseUrl;

  async venues(): Promise<PlayerVenue[]> {
    const result = await firstValueFrom(
      this.http.get<{ data: PlayerVenue[] }>(`${this.baseUrl}/api/player/venues`)
    );
    return result.data;
  }

  async devices(venueId: string): Promise<PlayerDevice[]> {
    const result = await firstValueFrom(
      this.http.get<{ data: PlayerDevice[] }>(
        `${this.baseUrl}/api/player/venues/${encodeURIComponent(venueId)}/devices`
      )
    );
    return result.data;
  }

  async configuration(deviceId: string, pairingSecret: string): Promise<PlayerConfiguration> {
    return firstValueFrom(
      this.http.post<PlayerConfiguration>(`${this.baseUrl}/api/player/config`, {
        deviceId,
        pairingSecret
      })
    );
  }
}
