package org.wordmemo.app;

import android.app.Activity;
import android.speech.tts.*;
import java.util.*;
import java.util.function.Consumer;

/** Caches ready offline voices; a missing British voice never silently becomes American. */
final class SpeechController {
  private final Activity activity;
  private final Consumer<String> status;
  private final Map<String, Voice> voices = new HashMap<>();
  private TextToSpeech engine;
  private boolean ready;
  private String active = "";

  SpeechController(Activity activity, Consumer<String> status) {
    this.activity = activity;
    this.status = status;
    engine =
        new TextToSpeech(
            activity,
            result -> {
              ready = result == TextToSpeech.SUCCESS;
              if (!ready) return;
              engine.setSpeechRate(.85f);
              cacheVoices();
              engine.setOnUtteranceProgressListener(
                  new UtteranceProgressListener() {
                    @Override
                    public void onStart(String id) {}

                    @Override
                    public void onDone(String id) {}

                    @Override
                    public void onError(String id) {
                      status.accept("朗读失败，请检查系统英语语音数据。");
                    }
                  });
            });
  }

  private void cacheVoices() {
    voices.clear();
    active = "";
    Set<Voice> installed = engine.getVoices();
    if (installed == null) return;
    for (Locale locale : new Locale[] {Locale.UK, Locale.US}) {
      Voice best = null;
      for (Voice voice : installed) {
        if (voice.isNetworkConnectionRequired()
            || voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
            || !"en".equals(voice.getLocale().getLanguage())
            || !locale.getCountry().equals(voice.getLocale().getCountry())) continue;
        if (best == null || voice.getQuality() > best.getQuality()) best = voice;
      }
      if (best != null) voices.put(locale.toLanguageTag(), best);
    }
  }

  void speak(String text, String language) {
    if (text == null || text.length() > 4000) return;
    activity.runOnUiThread(
        () -> {
          if (!ready) {
            status.accept("语音尚未就绪，请稍后重试。");
            return;
          }
          if (voices.isEmpty()) cacheVoices();
          String wanted = "en-US".equals(language) ? "en-US" : "en-GB";
          Voice voice = voices.get(wanted);
          if (voice == null) {
            status.accept("请在系统语音设置安装" + ("en-GB".equals(wanted) ? "英国" : "美国") + "英语离线声音。");
            return;
          }
          if (!voice.getName().equals(active)) {
            if (engine.setVoice(voice) == TextToSpeech.ERROR) {
              status.accept("无法启用所选英语声音。");
              return;
            }
            active = voice.getName();
          }
          if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "wordmemo-" + System.nanoTime())
              == TextToSpeech.ERROR) status.accept("朗读失败，请检查系统语音设置。");
        });
  }

  void stop() {
    if (engine != null) engine.stop();
  }

  void close() {
    if (engine != null) {
      engine.stop();
      engine.shutdown();
    }
  }
}
