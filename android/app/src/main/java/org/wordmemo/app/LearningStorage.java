package org.wordmemo.app;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/**
 * One transactional record database. The old snapshot is read only until JS validates its
 * migration.
 */
final class LearningStorage {
  private static final int MAX_BYTES = 30 * 1024 * 1024;
  private static final Set<String> TABLES =
      new HashSet<>(
          Arrays.asList("books", "learned", "results", "favorites", "ratings", "schedules"));
  private static final Set<String> RECORD_FIELDS =
      new HashSet<>(
          Arrays.asList(
              "deck",
              "learned",
              "results",
              "favorites",
              "favoriteChanges",
              "ratingEvents",
              "schedules"));
  private final SQLiteDatabase database;
  private final AtomicFile legacy;

  LearningStorage(File directory) {
    legacy = new AtomicFile(new File(directory, "learning-state.json"));
    database = SQLiteDatabase.openOrCreateDatabase(new File(directory, "learning.db"), null);
    database.enableWriteAheadLogging();
    database.execSQL(
        "CREATE TABLE IF NOT EXISTS records (store TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT"
            + " NULL, PRIMARY KEY(store,id))");
  }

  synchronized boolean needsMigration() {
    return legacy.getBaseFile().exists() || active() == null;
  }

  synchronized void close() {
    database.close();
  }

  private JSONObject active() {
    try (Cursor rows =
        database.rawQuery(
            "SELECT json FROM records WHERE store=? AND id=?",
            new String[] {"metadata", "active"})) {
      return rows.moveToFirst() ? new JSONObject(rows.getString(0)) : null;
    } catch (JSONException error) {
      throw new IllegalStateException("Invalid active state", error);
    }
  }

  private void put(String table, String key, Object value) {
    database.execSQL(
        "INSERT OR REPLACE INTO records(store,id,json) VALUES(?,?,?)",
        new Object[] {table, key, value.toString()});
  }

  /**
   * Called by the bridge with a changed-row patch, never an SQL expression or arbitrary table name.
   */
  synchronized boolean commit(String raw) {
    if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return false;
    database.beginTransaction();
    try {
      JSONObject patch = new JSONObject(raw), current = active();
      boolean replace = patch.getBoolean("replace");
      if (!replace
          && (current == null
              || !current.getString("bookId").equals(patch.optString("expectedBookId"))))
        return false;
      String bookId = patch.getString("bookId");
      if (bookId.isEmpty() || bookId.length() > 100) return false;
      if (replace) database.delete("records", null, null);
      JSONObject puts = patch.getJSONObject("puts"), deletes = patch.getJSONObject("deletes");
      for (Iterator<String> keys = puts.keys(); keys.hasNext(); ) {
        String table = keys.next();
        if (!TABLES.contains(table)) return false;
        JSONArray rows = puts.getJSONArray(table);
        for (int i = 0; i < rows.length(); i++) {
          JSONArray row = rows.getJSONArray(i);
          if (row.length() != 2 || row.getString(0).isEmpty()) return false;
          put(table, row.getString(0), row.get(1));
        }
      }
      for (Iterator<String> keys = deletes.keys(); keys.hasNext(); ) {
        String table = keys.next();
        if (!TABLES.contains(table)) return false;
        JSONArray ids = deletes.getJSONArray(table);
        for (int i = 0; i < ids.length(); i++)
          database.delete("records", "store=? AND id=?", new String[] {table, ids.getString(i)});
      }
      JSONObject metadata =
          patch.has("metadata") ? patch.getJSONObject("metadata") : current.getJSONObject("state");
      put("metadata", "active", new JSONObject().put("bookId", bookId).put("state", metadata));
      database.setTransactionSuccessful();
      return true;
    } catch (Exception error) {
      return false;
    } finally {
      database.endTransaction();
    }
  }

  synchronized String load() {
    try {
      // If verification was interrupted, retry the original source instead of hiding it.
      if (legacy.getBaseFile().exists() || active() == null) {
        try {
          return read(legacy.openRead());
        } catch (FileNotFoundException missing) {
          return "";
        }
      }
      return loadDatabase();
    } catch (Exception invalid) {
      return "{\"readError\":true}";
    }
  }

  private String loadDatabase() {
    try {
      JSONObject meta = active();
      if (meta == null) return "";
      JSONObject state = meta.getJSONObject("state"),
          learned = new JSONObject(),
          favorites = new JSONObject(),
          changes = new JSONObject(),
          schedules = new JSONObject();
      JSONArray results = new JSONArray(), ratings = new JSONArray();
      try (Cursor rows =
          database.rawQuery("SELECT store,id,json FROM records ORDER BY store,id", null)) {
        while (rows.moveToNext()) {
          String table = rows.getString(0), key = rows.getString(1);
          if ("metadata".equals(table)) continue;
          JSONObject value = new JSONObject(rows.getString(2));
          switch (table) {
            case "books":
              if (key.equals(meta.getString("bookId"))) state.put("deck", value);
              break;
            case "learned":
              learned.put(key, value);
              break;
            case "results":
              results.put(value);
              break;
            case "ratings":
              ratings.put(value);
              break;
            case "schedules":
              schedules.put(key, value);
              break;
            case "favorites":
              if (value.optBoolean("active")) favorites.put(key, true);
              if (value.has("change")) changes.put(key, value.getJSONObject("change"));
              break;
            default:
              throw new JSONException("Unknown store");
          }
        }
      }
      state
          .put("learned", learned)
          .put("results", chronological(results))
          .put("favorites", favorites)
          .put("favoriteChanges", changes)
          .put("ratingEvents", ratings)
          .put("schedules", schedules);
      if (!state.has("deck")) throw new JSONException("Missing book");
      return state.toString();
    } catch (Exception invalid) {
      return "{\"readError\":true}";
    }
  }

  /**
   * Full replacement is limited to validated migration/compatibility calls; normal learning uses
   * commit.
   */
  synchronized boolean save(String raw) {
    try {
      if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return false;
      JSONObject state = new JSONObject(raw),
          deck = state.getJSONObject("deck"),
          puts = new JSONObject(),
          metadata = new JSONObject();
      if (state.getInt("schemaVersion") != 1) return false;
      state.getJSONObject("learned");
      state.getJSONArray("results");
      deck.getJSONArray("cards");
      puts.put(
          "books", new JSONArray().put(new JSONArray().put(deck.getString("bookId")).put(deck)));
      for (String field : Arrays.asList("learned", "schedules")) {
        JSONObject values = state.optJSONObject(field);
        JSONArray rows = new JSONArray();
        if (values != null)
          for (Iterator<String> keys = values.keys(); keys.hasNext(); ) {
            String id = keys.next();
            rows.put(new JSONArray().put(id).put(values.get(id)));
          }
        puts.put(field, rows);
      }
      for (String field : Arrays.asList("results", "ratingEvents")) {
        JSONArray values = state.optJSONArray(field), rows = new JSONArray();
        Set<String> eventIds = new HashSet<>();
        if (values != null)
          for (int i = 0; i < values.length(); i++) {
            JSONObject event = values.getJSONObject(i);
            if (!event.has("eventId")) event.put("eventId", UUID.randomUUID().toString());
            if (!eventIds.add(event.getString("eventId"))) return false;
            rows.put(new JSONArray().put(event.getString("eventId")).put(event));
          }
        puts.put("results".equals(field) ? "results" : "ratings", rows);
      }
      JSONObject favorites = state.optJSONObject("favorites"),
          changes = state.optJSONObject("favoriteChanges");
      Set<String> ids = new HashSet<>();
      if (favorites != null)
        for (Iterator<String> keys = favorites.keys(); keys.hasNext(); ) ids.add(keys.next());
      if (changes != null)
        for (Iterator<String> keys = changes.keys(); keys.hasNext(); ) ids.add(keys.next());
      JSONArray favoriteRows = new JSONArray();
      for (String id : ids) {
        JSONObject value =
            new JSONObject().put("active", favorites != null && favorites.optBoolean(id));
        if (changes != null && changes.has(id)) value.put("change", changes.getJSONObject(id));
        favoriteRows.put(new JSONArray().put(id).put(value));
      }
      puts.put("favorites", favoriteRows);
      for (Iterator<String> keys = state.keys(); keys.hasNext(); ) {
        String key = keys.next();
        if (!RECORD_FIELDS.contains(key)) metadata.put(key, state.get(key));
      }
      if (!commit(
          new JSONObject()
              .put("replace", true)
              .put("bookId", deck.getString("bookId"))
              .put("puts", puts)
              .put("deletes", new JSONObject())
              .put("metadata", metadata)
              .toString())) return false;
      // Read the new database for verification, while retaining the original snapshot on failure.
      JSONObject verified = new JSONObject(loadDatabase());
      if (verified.getJSONObject("deck").getJSONArray("cards").length()
              != deck.getJSONArray("cards").length()
          || verified.getJSONArray("results").length() != state.getJSONArray("results").length())
        return false;
      legacy.delete();
      return true;
    } catch (Exception error) {
      return false;
    }
  }

  synchronized boolean hasValidState() {
    try {
      return new JSONObject(load()).getInt("schemaVersion") == 1;
    } catch (Exception invalid) {
      return false;
    }
  }

  private static JSONArray chronological(JSONArray input) throws JSONException {
    List<JSONObject> events = new ArrayList<>();
    for (int i = 0; i < input.length(); i++) events.add(input.getJSONObject(i));
    events.sort(
        Comparator.comparing((JSONObject event) -> event.optString("at", event.optString("date")))
            .thenComparing(event -> event.optString("eventId")));
    return new JSONArray(events);
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
