## vite-translation-worker

前端实现页面翻译,从 [Traduzir-paginas-web 插件](https://gitee.com/sternelee/Traduzir-paginas-web) 提取而来


### 使用

```javascript
import translator from '@sternelee/translator-worker'

window.onload = function () {
  translator.translatePage("zh");

  // 恢复
  setTimeout(() => {
    translator.restorePage()
  }, 5000)
}
```
