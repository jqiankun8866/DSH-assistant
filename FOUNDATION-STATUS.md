# 当前状态：0.2.5-dev.6

本版为Windows开发候选，可作为GitHub源码测试版提交，不标为全用户稳定版。

## 保留范围

- 微信文字及媒体、DSH原生办公、统一原生任务、档案、人设。
- 健康资料和餐食记录、财经资料分析、合同阅读流程。
- TLS IMAP只读邮箱和标题规则监控、小红书后台读取、公开图片与表情图片库。
- 8个技能：steward、email、experience、health、finance、office-delivery、onboarding、xhs。

安卓执行器、打车及梗词库已移除。没有新增专业医疗引擎、证券交易、自动回信或法律数据库。现有能力的依据见docs/HEALTH-FINANCE-BASIS.md。

## 验证

本轮176项Node、31项Python自动检查通过；隔离desktop配置首次安装及升级成功，8个技能和构建文件一致，无重复注册。实际使用DSH宿主的YAML解析器核验配置。详情见docs/PREUPLOAD-ACCEPTANCE.md。

维护者当前真实DSH仍运行dev.5；其面板和任务桥可达不等于dev.6已部署。此次未发送测试微信消息、创建真实提醒、读取私人邮箱或调用付费模型。未进行全新Windows机器、真实微信收发和模型效果验收。
