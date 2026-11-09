# 邮箱接入与测试边界

2026-11-06：使用维护者已有QQ授权完成真实SMTP发给自己、IMAP收件、回复测试、再次收件及In-Reply-To线程验证。只发两封自测邮件，未回复真实来信。QQ按发送前Message-ID搜索未命中，改为核对最近邮件头和实际收到的Message-ID后完成验证。不能仅用SMTP接受结果宣称收到。

## 已部署的读取方式

双击项目根目录“邮箱配置.cmd”。单一微信用户会自动绑定；多用户须让DSH按当前会话指定--peer，不猜测账号归属。授权码只填本机窗口，使用Windows DPAPI加密。

- QQ/Foxmail：旧配置继续有效；无需重新填写。
- Gmail：选择Gmail，使用账户允许的应用专用密码；受账户、组织策略和网络可达性限制。
- iCloud：选择iCloud，使用Apple允许的应用专用密码。
- 其他支持授权码的TLS IMAP邮箱：选择Custom，按照邮箱官方说明填写服务器及端口。只支持隐式TLS，不支持明文或STARTTLS IMAP。
- Outlook/Hotmail/Microsoft 365：需要另接OAuth授权及刷新令牌链路，本版未接入；不把它伪装成普通密码登录。

每个微信用户当前绑定一个邮箱，读取INBOX最近邮件及指定正文；更换配置会替换此绑定，不是同时聚合多个邮箱。切换账号/服务器采用独立游标命名空间，首次同步建立基线，不通知历史邮件。多账户并行需要后续将凭据、游标、提醒和回复草稿全部按accountId隔离。

## 发送能力

SMTP底层闭环已验证，但assistant_email仍只有status/list/read，监控仍只读取及提醒；模型没有真实发送工具，未启用自动回复。

正式接入需增加：读取原邮件→本地草稿→微信展示收件人和正文→用户确认指定版本→发送一次→记录SMTP结果和可核验状态。回复应使用实际收到的Message-ID/Reply-To；重复确认不能重发，超时状态不自动重试；自动通知及自动回复邮件不互相回复。无人确认的自动回复须另有明确范围和授权。

## 官方说明

- Gmail IMAP/SMTP：https://developers.google.com/workspace/gmail/imap/imap-smtp
- iCloud邮箱服务器：https://support.apple.com/102525
- Outlook OAuth要求：https://support.microsoft.com/en-us/outlook/pop-imap-and-smtp-settings-for-outlook-com

除QQ外，本轮只有适配及模拟验证，没有其他用户邮箱凭据，不声称完成其他服务商实收验收。
