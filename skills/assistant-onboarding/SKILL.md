---
name: assistant-onboarding
description: 为微信私人助理设置称呼、表达偏好、城市、时区、提醒与主动联系选项，或查询修改已有设置。
---

先调用 assistant_profile get，保留用户没要求修改的字段。轻量设置先问称呼、偏好语气和需要帮忙的事项；天气或定时时再收集城市/时区。用户已经明确提供的内容直接设置，不重复确认。

assistant_profile update 的 data 是JSON字符串，支持 nickname、tone=plain/warm、length=concise/normal、timeZone、enabled、dailyLimit、minGapMs、quiet={start,end}、location={name,latitude,longitude}。城市经纬度用可靠地理查询核对，不从用户所在地猜测。默认时区 Asia/Shanghai，提醒返回时明确显示该时区。

提醒统一assistant_tasks：先list；create的data为{text,reminder:{daily:"HH:mm"}}，单次用含时区at或afterMinutes。天气任务text包含城市及播报要求；改时间用update并带id、expectedRevision，不新建重复任务。取消提醒用reminder:null，保留事情。不要用旧kind=weather/sleep接口。

enabled控制邮件/XHS后台分享，不控制原生任务提醒。当前工具未声明久未聊天自动问候，不因为旧配置存在就承诺已启用。暂停提醒须查询assistant_tasks并修改对应reminder；邮件与XHS计划还要核对各自monitor/routine状态。

用户说少说点、不要表情等偏好，保存到 assistant_memory 后，在后续对话优先遵守。不会因为人设主动编造生活经历，不用责备话术索取回复。

设置完成只说明改了什么、下一次任务时间与实际状态。没有成功调用工具就不声称记住或安排完成。

“以后叫我老大”等明确称呼指令：调用 assistant_profile update {nickname:用户指定称呼}，再读取确认。不要只写入聊天历史，不把任一用户的称呼作为所有用户默认值。每轮会注入数据库中的偏好快照；修改后立即按新值回复。改名覆盖 nickname，忘掉称呼把它设为空字符串。

其他习惯按稳定 key 保存为已确认 preference，例如 communication.emoji、communication.detail、food.spice；纠正时更新同一 key。健康情况放健康档案，不混入普通偏好自动注入。用户要求不要表情时优先于通用表情规则；不强行称呼、不伪造个人经历，不因用户没回复而责备。

安装后所有基础能力可用，但不自动建立任何提醒或健康档案。首次只自然询问希望怎么称呼；城市、健康资料和办公要求在实际需要时逐步了解。任务创建/取消结果必须以工具为准。

把明确设置、当次诉求和玩笑区分开：“以后少发表情”是设置；调侃token或发一个表情不是修改频率的授权。用已有称呼和简短自然回应体现熟悉感，不反复播报设置流程；只保存用户明确表达的长期偏好。设置写入后回读核对，不另建人设文件或第二套偏好库。
