# 专注暂停建模为加列,不新增状态值

暂停(专注会话临时挂起,学习时钟停走)需要服务端感知——否则暂停跨越计划结束点时,`GET /active` 的过期自动完成会把会话以满额时长落账,统计虚增。

两条路线:

| 路线 | 代价 |
|---|---|
| `status` ENUM 加 `'paused'` | 需 ALTER ENUM 迁移;**全库既有 `status='in_progress'` 判断/乐观锁都要改成「in_progress 或 paused」**,漏改不报错、只丢一致性 |
| **加列 `paused_at` + `paused_total_seconds`** | 迁移仅幂等 ADD COLUMN;status 语义与全库判断零波及;`cancel` 的 `status='in_progress'` 条件天然涵盖暂停中会话,零改动 |

决定:**`focus_sessions` 加两列,不新增状态值。** `paused_at` 非空即暂停中;`resume` 时 `planned_end_at` 顺延、累计暂停秒数;`complete` 乐观锁追加 `AND paused_at IS NULL`,实际时长扣除累计暂停。暂停超时(5 分钟)的自动恢复是**惰性**的,由 `GET /active` 读路径就地触发,与既有「过期自动完成惰性触发」模式同构,不引入服务端定时器。

## Consequences

- **判断「暂停中」一律看 `paused_at IS NOT NULL`,不要发明 status 判断**——status 里不存在 paused,任何把暂停写进 status 的改动都是对本决策的破坏。
- 暂停中会话在 status 上仍是 in_progress:跨天挂起是合法状态(时间顺延保证统计准确),勿「帮忙」到期作废。
- 统计零改动的前提是 complete 写 `study_records` 时已扣除暂停;`statistics.ts` 全读 `study_records.actual_duration_seconds`,若未来统计改读 `focus_sessions`,须自行扣 `paused_total_seconds`。
- 暂停中「提前完成」被 409 拒绝(先继续再完成);「取消」天然允许。
