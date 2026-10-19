// 测试页先加载不碰页面的模块（js/core 和故事目录），顺序和 index.html 一样；
// 要在后面的脚本之前跑完，所以同步读、用 document.write 插进去
(() => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '../../index.html', false);
  xhr.send();
  for (const [, src] of xhr.responseText.matchAll(/<script src="([^"]+)"/g)) {
    if (!src.startsWith('js/app/')) document.write(`<script src="../../${src}"><\/script>`);
  }
})();
