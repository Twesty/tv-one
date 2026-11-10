import { Injectable, inject } from '@angular/core';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { PLAYER_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class PlayerRealtimeService {
  private readonly config = inject(PLAYER_CONFIG);
  private readonly client: SupabaseClient = createClient(
    this.config.supabaseUrl,
    this.config.supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );
  private channel: RealtimeChannel | null = null;

  subscribe(deviceId: string, onAssignmentUpdate: () => void): void {
    this.unsubscribe();
    this.channel = this.client
      .channel(`device:${deviceId}`)
      .on('broadcast', { event: 'assignment-updated' }, () => onAssignmentUpdate())
      .subscribe();
  }

  unsubscribe(): void {
    if (this.channel) {
      void this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
