# Editor Input Components 文档

本文档说明 3 个业务输入组件的事件语义与用法：

1. `editor-input-number`（文件：`SmartInputNumber.vue`）
2. `editor-input`（文件：`EditorInput.vue`）
3. `editor-input-number-slot`（文件：`EditorInputNumberSlot.vue`）

## 统一事件语义

为了避免业务歧义，三个组件统一为以下规则：

1. `enter` 只表示“用户按下 Enter 确认”。
2. `confirm` 只表示“非 Enter 导致的 blur 确认”。
3. Enter 导致 blur 时，不再重复触发 `confirm`。
4. `blur` 事件仍会正常触发（包含 Enter 触发的 blur 副作用）。

## editor-input-number

组件标签：`<editor-input-number />`

### 事件

| 事件名 | 参数 | 触发时机 | 说明 |
|---|---|---|---|
| `input` | `(value)` | 值在输入过程中变化时 | 兼容 `el-input-number` 的输入事件。 |
| `change` | `(currentValue, oldValue)` | 组件值完成变更时 | 兼容 `el-input-number` 的 change 语义。 |
| `raw-input` | `(rawString)` | 原生输入框每次输入后 | 已经过滤非法字符后的字符串。 |
| `blur` | `(event)` | 输入框失焦 | 不区分是否由 Enter 导致。 |
| `confirm` | `(value)` | 非 Enter 导致的 blur 后 | 作为“失焦确认”事件。 |
| `enter` | `(value)` | 用户按 Enter 后 | 作为“回车确认”事件。不会再触发 `confirm`。 |

### 值处理说明

1. 空值在确认时会回填为最小值（传了 `min` 用 `min`，否则用 `0`）。
2. 会拦截非法字符，只允许数字与 `+ - .`，并校验格式与精度。
3. 当 `precision=0` 时，不允许输入小数点（键盘输入与粘贴都会被拦截/清洗）。
4. 不再内置 tooltip 提示；超精度与非法字符由输入过滤处理，范围约束交给 `el-input-number` 自身与业务事件处理。

### 透传与实例方法

1. `el-input-number` 的属性通过 `$attrs` 透传（如 `min/max/step/precision/...`）。
2. 暴露实例方法：`focus()`、`blur()`、`select()`。

## editor-input

组件标签：`<editor-input />`

### 事件

| 事件名 | 参数 | 触发时机 | 说明 |
|---|---|---|---|
| `input` | `(value: string)` | 输入过程中实时触发 | `v-model` 同步事件。 |
| `change` | `(value: string)` | 输入值确认变化时 | 兼容 `el-input` change 语义。 |
| `blur` | `(event)` | 失焦时 | 不区分是否由 Enter 导致。 |
| `confirm` | `(value: string)` | 非 Enter 导致的 blur 后 | 失焦确认事件。 |
| `enter` | `(value: string)` | 用户按 Enter 后 | 回车确认事件。不会再触发 `confirm`。 |

### 关键属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `confirmOnEnter` | `Boolean` | `true` | 是否启用 Enter 确认。 |
| `disableEnterConfirmWhenEmpty` | `Boolean` | `false` | 为 `true` 时，空值按 Enter 不确认。 |

### 透传与实例方法

1. `el-input` 属性通过 `$attrs` 透传（如 `maxlength`、`show-word-limit`、`type` 等）。
2. 暴露实例方法：`focus()`、`blur()`、`select()`。

## editor-input-number-slot

组件标签：`<editor-input-number-slot />`

基于 `el-input` 实现的“可插槽数字输入组件”，用于需要 `prepend/append/prefix/suffix` 的场景。

### 事件

| 事件名 | 参数 | 触发时机 | 说明 |
|---|---|---|---|
| `input` | `(normalizedString)` | 输入过程中实时触发 | 归一化后的数字字符串。 |
| `change` | `(committedNumber)` | 值确认变化时 | 输出最终 number。 |
| `blur` | `(event)` | 失焦时 | 不区分是否由 Enter 导致。 |
| `confirm` | `(committedNumber)` | 非 Enter 导致的 blur 后 | 失焦确认事件。 |
| `enter` | `(committedNumber)` | 用户按 Enter 后 | 回车确认事件。不会再触发 `confirm`。 |

### 关键属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `precision` | `Number \| String` | `2` | 小数精度。 |
| `confirmOnEnter` | `Boolean` | `true` | 是否启用 Enter 确认。 |

### 插槽

支持并透传常用插槽：

1. `prepend`
2. `append`
3. `prefix`
4. `suffix`
5. 默认插槽

### 透传与实例方法

1. `el-input` 属性通过 `$attrs` 透传。
2. 暴露实例方法：`focus()`、`blur()`、`select()`。

## 事件选择建议

1. 需要实时联动：监听 `input`。
2. 需要“值确认后”处理：监听 `change`。
3. 需要明确区分确认来源：同时监听 `enter` 与 `confirm`。
4. 只关心“任意确认动作”：业务层可把 `enter` 和 `confirm` 统一调用同一个处理函数。

## 使用示例

```vue
<template>
  <div>
    <editor-input-number
      v-model="numValue"
      :min="0.01"
      :max="100"
      :step="0.01"
      @change="onNumberChange"
      @confirm="onNumberBlurConfirm"
      @enter="onNumberEnterConfirm"
    />

    <editor-input
      v-model="textValue"
      :disable-enter-confirm-when-empty="true"
      maxlength="20"
      show-word-limit
      @change="onTextChange"
      @confirm="onTextBlurConfirm"
      @enter="onTextEnterConfirm"
    />
  </div>
</template>

<script>
export default {
  data() {
    return {
      numValue: 1,
      textValue: '',
    };
  },
  methods: {
    onNumberChange(val) {
      // change: 值确认变化
    },
    onNumberBlurConfirm(val) {
      // confirm: 非 Enter 的 blur 确认
    },
    onNumberEnterConfirm(val) {
      // enter: Enter 确认
    },
    onTextChange(val) {
      // change: 值确认变化
    },
    onTextBlurConfirm(val) {
      // confirm: 非 Enter 的 blur 确认
    },
    onTextEnterConfirm(val) {
      // enter: Enter 确认
    },
  },
};
</script>
```
