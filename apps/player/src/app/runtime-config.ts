import { InjectionToken } from '@angular/core';

export interface PlayerRuntimeConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

declare global {
  interface Window {
    TV_ONE_CONFIG?: PlayerRuntimeConfig;
  }
}

export const PLAYER_CONFIG = new InjectionToken<PlayerRuntimeConfig>('PLAYER_CONFIG', {
  providedIn: 'root',
  factory: () => {
    const config = window.TV_ONE_CONFIG;
    if (!config?.apiBaseUrl || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('TV_ONE_CONFIG is missing. Configure the deployed player runtime-config.js.');
    }
    return {
      apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ''),
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey
    };
  }
});
