# 来源与许可

微信通道源自 Ox2g/dsh-plugin-wechat，参考提交 5b21f91cbd8f0fea8786b0197601eec9e6c66862，MIT；原许可在 packages/wechat-channel/LICENSE。腾讯 openclaw-weixin 协议层的版权与 MIT 声明保留在源码。

本包包含在该基础上修改的媒体、助理、记忆、健康、浏览器与调度代码。DSH 宿主、Node/Python、Office、FFmpeg、agent-browser、qrcode-terminal、silk-wasm 等由使用者另行安装，各自遵循原许可。本包不包含 Windows 原生二进制或开发者的 node_modules。



基础表情素材：内置12张 Twemoji 静态PNG及中文关键词检索，安装时自动准备到当前微信工作区。先测试“发一个比心的表情包”；也可说“谢谢”测试轻量主动配图，高频模式不限制连续轮数，已发图时不重复。说“不要发表情包”可停止主动配图。现版表情通过语义候选与专用发送工具处理，仅渠道确认后记为发送成功。
素材：Twemoji v15.1.0，Twitter, Inc. and other contributors，CC BY 4.0；图片未修改，仅添加中文检索标签。来源 https://github.com/jdecked/twemoji/tree/v15.1.0 。完整许可证与署名随 packages/wechat-channel/assets/memes/basic 分发。
