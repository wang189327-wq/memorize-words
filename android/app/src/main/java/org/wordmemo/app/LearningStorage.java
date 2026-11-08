package org.wordmemo.app;

import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Owns the single durable learning snapshot; callers never manage replacement files. */
final class LearningStorage {
  private static final int MAX_BYTES = 30 * 1024 * 1024;
  private final AtomicFile state;

  LearningStorage(File directory) {
    state = new AtomicFile(new File(directory, "learning-state.json"));
  }

  synchronized String load() {
    try {
      String raw = read(state.openRead());
      new JSONObject(raw);
      return raw;
    } catch (FileNotFoundException missing) {
      return "";
    } catch (Exception invalid) {
      return "{\"readError\":true}";
    }
  }

  synchronized boolean save(String raw) {
    try {
      if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return false;
      JSONObject value = new JSONObject(raw);
      if (value.getInt("schemaVersion") != 1 || !value.has("deck") || !value.has("learned"))
        return false;
    } catch (Exception invalid) {
      return false;
    }
    FileOutputStream stream = null;
    try {
      stream = state.startWrite();
      stream.write(raw.getBytes(StandardCharsets.UTF_8));
      state.finishWrite(stream);
      return true;
    } catch (IOException error) {
      if (stream != null) state.failWrite(stream);
      return false;
    }
  }

  synchronized boolean hasValidState() {
    String raw = load();
    try {
      return new JSONObject(raw).getInt("schemaVersion") == 1;
    } catch (Exception invalid) {
      return false;
    }
  }

  static String read(InputStream input) throws IOException {
    try (InputStream in = input;
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int count, total = 0;
      while ((count = in.read(buffer)) != -1) {
        total += count;
        if (total > MAX_BYTES) throw new IOException("文件超过30MB限制");
        out.write(buffer, 0, count);
      }
      return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
  }
}
