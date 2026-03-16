<template>
  <el-input
    ref="input"
    :value="displayValue"
    v-bind="inputAttrs"
    v-on="passthroughListeners"
    @input="handleInput"
    @change="handleChange"
  >
    <template v-if="$slots.prepend" slot="prepend">
      <slot name="prepend" />
    </template>
    <template v-if="$slots.append" slot="append">
      <slot name="append" />
    </template>
    <template v-if="$slots.prefix" slot="prefix">
      <slot name="prefix" />
    </template>
    <template v-if="$slots.suffix" slot="suffix">
      <slot name="suffix" />
    </template>
    <slot />
  </el-input>
</template>

<script>
const COMPLETE_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export default {
  name: 'EditorInputNumberSlot',
  inheritAttrs: false,
  model: {
    prop: 'value',
    event: 'change',
  },
  props: {
    value: {
      type: [Number, String],
      default: 0,
    },
    precision: {
      type: [Number, String],
      default: 2,
    },
    confirmOnEnter: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      displayValue: this.formatDisplayValue(this.value),
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
      this.displayValue = this.formatDisplayValue(nextValue);
      this.setNativeValue(this.displayValue);
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
    getPrecisionValue() {
      const precision = this.toNumber(this.precision);
      if (precision === undefined || precision < 0) {
        return 2;
      }
      return Math.floor(precision);
    },
    toNumber(value) {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return undefined;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    },
    formatDisplayValue(value) {
      if (value === undefined || value === null || value === '') {
        return '0';
      }
      const num = this.toNumber(value);
      if (num === undefined) {
        return '0';
      }
      return String(this.applyPrecision(num));
    },
    applyPrecision(num) {
      const safeNum = Number(num);
      if (!Number.isFinite(safeNum)) {
        return 0;
      }

      const safePrecision = this.getPrecisionValue();
      const factor = Math.pow(10, safePrecision);

      if (!Number.isFinite(factor) || factor === 0) {
        return safeNum;
      }

      return Math.round(safeNum * factor) / factor;
    },
    normalizeInput(rawValue) {
      const source = String(rawValue || '');
      const filtered = source.replace(/[^0-9+\-.]/g, '');
      let sign = '';
      let body = filtered;

      if (body.startsWith('+') || body.startsWith('-')) {
        sign = body[0];
        body = body.slice(1);
      }
      if (/[+-]/.test(body)) {
        body = body.replace(/[+-]/g, '');
      }

      const firstDotIndex = body.indexOf('.');
      if (firstDotIndex === -1) {
        return `${sign}${body}`;
      }

      const integerPart = body.slice(0, firstDotIndex);
      let decimalPart = body.slice(firstDotIndex + 1).replace(/\./g, '');
      const precisionLimit = this.getPrecisionValue();
      if (decimalPart.length > precisionLimit) {
        decimalPart = decimalPart.slice(0, precisionLimit);
      }
      return `${sign}${integerPart}.${decimalPart}`;
    },
    parseCommittedValue(value) {
      if (value === '') {
        return 0;
      }
      if (!COMPLETE_NUMBER_PATTERN.test(value)) {
        return 0;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) {
        return 0;
      }
      return this.applyPrecision(num);
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
    setNativeValue(value) {
      if (!this.nativeInputEl) {
        return;
      }
      if (this.nativeInputEl.value !== value) {
        this.nativeInputEl.value = value;
      }
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
        const normalized = this.normalizeInput(this.displayValue);
        const committed = this.parseCommittedValue(normalized);
        this.displayValue = String(committed);
        this.setNativeValue(this.displayValue);
        if (triggeredByEnter) {
          this.$emit('enter', committed);
          return;
        }
        this.$emit('confirm', committed);
      });
    },
    handleInput(value) {
      const normalized = this.normalizeInput(value);
      this.displayValue = normalized;
      this.setNativeValue(normalized);
      this.$emit('input', normalized);
    },
    handleChange(value) {
      const normalized = this.normalizeInput(value);
      const committed = this.parseCommittedValue(normalized);
      this.displayValue = String(committed);
      this.setNativeValue(this.displayValue);
      this.$emit('change', committed);
    },
  },
};
</script>
