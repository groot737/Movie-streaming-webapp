import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_URL || "http://localhost:3001"

  return {
    envPrefix: ["VITE_", "SUPABASE_"],
    plugins: [
      react(),
      command === 'serve' ? basicSsl() : null
    ].filter(Boolean),
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
