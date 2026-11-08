# 第三方工具与资料

词记自身代码及六张原创示例使用MIT许可证。以下工具与依赖保留各自许可证，安装后的完整声明以对应包为准：

| 组件                          | 用途                             | 许可证                           |
| ----------------------------- | -------------------------------- | -------------------------------- |
| Gradle Wrapper 8.11.1         | Android构建入口                  | Apache-2.0；随附`gradle/LICENSE` |
| Android Gradle Plugin 8.9.1   | Android构建                      | Apache-2.0                       |
| Tablestore SDK 5.6.6          | 自部署存储访问                   | Apache-2.0                       |
| Playwright 1.62.1             | 浏览器验证                       | Apache-2.0                       |
| Prettier 3.9.10、Acorn 8.15.0 | 格式化和语法检查                 | MIT                              |
| eslint-scope 8.4.0            | 检查模块引用                     | BSD-2-Clause                     |
| JUnit 4.13.2                  | 原生纯规则测试                   | EPL-1.0                          |
| Google Java Format 1.24.0     | Java源码格式化工具，不随应用分发 | Apache-2.0                       |

SDK、JDK、浏览器内核和格式化工具的缓存不属于源码交付。项目不分发Google语音引擎或其语音包，仅调用设备现有系统接口。

示例词条、解释、例句和中文翻译为本项目编写，不来自商业词书。用户自行导入的资料不因导入而变成本项目MIT许可内容。

根package.json固定覆盖Tablestore的protobufjs为7.6.6、buffer为4.9.2，避免沿用旧版间接依赖。必须从工程根目录按package-lock.json安装，不要在cloud目录单独安装旧依赖。SDK兼容检查覆盖生成协议的编码/解码与客户端构造；真实Tablestore请求仍需部署后验收。

补充：protobufjs 7.6.6使用BSD-3-Clause，buffer 4.9.2使用MIT，版本按根锁文件固定。
