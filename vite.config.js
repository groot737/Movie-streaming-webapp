import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_URL || "http://localhost:3001"

  const plugins = [react()];
  if (command === 'serve') {
    try {
      const basicSsl = (await import('@vitejs/plugin-basic-ssl')).default;
      plugins.push(basicSsl());
    } catch (e) {
      console.warn('SSL plugin not found, skipping SSL setup.');
    }
  }

  return {
    envPrefix: ["VITE_", "SUPABASE_"],
    plugins,
    server: {
      port: 3000,
      open: true,
      proxy: apiTarget
        ? {
          "/api": apiTarget,
        }
        : undefined,
    },
  }
})
