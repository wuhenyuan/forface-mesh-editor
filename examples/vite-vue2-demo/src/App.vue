<template>
  <div id="app">
    <EditorLayout :config="config" />
  </div>
</template>

<script>
import EditorLayout from 'forface-mesh-editor';
import demoConfig from './demo-config';

export default {
  name: 'App',
  components: { EditorLayout },
  data() {
    return {
      config: demoConfig,
    };
  },
};
</script>

<style>
html,
body,
#app {
  height: 100%;
  overflow: hidden;
}
body {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans',
    'Droid Sans', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
}
</style>

