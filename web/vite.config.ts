import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:phone` serves over HTTPS on the LAN so a phone can use its camera.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [basicSsl()] : [],
  build: {
    target: 'es2022',
    cssMinify: true,
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
  },
}))
