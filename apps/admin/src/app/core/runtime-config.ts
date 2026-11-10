import { InjectionToken } from '@angular/core';

export interface TvOneRuntimeConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

declare global {
  interface Window {
    TV_ONE_CONFIG?: TvOneRuntimeConfig;
  }
}

export const TV_ONE_CONFIG = new InjectionToken<TvOneRuntimeConfig>('TV_ONE_CONFIG', {
  providedIn: 'root',
  factory: () => {
    const config = window.TV_ONE_CONFIG;

    if (!config?.apiBaseUrl || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error(
        'TV_ONE_CONFIG is missing. Configure the deployed runtime-config.js with the production API URL and Supabase public credentials.'
      );
    }

    return {
      apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ''),
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey
    };
  }
});
