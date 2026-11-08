package org.wordmemo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import java.io.*;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

public final class AppUpdater {
  private static final int INSTALL_PERMISSION = 48;
  private final Activity activity;
  private final Consumer<String> status;
  private final SharedPreferences prefs;
  private final File directory;
  private final AtomicBoolean downloading = new AtomicBoolean(false);

  public AppUpdater(Activity activity, Consumer<String> status) {
    this.activity = activity;
    this.status = status;
    this.prefs = activity.getSharedPreferences("update-download", 0);
    directory = new File(activity.getCacheDir(), "updates");
    try {
      if (UpdateCache.cleanup(directory, installedVersion(), prefs.getInt("target", 0)))
        prefs.edit().clear().commit();
    } catch (Exception e) {
      android.util.Log.w("IELTS75-Update", "Cache cleanup will retry on next launch");
    }
  }

  private int installedVersion() throws PackageManager.NameNotFoundException {
    return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionCode;
  }

  private void verifyPackage(File file, int target) throws Exception {
    PackageManager manager = activity.getPackageManager();
    PackageInfo
        next = manager.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES),
        current = manager.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES);
    if (next == null
        || !activity.getPackageName().equals(next.packageName)
        || next.versionCode != target
        || target <= current.versionCode
        || next.signatures == null
        || current.signatures == null
        || !Arrays.equals(next.signatures, current.signatures))
      throw new IOException("更新包版本或签名不匹配，请重新检查版本");
  }

  public void download(String url, String sha, int target) {
    if (!UpdateCache.trustedRelease(url) || sha == null || !sha.matches("[a-f0-9]{64}")) {
      status.accept("更新清单无效");
      return;
    }
    if (!downloading.compareAndSet(false, true)) {
      status.accept("更新包正在下载，请稍候");
      return;
    }
    status.accept("正在下载更新包，完成后将打开系统安装确认页。");
    new Thread(
            () -> {
              File part = new File(directory, "update.part.apk"),
                  apk = new File(directory, "update.apk");
              try {
                if (target <= installedVersion()) throw new IOException("当前已是最新版本，请重新检查版本");
                if (!directory.isDirectory() && !directory.mkdirs())
                  throw new IOException("无法创建更新缓存，请检查设备空间");
                if (prefs.getInt("target", 0) != target || !UpdateCache.verified(apk, sha)) {
                  UpdateCache.download(url, part, sha);
                  verifyPackage(part, target);
                  if (apk.exists() && !apk.delete()) throw new IOException("无法替换旧更新缓存");
                  if (!part.renameTo(apk)) throw new IOException("更新包保存失败");
                } else verifyPackage(apk, target);
                if (!prefs
                    .edit()
                    .putInt("target", target)
                    .putString("token", UUID.randomUUID().toString())
                    .commit()) throw new IOException("更新信息保存失败，请重试");
                activity.runOnUiThread(
                    () -> {
                      downloading.set(false);
                      if (!activity.isFinishing() && !activity.isDestroyed()) install();
                    });
              } catch (Exception e) {
                part.delete();
                downloading.set(false);
                status.accept("下载更新失败：" + e.getMessage() + "。本地学习数据保留。");
              }
            },
            "ielts-update-download")
        .start();
  }

  private void install() {
    if (!new File(directory, "update.apk").isFile()) {
      status.accept("更新缓存已清理，请重新下载");
      return;
    }
    if (!activity.getPackageManager().canRequestPackageInstalls()) {
      new AlertDialog.Builder(activity)
          .setTitle("允许安装词记更新")
          .setMessage("请允许词记安装更新，返回后会打开系统安装确认页。")
          .setPositiveButton(
              "前往允许",
              (d, w) -> {
                try {
                  activity.startActivityForResult(
                      new Intent(
                          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                          Uri.parse("package:" + activity.getPackageName())),
                      INSTALL_PERMISSION);
                } catch (Exception e) {
                  status.accept("请在系统设置中允许词记安装应用后重试");
                }
              })
          .setNegativeButton("稍后", null)
          .show();
      return;
    }
    try {
      Uri uri =
          Uri.parse(
              "content://"
                  + activity.getPackageName()
                  + ".updates/"
                  + prefs.getString("token", "")
                  + "/update.apk");
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      intent.setClipData(ClipData.newRawUri("词记更新", uri));
      activity.startActivity(intent);
    } catch (Exception e) {
      status.accept("无法打开系统安装器，请稍后重新下载更新");
    }
  }

  public boolean onActivityResult(int request) {
    if (request != INSTALL_PERMISSION) return false;
    if (activity.getPackageManager().canRequestPackageInstalls()) install();
    else status.accept("未允许安装更新，缓存已保留，可稍后重试");
    return true;
  }
}
