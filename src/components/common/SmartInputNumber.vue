<template>
  <el-input-number
    ref="inputNumber"
    :value="innerValue"
    v-bind="inputNumberAttrs"
    v-on="passthroughListeners"
    @input="handleInput"
    @change="handleChange"
  />
</template>

<script>
const INTERMEDIATE_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)?$/;

export default {
  name: 'EditorInputNumber',
  inheritAttrs: false,
  model: {
    prop: 'value',
    event: 'change',
  },
  props: {
    value: {
      type: [Number, String],
      default: undefined,
    },
    precision: {
      type: [Number, String],
      default: 2,
    },
    controls: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      innerValue: this.toNumber(this.value),
      nativeInputEl: null,
      blurTriggeredByEnter: false,
      pendingEmptyCommit: false,
    };
  },
  computed: {
    inputNumberAttrs() {
      const attrs = { ...this.$attrs };
      if (attrs.precision === undefined) {
        attrs.precision = this.precisionValue;
      }
      if (attrs.controls === undefined) {
        attrs.controls = this.controls;
      }
      return attrs;
    },
    passthroughListeners() {
      const listeners = { ...this.$listeners };
      delete listeners.input;
      delete listeners.change;
      return listeners;
    },
    minValue() {
      return this.toNumber(this.$attrs.min);
    },
    precisionValue() {
      const precision = this.toNumber(this.precision);
      if (precision === undefined || precision < 0) {
        return 2;
      }
      return Math.floor(precision);
    },
  },
  watch: {
    value(nextValue) {
      this.innerValue = this.toNumber(nextValue);
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
      const inputNumber = this.$refs.inputNumber;
      if (inputNumber && typeof inputNumber.focus === 'function') {
        inputNumber.focus();
        return;
      }
      if (this.nativeInputEl && typeof this.nativeInputEl.focus === 'function') {
        this.nativeInputEl.focus();
      }
    },
    blur() {
      if (this.nativeInputEl && typeof this.nativeInputEl.blur === 'function') {
        this.nativeInputEl.blur();
        return;
      }
      const inputNumber = this.$refs.inputNumber;
      if (inputNumber && typeof inputNumber.blur === 'function') {
        inputNumber.blur();
      }
    },
    select() {
      const inputNumber = this.$refs.inputNumber;
      if (inputNumber && typeof inputNumber.select === 'function') {
        inputNumber.select();
        return;
      }
      if (this.nativeInputEl && typeof this.nativeInputEl.select === 'function') {
        this.nativeInputEl.select();
      }
    },
    toNumber(value) {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    },
    getEmptyConfirmValue() {
      return this.minValue !== undefined ? this.minValue : 0;
    },
    applyEmptyFallback(inputNumber) {
      const nextValue = this.getEmptyConfirmValue();
      if (inputNumber && typeof inputNumber.setCurrentValue === 'function') {
        inputNumber.setCurrentValue(nextValue);
        this.innerValue = inputNumber.currentValue;
      } else {
        this.innerValue = nextValue;
        this.$emit('input', nextValue);
        this.$emit('change', nextValue, undefined);
      }

      const displayValue = this.innerValue === undefined ? '' : String(this.innerValue);
      this.setNativeValue(displayValue);
    },
    bindNativeEvents() {
      const inputNumber = this.$refs.inputNumber;
      const nextInputEl = inputNumber && inputNumber.$el && inputNumber.$el.querySelector('input');
      if (!nextInputEl || nextInputEl === this.nativeInputEl) {
        return;
      }

      this.unbindNativeEvents();
      this.nativeInputEl = nextInputEl;
      this.nativeInputEl.addEventListener('keydown', this.handleNativeKeydown, true);
      this.nativeInputEl.addEventListener('input', this.handleNativeInput, true);
      this.nativeInputEl.addEventListener('blur', this.handleNativeBlur, true);
    },
    unbindNativeEvents() {
      if (!this.nativeInputEl) {
        return;
      }

      this.nativeInputEl.removeEventListener('keydown', this.handleNativeKeydown, true);
      this.nativeInputEl.removeEventListener('input', this.handleNativeInput, true);
      this.nativeInputEl.removeEventListener('blur', this.handleNativeBlur, true);
      this.nativeInputEl = null;
    },
    normalizeInput(rawValue) {
      const source = String(rawValue || '');
      const filtered = source.replace(/[^0-9+\-.]/g, '');
      let changed = filtered !== source;
      let sign = '';
      let body = filtered;
      const precisionLimit = this.precisionValue;

      if (body.startsWith('+') || body.startsWith('-')) {
        sign = body[0];
        body = body.slice(1);
      }

      if (/[+-]/.test(body)) {
        body = body.replace(/[+-]/g, '');
        changed = true;
      }

      if (precisionLimit === 0 && body.includes('.')) {
        body = body.replace(/\./g, '');
        changed = true;
        return {
          value: `${sign}${body}`,
          changed,
          precisionExceeded: true,
        };
      }

      const firstDotIndex = body.indexOf('.');
      if (firstDotIndex !== -1) {
        const integerPart = body.slice(0, firstDotIndex);
        let decimalPart = body.slice(firstDotIndex + 1);

        if (decimalPart.includes('.')) {
          decimalPart = decimalPart.replace(/\./g, '');
          changed = true;
        }

        let precisionExceeded = false;
        if (precisionLimit !== undefined && decimalPart.length > precisionLimit) {
          decimalPart = decimalPart.slice(0, precisionLimit);
          precisionExceeded = true;
          changed = true;
        }

        return {
          value: `${sign}${integerPart}.${decimalPart}`,
          changed,
          precisionExceeded,
        };
      }

      return {
        value: `${sign}${body}`,
        changed,
        precisionExceeded: false,
      };
    },
    isIntermediateValue(value) {
      return (
        value === '' ||
        value === '+' ||
        value === '-' ||
        value === '.' ||
        value === '+.' ||
        value === '-.' ||
        INTERMEDIATE_PATTERN.test(value)
      );
    },
    setNativeValue(value) {
      if (!this.nativeInputEl) {
        return;
      }

      if (this.nativeInputEl.value !== value) {
        this.nativeInputEl.value = value;
      }

      const inputNumber = this.$refs.inputNumber;
      if (inputNumber && 'userInput' in inputNumber) {
        inputNumber.userInput = value;
      }
    },
    handleNativeInput(event) {
      const rawValue = event.target.value;
      const normalized = this.normalizeInput(rawValue);
      this.pendingEmptyCommit = normalized.value === '';

      if (normalized.value !== rawValue) {
        this.setNativeValue(normalized.value);
      }

      this.$emit('raw-input', normalized.value);
    },
    handleNativeKeydown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.blurTriggeredByEnter = true;
        event.target.blur();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const passthroughKeys = [
        'Backspace',
        'Delete',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'Tab',
        'Escape',
      ];

      if (passthroughKeys.includes(event.key) || event.key.length !== 1) {
        return;
      }

      const input = event.target;
      const selectionStart =
        input.selectionStart == null ? input.value.length : input.selectionStart;
      const selectionEnd = input.selectionEnd == null ? input.value.length : input.selectionEnd;
      const nextValue =
        input.value.slice(0, selectionStart) + event.key + input.value.slice(selectionEnd);
      const normalized = this.normalizeInput(nextValue);

      if (normalized.value !== nextValue || !this.isIntermediateValue(normalized.value)) {
        event.preventDefault();
      }
    },
    handleNativeBlur(event) {
      const triggeredByEnter = this.blurTriggeredByEnter;
      if (triggeredByEnter) {
        this.blurTriggeredByEnter = false;
      }

      const rawValue = event && event.target ? event.target.value : '';
      const shouldApplyEmptyFallback = rawValue === '';
      this.$emit('blur', event);

      this.$nextTick(() => {
        const inputNumber = this.$refs.inputNumber;

        if (shouldApplyEmptyFallback) {
          this.applyEmptyFallback(inputNumber);
        } else if (inputNumber && 'currentValue' in inputNumber) {
          this.innerValue = inputNumber.currentValue;
        }

        this.pendingEmptyCommit = false;
        if (triggeredByEnter) {
          this.$emit('enter', this.innerValue);
          return;
        }
        this.$emit('confirm', this.innerValue);
      });
    },
    handleInput(value) {
      if (this.pendingEmptyCommit && value === undefined) {
        return;
      }
      if (value !== undefined) {
        this.pendingEmptyCommit = false;
      }
      this.innerValue = value;
      this.$emit('input', value);
    },
    handleChange(currentValue, oldValue) {
      if (this.pendingEmptyCommit && currentValue === undefined) {
        return;
      }
      if (currentValue !== undefined) {
        this.pendingEmptyCommit = false;
      }
      this.innerValue = currentValue;
      this.$emit('change', currentValue, oldValue);
    },
  },
};
</script>
