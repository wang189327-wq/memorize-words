package org.wordmemo.app;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.SQLiteMode;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
@SQLiteMode(SQLiteMode.Mode.LEGACY)
public class LearningStorageTest {
  @Rule public TemporaryFolder temporary = new TemporaryFolder();
  private LearningStorage storage;

  @After
  public void close() {
    if (storage != null) storage.close();
  }

  private JSONObject state() throws Exception {
    return new JSONObject(
        "{\"schemaVersion\":1,\"deck\":{\"bookId\":\"demo\",\"cards\":[{\"id\":\"word\"}]},\"learned\":{\"word\":{\"date\":\"2026-11-01\"}},\"results\":[],\"favorites\":{},\"cursor\":\"word\",\"learningPlan\":{\"drill\":{\"seen\":[\"word\"],\"lastReviewed\":0}}}");
  }

  private JSONObject patch(JSONObject puts) throws Exception {
    return new JSONObject()
        .put("replace", false)
        .put("expectedBookId", "demo")
        .put("bookId", "demo")
        .put("puts", puts)
        .put("deletes", new JSONObject());
  }

  @Test
  public void verifiedMigrationRetainsPlanAndRemovesLegacyOnlyAfterSuccess() throws Exception {
    File directory = temporary.newFolder(), legacy = new File(directory, "learning-state.json");
    String original = state().toString();
    Files.write(legacy.toPath(), original.getBytes(StandardCharsets.UTF_8));
    storage = new LearningStorage(directory);
    assertTrue(storage.needsMigration());
    assertEquals(original, storage.load());
    assertFalse(storage.save("{invalid"));
    assertTrue(legacy.exists());
    assertTrue(storage.save(original));
    assertFalse(storage.needsMigration());
    assertFalse(legacy.exists());
    JSONObject loaded = new JSONObject(storage.load());
    assertEquals("word", loaded.getString("cursor"));
    assertEquals(
        "word",
        loaded
            .getJSONObject("learningPlan")
            .getJSONObject("drill")
            .getJSONArray("seen")
            .getString(0));
    storage.close();
    storage = new LearningStorage(directory);
    assertEquals(
        "2026-11-01",
        new JSONObject(storage.load())
            .getJSONObject("learned")
            .getJSONObject("word")
            .getString("date"));
  }

  @Test
  public void invalidLaterRowRollsBackEarlierWritesAndWrongBookCannotCommit() throws Exception {
    storage = new LearningStorage(temporary.newFolder());
    assertTrue(storage.save(state().toString()));
    JSONObject row = new JSONObject().put("date", "2026-11-08");
    JSONArray learned = new JSONArray().put(new JSONArray().put("word").put(row));
    JSONObject invalid =
        new JSONObject().put("learned", learned).put("forbidden-table", new JSONArray());
    assertFalse(storage.commit(patch(invalid).toString()));
    assertEquals(
        "2026-11-01",
        new JSONObject(storage.load())
            .getJSONObject("learned")
            .getJSONObject("word")
            .getString("date"));
    assertFalse(storage.commit(patch(new JSONObject()).put("expectedBookId", "other").toString()));
    assertTrue(storage.commit(patch(new JSONObject().put("learned", learned)).toString()));
    assertEquals(
        "2026-11-08",
        new JSONObject(storage.load())
            .getJSONObject("learned")
            .getJSONObject("word")
            .getString("date"));
  }
}
