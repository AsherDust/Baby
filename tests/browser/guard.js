// 每个测试页最先加载。
// 测试页会清空浏览器存储、写进假数据，只许在本机的测试服务器上打开：
// 换了网址（比如发布到了线上），停下整个页面，后面的脚本一行都不跑
if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
  window.stop();
  document.documentElement.textContent = '测试页只能在本机运行（sh tests/browser/run.sh）。';
  throw new Error('测试页只能在本机运行');
}

// run.sh 让 Chrome 按虚拟时间跑：setTimeout 不用真等，页面闲着时时间直接跳到下一个定时器，用到预算就交卷。
// 读文件、读 Blob、加密、IndexedDB 是真的异步，干等它们时虚拟时间会一下跳过好几秒；
// 测试里要么不用真的异步（下面的 textOf、假的文件），要么边发网络请求边等（请求没回来时虚拟时间停着）

// 跑完（页面写出 DONE）时记下用了多少虚拟时间，快用完了 run.sh 会提醒
(() => {
  const out = document.getElementById('out');
  if (!out) return;
  const seen = new MutationObserver(() => {
    if (!out.textContent.startsWith('DONE')) return;
    seen.disconnect();
    out.textContent += `\nVT ${Math.round(performance.now())}`;
  });
  seen.observe(out, { childList: true, characterData: true, subtree: true });
})();

/** 同步读出 Blob 里的字（下载、分享出去的文件），免得等的时候虚拟时间跳走 */
function textOf(blob) {
  const url = URL.createObjectURL(blob);
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.send();
  URL.revokeObjectURL(url);
  return xhr.responseText;
}
