import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_URL

  return {
    envPrefix: ["VITE_", "SUPABASE_"],
    plugins: [react()],
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
