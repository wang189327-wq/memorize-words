# 构建说明

## 工具

- Node.js 22或更新版本，依赖通过`npm ci`从锁文件安装。
- JDK 21，设置`JAVA_HOME`。Java源代码目标仍为Java 8字节码。
- Android SDK：Platform 35、Build Tools 35.0.0、Platform Tools，设置`ANDROID_HOME`。可通过Android Studio的SDK Manager安装。
- 项目自带Gradle 8.11.1 Wrapper，分发包和Wrapper JAR均按官方校验值核验。

源码不包含JDK、SDK或开发者签名，也不读取其他项目的工具目录。首次Gradle构建需要联网获取公开依赖。

## 命令

```sh
npm ci
npm run configure
```

Windows使用`gradlew.bat`，macOS/Linux使用`./gradlew`：

```sh
./gradlew clean assembleDebug testDebugUnitTest
```

`clean`删除本项目构建输出，Gradle重新编译及同步Web资源，不把已删除Java类的旧class文件打入新包。不要把自己的词库放入构建输出目录。

Android Studio也可直接打开根目录。`android/app`是应用模块，`web/`是唯一Web源码入口；不要复制一份脚本到Android资源中维护。

## Windows路径

Android工具对中文路径的支持存在版本差异。本轮在Windows中文项目路径复现了测试类加载失败；同一份源码在纯英文路径的干净构建和测试通过。可以设置好`JAVA_HOME`与`ANDROID_HOME`后执行`python tools/build-android.py`（Python 3.12+）：它在临时英文目录中运行同一Gradle命令，并把调试包与单元测试结果复制回`build/android`，不会删除工作源码。若系统临时目录本身含非ASCII字符，请先将`TEMP`/`TMP`指向自己可写的纯英文目录。

也可以手动在纯英文项目路径构建，并让`GRADLE_USER_HOME`位于纯英文路径。项目不需要修改Windows安全策略。

## 输出与签名

调试包：`android/app/build/outputs/apk/debug/app-debug.apk`。

主项目应用ID为`cn.ielts75.app`，沿用原“雅思7.5”应用ID。调试包不能覆盖使用其他签名的正式应用；可导出原应用完整备份，再在词记中恢复。

正式发布需使用自己的长期签名。私钥与密码只放本机忽略目录或受保护的CI Secret中，不附在源码、APK或网站中。更新会检查包名、较高版本码及签名一致性，换签名不能靠提高版本码覆盖安装。

## 正式签名及私人词库

可通过环境变量`WORDMEMO_KEYSTORE`、`WORDMEMO_KEYSTORE_PASSWORD`、`WORDMEMO_KEY_ALIAS`传入自己的签名，然后执行`./gradlew clean assembleRelease`。未提供时输出未签名的release包。不要把凭据写入Gradle文件。

私人本地构建可附加`-PwordmemoBookPath=词库JSON绝对路径`替换内置示例。公开构建不传此参数，必须只含6张原创示例卡；私人词库与含私人词库的安装包不得上传公开仓库或Release。
