# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# EncryptedSharedPreferences / Tink
-keepclassmembers class * extends com.google.crypto.tink.shaded.protobuf.GeneratedMessageLite {
    <fields>;
}

# Keep our own classes
-keep class com.eatwell.garminwidget.** { *; }

# JSON
-keepclassmembers class org.json.** { *; }
