# 词库和备份格式

完整示例为`web/deck.json`，只包含本项目原创的6张词卡。导入后内容保存在本机；云同步不上传释义、例句或书籍正文。

## 词库

根字段为`schemaVersion: 1`、`bookId`、`title`、`cards`，可附`revision`。每次增量更新保持同一`bookId`和稳定的词条ID。

| 词条字段                                  | 含义                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                                      | 最多200字符，英文字母、数字、下划线或短横线；不能用对象保留属性名，如`constructor`、`__proto__` |
| `word`、`pos`、`meaning`                  | 单词、词性和中文释义                                                                            |
| `definition`                              | 英文解释                                                                                        |
| `example`、`exampleZh`                    | 英文例句及中文翻译                                                                              |
| `order`                                   | 正整数，词库内唯一，决定学习和区间复习顺序                                                      |
| `source.sentence`                         | 正整数分组编号；保留旧字段名兼容备份，不限100组                                                 |
| `source.printedPage`、`source.readerPage` | 可选来源页码；示例没有虚构页码                                                                  |
| `collocations`                            | `en`、`zh`组成的搭配数组                                                                        |
| `spellingAnswers`                         | 可选拼写答案变体；省略时使用`word`                                                              |
| `cloze`、`conversion`                     | 可选练习，含`prompt`和非空`answers`数组                                                         |
| `supplementary`                           | 可选词汇拓展，含`family`数组，可附`notes`及`morphology`                                         |
| `additionalSenses`                        | 同词其他义项；沿用主词的ID、word和order，附自己的来源、释义与题目                               |

同一词库不能出现重复ID、重复英文主词或重复顺序号。多义词应使用`additionalSenses`，避免重复统计。具体边界与错误提示以`web/core.js`的`validateDeck`为准。

## 完整备份

完整备份包含`schemaVersion`、`deck`、`learned`、`results`、`cursor`，以及可选的学习安排、`favorites`和`favoriteChanges`。备份含用户自己的词卡与记录，应保存在私人位置，不要提交到公开仓库。

- `learned`按词条ID记录首次学习日期。
- `results`保存题型、日期、对错和事件ID，用于去重。
- `favorites`记录当前点亮的词条。
- `favoriteChanges`每词保留最新`active`、`updatedAt`和`changeId`，取消收藏也保留。

恢复完整备份会替换当前活动词库及记录，需要确认。同一本书导入词库是增量合并，保留学习日期；不同书籍则明确提示切换前导出备份。

## 同步冲突

学习日期保留最早值，复习事件按事件ID去重。收藏按操作时间较新者处理，相同时间按操作ID排序。取消标记阻止旧离线设备恢复过时收藏；设备应使用正确系统时间。云端保存的是每词最新操作，不是无限追加的点击日志。
