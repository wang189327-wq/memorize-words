package org.wordmemo.app;

import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** A grant-only, read-only URI for the single verified updater cache file. */
public final class UpdateApkProvider extends ContentProvider {
  @Override
  public boolean onCreate() {
    return true;
  }

  private File file(Uri uri) throws FileNotFoundException {
    String token = getContext().getSharedPreferences("update-download", 0).getString("token", "");
    if (token.isEmpty()
        || !(getContext().getPackageName() + ".updates").equals(uri.getAuthority())
        || !("/" + token + "/update.apk").equals(uri.getPath())
        || uri.getQuery() != null) throw new FileNotFoundException();
    File file = new File(getContext().getCacheDir(), "updates/update.apk");
    if (!file.isFile()) throw new FileNotFoundException();
    return file;
  }

  @Override
  public String getType(Uri uri) {
    return "application/vnd.android.package-archive";
  }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override
  public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
    try {
      File f = file(uri);
      String[] columns =
          projection == null
              ? new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}
              : projection;
      MatrixCursor cursor = new MatrixCursor(columns);
      Object[] row = new Object[columns.length];
      for (int i = 0; i < columns.length; i++)
        row[i] =
            OpenableColumns.DISPLAY_NAME.equals(columns[i])
                ? "ielts75-update.apk"
                : OpenableColumns.SIZE.equals(columns[i]) ? f.length() : null;
      cursor.addRow(row);
      return cursor;
    } catch (FileNotFoundException e) {
      return null;
    }
  }

  @Override
  public Uri insert(Uri uri, ContentValues values) {
    throw new UnsupportedOperationException();
  }

  @Override
  public int update(Uri uri, ContentValues values, String selection, String[] args) {
    throw new UnsupportedOperationException();
  }

  @Override
  public int delete(Uri uri, String selection, String[] args) {
    throw new UnsupportedOperationException();
  }
}
