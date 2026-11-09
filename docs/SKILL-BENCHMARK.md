# 现有技能的外部流程学习

检查日期：2026-11-06。当前发布包含8个助理技能。安卓执行器和梗词库已按用户要求移除；表情图片采集与发送模块保留。此轮学习外部Skill并改写适配规则，未安装其第三方运行时，也未做跨项目效果排名。

## 逐项映射

| 本地技能 | 实际阅读的参考 | 采用的流程 | 不直接照搬的部分 |
|---|---|---|---|
| assistant-email | [OpenClaw Himalaya](https://github.com/openclaw/openclaw/blob/main/skills/himalaya/SKILL.md) | 列表筛选、正文读取、可追溯摘要 | SMTP发送、多账户及目录操作不在现有工具范围 |
| assistant-finance | [Anthropic financial-statements](https://github.com/anthropics/knowledge-work-plugins/blob/main/finance/skills/financial-statements/SKILL.md) | 可比期间、差额分析、驱动因素必须有证据 | 不照搬企业ERP连接器、美国会计准则或阈值 |
| assistant-health | [K-Dense literature-review](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/literature-review/SKILL.md) | 定义问题、筛选适用证据、核对引用与覆盖范围 | 不把日常健康问题变成系统综述；不引入其API和PDF依赖 |
| assistant-office-delivery | Anthropic [DOCX](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md)、[PPTX](https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md)、[XLSX](https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md) | 区分新建与修改，复核文件、版式及公式意义 | 仍调用DSH原生Office工具，不复制专有脚本或假设依赖已安装 |
| assistant-onboarding | [memory-management](https://github.com/anthropics/knowledge-work-plugins/blob/main/productivity/skills/memory-management/SKILL.md) | 稳定偏好与工作上下文分开，渐进收集 | 玩笑不自动成为长期偏好；不另写记忆文件 |
| assistant-steward | [task-management](https://github.com/anthropics/knowledge-work-plugins/blob/main/productivity/skills/task-management/SKILL.md)、[review-contract](https://github.com/anthropics/knowledge-work-plugins/blob/main/legal/skills/review-contract/SKILL.md) | 等待状态、下一步、合同中的用户立场与条款影响 | 不新建TASKS.md或法律Agent；不默认套用外国法 |
| assistant-xhs | [chang-zy/xiaohongshu-skill](https://github.com/chang-zy/xiaohongshu-skill/blob/main/SKILL.md)、agent-browser入口 | 意图路由、读取详情与图片、仅清理自己的自动化页面 | 该项目标注macOS/Linux；不替换Windows执行器，不引入发布评论权限 |

## 选择依据与限制

- 先查询skills.sh目录，再检查作者仓库的实际Skill。选择看流程可读性、输入输出是否明确、是否有验收步骤和DSH适配成本；不以安装量或星数证明效果。
- Anthropic办公Skill明确标注Proprietary；这里只用自己的文字补充验收要求，未复制其脚本、模板或资源。其他来源也未整包分发；未来引入代码需另核具体文件许可证及固定提交。
- K-Dense旧claude-scientific-skills路径返回404；实际读取的是scientific-agent-skills当前路径。[clinical-decision-support](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/clinical-decision-support/SKILL.md)明确为研究评估用途，本次不用于个人诊疗。
- GitHub连接器此次传输失败，改用公开原始文件读取。链接指向main，可能变化；本轮是流程学习记录，不是依赖锁定清单。
- 小红书和表情库是针对性候选，尚未安装实测，不能宣称其速度、稳定性优于当前实现。agent-browser本次只读入口说明，不能据此声称已审查其全部执行实现。

## DSH自身规则纠偏

1. 取消小红书技能自动转点点的文字规则，遵循用户的“当前大模型直接检索”选择；ask仅留给明确请求。底层拒绝complex-plan和insufficient-results自动升级理由，仅接受user-request。
2. 修正引导技能“enabled=false暂停全部”的错误描述：原生任务提醒需通过assistant_tasks管理，主动联系开关不等于取消提醒。
3. 表情学习不改变当前高频偏好；场景、情绪相符即可，不强求标签完全相同。候选获取和真实发送仍由现有工具完成。

## 验收方式

本轮修改限技能文本及说明。检查8个入口的格式、注册兼容性、旧规则冲突与发布清单；不把静态检查称为真实模型对话效果测试。场景复核重点：

| 输入 | 应保持的行为 |
|---|---|
| 查重要邮件 | 先筛列表再读正文；不声称已回复 |
| 上次说的事怎么办 | 相关长期记忆检索，不倾倒所有历史 |
| 比较两期财务 | 先核口径；基期零值不输出失真百分比 |
| 这个护肤品适合我吗 | 核已确认情况、研究适用性；成分证据不冒充成品证据 |
| 做PPT/改Excel | 交付真实文件，分别检查视觉与计算 |
| 少花点token（笑） | 不擅自关闭表情或改变人设 |
| 停止主动找我 | 不把原生提醒一起删除 |
| 深圳两天500元路线 | 当前模型分解查询，不自动转点点 |
| 读合同 | 说明条款位置、影响、改法及法源缺口 |
| 找对应表情 | 依据场景而非字面同标签；不编造文件路径 |

上述为人工规则复核，不是10轮真实模型执行。生效部署和微信行为验收应单独记录，不能沿用上一版本验收结论。

当前8个技能通过实际provider加载测试。quick_validate因缺PyYAML未执行成功，未计为通过；测试替换宿主rank常量而保留实际加载逻辑。后续完整回归、隔离安装与分发核验详见PREUPLOAD-ACCEPTANCE.md。
