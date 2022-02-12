## translator-worker

前端实现页面翻译,从 [Traduzir-paginas-web 插件](https://gitee.com/sternelee/Traduzir-paginas-web) 提取而来


### 使用

```javascript
import translator from '@sternelee/translator-worker'

window.onload = async function () {
  // 翻译全文
  translator.translatePage("zh");

  // 翻译文本
  const txt = await translator.translateText("google", "zh", "I Love Code");

  // 恢复
  setTimeout(() => {
    translator.restorePage()
  }, 5000)
}
```
