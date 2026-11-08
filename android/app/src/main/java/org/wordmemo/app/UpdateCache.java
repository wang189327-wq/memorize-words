package org.wordmemo.app;

import java.io.*;
import java.net.*;
import java.security.MessageDigest;

/** Only updater-owned files live here; learning data is never passed to this class. */
public final class UpdateCache {
  private UpdateCache() {}

  public static boolean trustedRelease(String value) {
    return trustedRelease(value, BuildConfig.UPDATE_RELEASE_BASE);
  }

  public static boolean trustedRelease(String value, String base) {
    try {
      if (base == null || base.isEmpty() || !base.endsWith("/")) return false;
      URL url = new URL(value), root = new URL(base);
      return "https".equals(url.getProtocol())
          && url.getUserInfo() == null
          && url.getQuery() == null
          && url.getRef() == null
          && url.getAuthority().equals(root.getAuthority())
          && url.getPath().startsWith(root.getPath())
          && url.getPath().endsWith(".apk");
    } catch (Exception invalid) {
      return false;
    }
  }

  private static boolean trustedHop(URL url) {
    try {
      String host = url.getHost(), origin = new URL(BuildConfig.UPDATE_RELEASE_BASE).getHost();
      return "https".equals(url.getProtocol())
          && url.getUserInfo() == null
          && (url.getPort() == -1 || url.getPort() == 443)
          && (origin.equals(host)
              || ("github.com".equals(origin)
                  && ("release-assets.githubusercontent.com".equals(host)
                      || "objects.githubusercontent.com".equals(host))));
    } catch (Exception invalid) {
      return false;
    }
  }

  public static boolean verified(File file, String sha) throws Exception {
    if (!file.isFile() || sha == null || !sha.matches("[a-f0-9]{64}")) return false;
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream in = new FileInputStream(file)) {
      byte[] buf = new byte[32768];
      int n;
      while ((n = in.read(buf)) != -1) digest.update(buf, 0, n);
    }
    StringBuilder actual = new StringBuilder();
    for (byte b : digest.digest()) actual.append(String.format("%02x", b & 255));
    return sha.equals(actual.toString());
  }

  public static void download(String url, File part, String sha) throws Exception {
    if (!trustedRelease(url) || sha == null || !sha.matches("[a-f0-9]{64}"))
      throw new IOException("更新清单无效");
    URL next = new URL(url);
    boolean complete = false;
    try {
      for (int redirects = 0; redirects < 6; redirects++) {
        if (!trustedHop(next)) throw new IOException("更新跳转地址不受信任");
        HttpURLConnection connection = (HttpURLConnection) next.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("User-Agent", "IELTS75-Updater");
        try {
          int code = connection.getResponseCode();
          if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
            String location = connection.getHeaderField("Location");
            if (location == null) throw new IOException("更新下载跳转无效");
            next = new URL(next, location);
            continue;
          }
          if (code != 200) throw new IOException("更新下载失败（" + code + "）");
          try (InputStream in = connection.getInputStream();
              FileOutputStream out = new FileOutputStream(part)) {
            byte[] buf = new byte[32768];
            int n, total = 0;
            while ((n = in.read(buf)) != -1) {
              total += n;
              if (total > 64 * 1024 * 1024) throw new IOException("更新包超过64MB限制");
              out.write(buf, 0, n);
            }
            out.getFD().sync();
          }
          if (!verified(part, sha)) throw new IOException("更新包校验失败，请重试");
          complete = true;
          return;
        } finally {
          connection.disconnect();
        }
      }
      throw new IOException("更新下载跳转过多");
    } finally {
      if (!complete) part.delete();
    }
  }

  public static boolean cleanup(File directory, int installed, int target) throws IOException {
    if (target < 1 || installed < target) return false;
    for (String name : new String[] {"update.apk", "update.part", "update.part.apk"}) {
      File file = new File(directory, name);
      if (file.exists() && !file.delete()) throw new IOException("更新安装包缓存清理失败");
    }
    return true;
  }
}
