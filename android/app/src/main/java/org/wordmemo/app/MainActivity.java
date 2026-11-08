package org.wordmemo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.LinearLayout;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private WebView web;
  private int bottomSafe = 0;
  private boolean keyboardOpen = false;
  private SpeechController speech;
  private LearningStorage storage;
  private AppUpdater updater;
  private String pendingExport = "", pendingImport = "deck";
  private static final int IMPORT = 10, EXPORT = 11, MAX = 30 * 1024 * 1024;
  private static final String ORIGIN = "https://appassets.androidplatform.net/";
  private final Set<String> assets = new HashSet<>();

  private void indexAssets(String prefix) throws IOException {
    String[] children = getAssets().list(prefix);
    if (children == null || children.length == 0) {
      if (!prefix.isEmpty()) assets.add(prefix);
      return;
    }
    for (String child : children) indexAssets(prefix.isEmpty() ? child : prefix + "/" + child);
  }

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    try {
      indexAssets("");
    } catch (IOException error) {
      throw new IllegalStateException("Cannot index bundled assets", error);
    }
    updater = new AppUpdater(this, this::status);
    if (android.os.Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
    getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
    if (android.os.Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
    getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    storage = new LearningStorage(getFilesDir());
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.setBackgroundColor(0xfff5f8f8);
    layout.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          int left, top, right, keyboardBottom = 0;
          if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars =
                insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            left = bars.left;
            top = bars.top;
            right = bars.right;
            keyboardOpen = insets.isVisible(WindowInsets.Type.ime());
            keyboardBottom = keyboardOpen ? insets.getInsets(WindowInsets.Type.ime()).bottom : 0;
            bottomSafe = keyboardOpen ? 0 : bars.bottom;
          } else {
            left = insets.getSystemWindowInsetLeft();
            top = insets.getSystemWindowInsetTop();
            right = insets.getSystemWindowInsetRight();
            int bottom = insets.getSystemWindowInsetBottom();
            keyboardOpen = bottom > 100 * getResources().getDisplayMetrics().density;
            keyboardBottom = keyboardOpen ? bottom : 0;
            bottomSafe = keyboardOpen ? 0 : bottom;
          }
          v.setPadding(left, top, right, keyboardBottom);
          applySafeArea();
          return insets;
        });
    web = new WebView(this);
    layout.addView(web, new LinearLayout.LayoutParams(-1, -1));
    setContentView(layout);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setSupportMultipleWindows(false);
    s.setJavaScriptCanOpenWindowsAutomatically(false);
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            applySafeArea();
          }

          @Override
          public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String name = u.getPath() == null ? "" : u.getPath().replaceFirst("^/", "");
            if ("https".equals(u.getScheme())
                && "appassets.androidplatform.net".equals(u.getHost())
                && assets.contains(name)) {
              try {
                String mime =
                    name.endsWith(".js")
                        ? "application/javascript"
                        : name.endsWith(".css")
                            ? "text/css"
                            : name.endsWith(".json")
                                ? "application/json"
                                : name.endsWith(".png") ? "image/png" : "text/html";
                return new WebResourceResponse(mime, "UTF-8", getAssets().open(name));
              } catch (IOException e) {
                return blocked();
              }
            }
            if ("https".equals(u.getScheme())
                && !"appassets.androidplatform.net".equals(u.getHost())) return null;
            return blocked();
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return !req.getUrl().toString().equals(ORIGIN + "index.html");
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onJsConfirm(WebView v, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("词记")
                .setMessage(message)
                .setPositiveButton("确认", (d, w) -> result.confirm())
                .setNegativeButton("取消", (d, w) -> result.cancel())
                .setOnCancelListener(d -> result.cancel())
                .show();
            return true;
          }
        });
    web.addJavascriptInterface(new Store(), "AndroidStore");
    speech = new SpeechController(this, this::status);
    web.loadUrl(ORIGIN + "index.html");
  }

  private void applySafeArea() {
    if (web == null) return;
    float density = getResources().getDisplayMetrics().density;
    String js =
        "document.documentElement.style.setProperty('--system-bottom','"
            + (bottomSafe / density)
            + "px');document.body.classList.toggle('keyboard-open',"
            + keyboardOpen
            + ");";
    web.evaluateJavascript(js, null);
  }

  private WebResourceResponse blocked() {
    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
  }

  private String readLimited(InputStream in) throws IOException {
    try (InputStream src = in;
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buf = new byte[8192];
      int n, total = 0;
      while ((n = src.read(buf)) != -1) {
        total += n;
        if (total > MAX) throw new IOException("文件超过30MB限制");
        out.write(buf, 0, n);
      }
      return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
  }

  private void status(String msg) {
    runOnUiThread(
        () -> {
          if (!isFinishing() && web != null)
            web.evaluateJavascript("window.onNativeStatus(" + JSONObject.quote(msg) + ")", null);
        });
  }

  private class Store {
    @JavascriptInterface
    public void downloadUpdate(String url, String sha, int target) {
      updater.download(url, sha, target);
    }

    @JavascriptInterface
    public void openUpdateUrl(String url) {
      if (!UpdateCache.trustedRelease(url)) {
        status("更新下载地址不受信任");
        return;
      }
      runOnUiThread(
          () -> {
            try {
              startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
              status("无法打开下载页面，请安装可用浏览器。");
            }
          });
    }

    @JavascriptInterface
    public void exitApp() {
      runOnUiThread(() -> finish());
    }

    @JavascriptInterface
    public String load() {
      return storage.load();
    }

    @JavascriptInterface
    public boolean save(String raw) {
      return storage.save(raw);
    }

    @JavascriptInterface
    public boolean commit(String patch) {
      return storage.commit(patch);
    }

    @JavascriptInterface
    public boolean needsMigration() {
      return storage.needsMigration();
    }

    @JavascriptInterface
    public boolean protectCurrent() {
      return storage.hasValidState();
    }

    @JavascriptInterface
    public void importFile(String kind) {
      runOnUiThread(
          () -> {
            pendingImport = "restore".equals(kind) ? "restore" : "deck";
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            try {
              startActivityForResult(i, IMPORT);
            } catch (Exception e) {
              status("无法打开文件选择器：" + e.getMessage());
            }
          });
    }

    @JavascriptInterface
    public void exportFile(String raw, String name) {
      if (raw == null || raw.length() > MAX) {
        status("备份过大");
        return;
      }
      runOnUiThread(
          () -> {
            pendingExport = raw;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, name);
            try {
              startActivityForResult(i, EXPORT);
            } catch (Exception e) {
              pendingExport = "";
              status("无法打开文件保存界面");
            }
          });
    }

    @JavascriptInterface
    public void speak(String text, String language) {
      speech.speak(text, language);
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (updater.onActivityResult(request)) return;
    if (result != RESULT_OK || data == null || data.getData() == null) {
      pendingExport = "";
      return;
    }
    Uri uri = data.getData();
    if (request == IMPORT) {
      final String kind = pendingImport;
      new Thread(
              () -> {
                try {
                  String raw = readLimited(getContentResolver().openInputStream(uri));
                  runOnUiThread(
                      () -> {
                        if (!isFinishing())
                          web.evaluateJavascript(
                              "window.onNativeImport("
                                  + JSONObject.quote(raw)
                                  + ","
                                  + JSONObject.quote(kind)
                                  + ")",
                              null);
                      });
                } catch (Exception e) {
                  status("读取失败：" + e.getMessage());
                }
              },
              "ielts-import")
          .start();
    } else if (request == EXPORT) {
      final String raw = pendingExport;
      pendingExport = "";
      new Thread(
              () -> {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                  if (out == null) throw new IOException("无法写入文件");
                  out.write(raw.getBytes(StandardCharsets.UTF_8));
                  out.flush();
                  status("备份已导出，请妥善保存。");
                } catch (Exception e) {
                  status("导出失败：" + e.getMessage());
                }
              },
              "ielts-export")
          .start();
    }
  }

  @Override
  protected void onPause() {
    super.onPause();
    if (speech != null) speech.stop();
  }

  @Override
  protected void onDestroy() {
    if (speech != null) speech.close();
    if (web != null) {
      web.removeJavascriptInterface("AndroidStore");
      web.destroy();
      web = null;
    }
    if (storage != null) storage.close();
    super.onDestroy();
  }

  @Override
  public void onBackPressed() {
    web.evaluateJavascript(
        "Boolean(window.onNativeBack?.())",
        r -> {
          if (!"true".equals(r))
            new AlertDialog.Builder(this)
                .setTitle("退出词记？")
                .setMessage("学习和复习记录已保存在本机。")
                .setPositiveButton("退出", (d, w) -> finish())
                .setNegativeButton("继续学习", null)
                .show();
        });
  }
}
