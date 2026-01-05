import { defineConfig } from 'vite'
import { createVuePlugin } from 'vite-plugin-vue2'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    createVuePlugin()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 3000,
    open: !process.env.CI
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'ForfaceMeshEditor',
      fileName: (format) => `forface-mesh-editor.${format}.js`
    },
    rollupOptions: {
      external: ['vue', 'element-ui', 'three'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
          'element-ui': 'ElementUI',
          three: 'THREE'
        }
      }
    }
  }
})
