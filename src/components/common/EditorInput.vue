<template>
  <el-input
    ref="input"
    :value="innerValue"
    v-bind="inputAttrs"
    v-on="passthroughListeners"
    @input="handleInput"
    @change="handleChange"
  />
</template>

<script>
export default {
  name: 'EditorInput',
  inheritAttrs: false,
  model: {
    prop: 'value',
    event: 'input',
  },
  props: {
    value: {
      type: [String, Number],
      default: '',
    },
    confirmOnEnter: {
      type: Boolean,
      default: true,
    },
    disableEnterConfirmWhenEmpty: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      innerValue: this.value == null ? '' : String(this.value),
      nativeInputEl: null,
      blurTriggeredByEnter: false,
    };
  },
  computed: {
    inputAttrs() {
      return { ...this.$attrs };
    },
    passthroughListeners() {
      const listeners = { ...this.$listeners };
      delete listeners.input;
      delete listeners.change;
      delete listeners.blur;
      return listeners;
    },
  },
  watch: {
    value(nextValue) {
      this.innerValue = nextValue == null ? '' : String(nextValue);
    },
  },
  mounted() {
    this.bindNativeEvents();
  },
  updated() {
    this.bindNativeEvents();
  },
  beforeDestroy() {
    this.unbindNativeEvents();
  },
  methods: {
    focus() {
      const inputComp = this.$refs.input;
      if (inputComp && typeof inputComp.focus === 'function') {
        inputComp.focus();
        return;
      }
      if (this.nativeInputEl && typeof this.nativeInputEl.focus === 'function') {
        this.nativeInputEl.focus();
      }
    },
    blur() {
      const inputComp = this.$refs.input;
      if (inputComp && typeof inputComp.blur === 'function') {
        inputComp.blur();
        return;
      }
      if (this.nativeInputEl && typeof this.nativeInputEl.blur === 'function') {
        this.nativeInputEl.blur();
      }
    },
    select() {
      const inputComp = this.$refs.input;
      if (inputComp && typeof inputComp.select === 'function') {
        inputComp.select();
        return;
      }
      if (this.nativeInputEl && typeof this.nativeInputEl.select === 'function') {
        this.nativeInputEl.select();
      }
    },
    bindNativeEvents() {
      const inputComp = this.$refs.input;
      if (!inputComp || !inputComp.$el) {
        return;
      }

      const nextInputEl = inputComp.$el.querySelector('input, textarea');
      if (!nextInputEl || nextInputEl === this.nativeInputEl) {
        return;
      }

      this.unbindNativeEvents();
      this.nativeInputEl = nextInputEl;
      this.nativeInputEl.addEventListener('keydown', this.handleNativeKeydown, true);
      this.nativeInputEl.addEventListener('blur', this.handleNativeBlur, true);
    },
    unbindNativeEvents() {
      if (!this.nativeInputEl) {
        return;
      }

      this.nativeInputEl.removeEventListener('keydown', this.handleNativeKeydown, true);
      this.nativeInputEl.removeEventListener('blur', this.handleNativeBlur, true);
      this.nativeInputEl = null;
    },
    handleNativeKeydown(event) {
      if (!this.confirmOnEnter) {
        return;
      }
      if (event.key !== 'Enter') {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      const currentValue = this.innerValue == null ? '' : String(this.innerValue);
      if (this.disableEnterConfirmWhenEmpty && currentValue.trim() === '') {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      this.blurTriggeredByEnter = true;
      event.target.blur();
    },
    handleNativeBlur(event) {
      const triggeredByEnter = this.blurTriggeredByEnter;
      if (triggeredByEnter) {
        this.blurTriggeredByEnter = false;
      }
      this.$emit('blur', event);

      this.$nextTick(() => {
        if (this.nativeInputEl) {
          this.innerValue = this.nativeInputEl.value;
        }

        if (triggeredByEnter) {
          this.$emit('enter', this.innerValue);
          return;
        }
        this.$emit('confirm', this.innerValue);
      });
    },
    handleInput(value) {
      this.innerValue = value == null ? '' : String(value);
      this.$emit('input', this.innerValue);
    },
    handleChange(value) {
      this.innerValue = value == null ? '' : String(value);
      this.$emit('change', this.innerValue);
    },
  },
};
</script>
