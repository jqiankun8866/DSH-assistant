# 小红书浏览器启动验收

版本：0.2.5-dev.14。日期：2026-11-09。

## 实际流程

1. 检查本机配置端口；浏览器已运行时复用，不改动已有窗口状态。
2. 未运行时，启动用户自己的专用 Chrome 配置，直接进入小红书首页。连接就绪后通过 CDP 最小化新窗口。
3. 任务标签页在后台直接进入目标网址，等待页面可读取，不先创建空白页再跳转。后续请求复用当前任务标签页。
4. 首次使用未登录时提示用户登录；不把空白页、验证页或错误账号当作搜索成功。
5. 创建任务失败时只清理该任务标签页，保留登录窗口和用户其他标签页。取消和重试不会改写用户资料。
6. 安装菜单里的登录入口、绑定配置和运行时使用同一专用目录与端口。重新绑定保留自定义浏览器设置。

## 检查方式

```powershell
node scripts/build-channel.mjs
node --test packages/wechat-channel/tests/browser-start.node-test.mjs packages/wechat-channel/tests/background-browser.node-test.mjs packages/wechat-channel/tests/xhs.node-test.mjs
python -m unittest discover -s scripts -p "test_xhs_setup.py"
node scripts/test-xhs-cold-start.mjs
```

最后一项为显式运行的真实 Chrome 测试，创建隔离临时配置及随机端口，检查首页、最小化状态、后台标签创建/关闭和未登录提示，再关闭并清理该测试实例。它不读取已有账号，也不占用正常助手的浏览器端口。

本机已完成全新 Chrome 配置冷启动：约 3.5 秒，首页为小红书，无遗留空白页，窗口最小化，任务清理及未登录提示通过。已有登录账号的真实搜索约 3.8 秒返回 3 条结果并复用同一任务页。

## 范围

这些检查覆盖本项目控制的启动与任务路径。独立的 agent-browser、其他浏览器工具、扩展或用户仍可能自行新建空白页；本项目不会自动删除其他工具或用户创建的标签页。Windows 版无需安装额外的 agent-browser。

网络阻断、小红书登录验证及平台页面变化仍可能导致读取失败。此次使用了新的浏览器配置，不等于在一台全新的 Windows 机器上完成全部 DSH 和微信能力验收。
