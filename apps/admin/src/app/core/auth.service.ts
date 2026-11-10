import { Injectable, computed, inject, signal } from '@angular/core';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { TV_ONE_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(TV_ONE_CONFIG);
  private readonly client: SupabaseClient = createClient(
    this.config.supabaseUrl,
    this.config.supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );

  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isLoading = signal(true);

  constructor() {
    void this.restoreSession();
    this.client.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      this.isLoading.set(false);
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    this.user.set(data.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
    this.user.set(null);
  }

  async accessToken(): Promise<string | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session?.access_token ?? null;
  }

  private async restoreSession(): Promise<void> {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.user.set(data.session?.user ?? null);
    } catch {
      this.user.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }
}
