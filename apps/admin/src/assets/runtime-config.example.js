// Copy to runtime-config.js in the deployed static assets.
// These values are public browser configuration. Never put service-role
// keys, database passwords, or other server secrets in this file.
window.TV_ONE_CONFIG = Object.freeze({
  apiBaseUrl: 'https://YOUR-RENDER-SERVICE.onrender.com',
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-SUPABASE-ANON-KEY'
});
