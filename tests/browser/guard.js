// 测试页会清空浏览器存储、写进假数据，只许在本机的测试服务器上打开：
// 换了网址（比如发布到了线上），停下整个页面，后面的脚本一行都不跑
if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
  window.stop();
  document.documentElement.textContent = '测试页只能在本机运行（sh tests/browser/run.sh）。';
  throw new Error('测试页只能在本机运行');
}
