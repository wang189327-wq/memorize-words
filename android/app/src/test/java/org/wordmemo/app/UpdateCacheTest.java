package org.wordmemo.app;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Test;

public class UpdateCacheTest {
  @Test
  public void successfulVersionClearsOnlyOwnedApks() throws Exception {
    File root = Files.createTempDirectory("wordmemo-update").toFile();
    File directory = new File(root, "updates");
    assertTrue(directory.mkdir());
    File progress = new File(root, "learning-state.json");
    File apk = new File(directory, "update.apk");
    Files.write(progress.toPath(), "learning records".getBytes(StandardCharsets.UTF_8));
    Files.write(apk.toPath(), "abc".getBytes(StandardCharsets.UTF_8));
    try {
      assertFalse(UpdateCache.cleanup(directory, 25, 26));
      assertTrue(apk.isFile());
      assertTrue(
          UpdateCache.verified(
              apk, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
      assertFalse(
          UpdateCache.verified(
              apk, "0000000000000000000000000000000000000000000000000000000000000000"));
      assertTrue(UpdateCache.cleanup(directory, 26, 26));
      assertFalse(apk.exists());
      assertTrue(progress.isFile());
    } finally {
      Files.deleteIfExists(apk.toPath());
      Files.delete(progress.toPath());
      Files.delete(directory.toPath());
      Files.delete(root.toPath());
    }
  }

  @Test
  public void forksHaveNoBuiltInPublisher() {
    String base = "https://example.test/releases/";
    assertFalse(UpdateCache.trustedRelease("https://example.test/releases/v2/update.apk", ""));
    assertTrue(UpdateCache.trustedRelease("https://example.test/releases/v2/update.apk", base));
    assertFalse(UpdateCache.trustedRelease("https://other.test/releases/update.apk", base));
    assertFalse(UpdateCache.trustedRelease("http://example.test/releases/update.apk", base));
    assertFalse(
        UpdateCache.trustedRelease("https://example.test/releases/update.apk?override=1", base));
  }
}
