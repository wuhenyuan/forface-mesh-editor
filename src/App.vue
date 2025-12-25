<template>
  <div id="app">
    <editor-layout />
  </div>
</template>

<script>
import EditorLayout from './components/EditorLayout.vue'
export default {
  name: 'App',
  components: { EditorLayout }
}
</script>

<style>
html, body, #app {
  height: 100%;
}
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
}
</style>
