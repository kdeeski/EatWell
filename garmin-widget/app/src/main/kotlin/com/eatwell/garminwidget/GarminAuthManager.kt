package com.eatwell.garminwidget

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Handles Garmin Connect mobile SSO authentication.
 *
 * Flow (mirrors python-garminconnect):
 *  1. GET SSO login page to obtain CSRF token + session cookies
 *  2. POST credentials to SSO signin endpoint
 *  3. Follow redirects to extract the service ticket
 *  4. Exchange service ticket for OAuth1 consumer token
 *  5. Exchange OAuth1 token for OAuth2 access + refresh tokens
 *  6. Persist tokens in EncryptedSharedPreferences
 *
 * Token refresh uses the stored refresh token automatically.
 */
class GarminAuthManager(context: Context) {

    companion object {
        private const val TAG = "GarminAuth"

        // Garmin SSO / Connect base URLs
        private const val SSO_ORIGIN = "https://sso.garmin.com"
        private const val SSO_URL = "https://sso.garmin.com/sso"
        private const val SSO_EMBED_URL = "https://sso.garmin.com/sso/embed"
        private const val SSO_SIGNIN_URL = "https://sso.garmin.com/sso/signin"
        private const val CONNECT_URL = "https://connect.garmin.com"
        private const val OAUTH_CONSUMER_URL =
            "https://connectapi.garmin.com/oauth-service/oauth/preauthorized"
        private const val OAUTH_TOKEN_URL =
            "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0"

        // OAuth1 consumer credentials (same as Garmin Connect mobile app)
        private const val CONSUMER_KEY = "fc3e99d2-118c-44b8-8ae3-03370dde24c0"
        private const val CONSUMER_SECRET = "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF"

        // Prefs keys
        private const val PREF_ACCESS_TOKEN = "access_token"
        private const val PREF_REFRESH_TOKEN = "refresh_token"
        private const val PREF_TOKEN_EXPIRY = "token_expiry"
        private const val PREF_EMAIL = "email"
    }

    private val prefs = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "garmin_auth_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    // OkHttp client that follows redirects and preserves cookies between calls
    private val cookieJar = SimpleCookieJar()
    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    // ---- Public API -------------------------------------------------------

    val isAuthenticated: Boolean
        get() = prefs.getString(PREF_ACCESS_TOKEN, null) != null

    val savedEmail: String?
        get() = prefs.getString(PREF_EMAIL, null)

    /**
     * Full login with email + password. Throws on failure.
     * Stores tokens in EncryptedSharedPreferences on success.
     */
    @Throws(AuthException::class, IOException::class)
    fun login(email: String, password: String) {
        cookieJar.clear()

        // Step 1 – get CSRF token from SSO login page
        val csrfToken = fetchCsrfToken()
        Log.d(TAG, "CSRF token obtained")

        // Step 2 – POST credentials
        val ticketUrl = postCredentials(email, password, csrfToken)
        Log.d(TAG, "Ticket URL: $ticketUrl")

        // Step 3 – exchange service ticket for OAuth1 token
        val (oauth1Token, oauth1Secret) = exchangeTicketForOAuth1(ticketUrl)
        Log.d(TAG, "OAuth1 token obtained")

        // Step 4 – exchange OAuth1 for OAuth2
        val (accessToken, refreshToken, expiresIn) = exchangeOAuth1ForOAuth2(
            oauth1Token, oauth1Secret
        )
        Log.d(TAG, "OAuth2 tokens obtained")

        // Persist
        val expiryMs = System.currentTimeMillis() + expiresIn * 1000L
        prefs.edit()
            .putString(PREF_ACCESS_TOKEN, accessToken)
            .putString(PREF_REFRESH_TOKEN, refreshToken)
            .putLong(PREF_TOKEN_EXPIRY, expiryMs)
            .putString(PREF_EMAIL, email)
            .apply()
    }

    /**
     * Returns a valid Bearer token, refreshing if needed.
     */
    @Throws(AuthException::class, IOException::class)
    fun getValidAccessToken(): String {
        val expiry = prefs.getLong(PREF_TOKEN_EXPIRY, 0L)
        // Refresh 5 minutes before expiry
        return if (System.currentTimeMillis() < expiry - 5 * 60 * 1000L) {
            prefs.getString(PREF_ACCESS_TOKEN, null)
                ?: throw AuthException("No access token stored")
        } else {
            refreshAccessToken()
        }
    }

    fun logout() {
        prefs.edit().clear().apply()
        cookieJar.clear()
    }

    // ---- Private implementation -------------------------------------------

    private fun fetchCsrfToken(): String {
        val url = SSO_SIGNIN_URL.toHttpUrl().newBuilder()
            .addQueryParameter("id", "gauth-widget")
            .addQueryParameter("embedWidget", "true")
            .addQueryParameter("gauthHost", SSO_EMBED_URL)
            .addQueryParameter("service", SSO_EMBED_URL)
            .addQueryParameter("source", SSO_EMBED_URL)
            .addQueryParameter("redirectAfterAccountLoginUrl", SSO_EMBED_URL)
            .addQueryParameter("redirectAfterAccountCreationUrl", SSO_EMBED_URL)
            .build()

        val request = Request.Builder()
            .url(url)
            .header("User-Agent", MOBILE_USER_AGENT)
            .header("origin", SSO_ORIGIN)
            .get()
            .build()

        val body = httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) throw AuthException("Failed to load SSO page: ${resp.code}")
            resp.body?.string() ?: throw AuthException("Empty SSO page body")
        }

        // Extract _csrf hidden input value
        val match = Regex("""name="_csrf"\s+value="([^"]+)"""").find(body)
            ?: throw AuthException("CSRF token not found in SSO page")
        return match.groupValues[1]
    }

    private fun postCredentials(email: String, password: String, csrfToken: String): String {
        val url = SSO_SIGNIN_URL.toHttpUrl().newBuilder()
            .addQueryParameter("id", "gauth-widget")
            .addQueryParameter("embedWidget", "true")
            .addQueryParameter("gauthHost", SSO_EMBED_URL)
            .addQueryParameter("service", SSO_EMBED_URL)
            .addQueryParameter("source", SSO_EMBED_URL)
            .addQueryParameter("redirectAfterAccountLoginUrl", SSO_EMBED_URL)
            .addQueryParameter("redirectAfterAccountCreationUrl", SSO_EMBED_URL)
            .build()

        val formBody = FormBody.Builder()
            .add("username", email)
            .add("password", password)
            .add("embed", "true")
            .add("_csrf", csrfToken)
            .build()

        val request = Request.Builder()
            .url(url)
            .header("User-Agent", MOBILE_USER_AGENT)
            .header("origin", SSO_ORIGIN)
            .header("referer", url.toString())
            .post(formBody)
            .build()

        val responseBody = httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) throw AuthException("Login POST failed: ${resp.code}")
            resp.body?.string() ?: throw AuthException("Empty login response")
        }

        // The response HTML contains a ticket URL in a form action or a redirect
        val ticketMatch = Regex("""ticket=([^&"'\s]+)""").find(responseBody)
            ?: throw AuthException("Login failed — check credentials. No ticket in response.")
        val ticket = ticketMatch.groupValues[1]
        return "$SSO_EMBED_URL?ticket=$ticket"
    }

    private fun exchangeTicketForOAuth1(ticketUrl: String): Pair<String, String> {
        val url = OAUTH_CONSUMER_URL.toHttpUrl().newBuilder()
            .addQueryParameter("ticket", ticketUrl.substringAfter("ticket="))
            .addQueryParameter("login-url", SSO_EMBED_URL)
            .addQueryParameter("accepts-mfa-tokens", "true")
            .build()

        val authHeader = buildOAuth1Header(
            method = "GET",
            url = OAUTH_CONSUMER_URL,
            consumerKey = CONSUMER_KEY,
            consumerSecret = CONSUMER_SECRET,
            token = null,
            tokenSecret = null,
            extraParams = mapOf(
                "ticket" to ticketUrl.substringAfter("ticket="),
                "login-url" to SSO_EMBED_URL,
                "accepts-mfa-tokens" to "true"
            )
        )

        val request = Request.Builder()
            .url(url)
            .header("User-Agent", MOBILE_USER_AGENT)
            .header("Authorization", authHeader)
            .get()
            .build()

        val body = httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) throw AuthException("OAuth1 exchange failed: ${resp.code}")
            resp.body?.string() ?: throw AuthException("Empty OAuth1 response")
        }

        // Response is URL-encoded: oauth_token=xxx&oauth_token_secret=yyy&...
        val params = parseUrlEncoded(body)
        val token = params["oauth_token"] ?: throw AuthException("No oauth_token in response")
        val secret = params["oauth_token_secret"] ?: throw AuthException("No oauth_token_secret")
        return Pair(token, secret)
    }

    private fun exchangeOAuth1ForOAuth2(
        oauth1Token: String,
        oauth1Secret: String
    ): Triple<String, String, Long> {
        val authHeader = buildOAuth1Header(
            method = "POST",
            url = OAUTH_TOKEN_URL,
            consumerKey = CONSUMER_KEY,
            consumerSecret = CONSUMER_SECRET,
            token = oauth1Token,
            tokenSecret = oauth1Secret,
            extraParams = emptyMap()
        )

        val request = Request.Builder()
            .url(OAUTH_TOKEN_URL)
            .header("User-Agent", MOBILE_USER_AGENT)
            .header("Authorization", authHeader)
            .post("".toRequestBody("application/x-www-form-urlencoded".toMediaType()))
            .build()

        val body = httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) throw AuthException("OAuth2 exchange failed: ${resp.code}")
            resp.body?.string() ?: throw AuthException("Empty OAuth2 response")
        }

        val json = JSONObject(body)
        val accessToken = json.getString("access_token")
        val refreshToken = json.getString("refresh_token")
        val expiresIn = json.optLong("expires_in", 3600L)
        return Triple(accessToken, refreshToken, expiresIn)
    }

    private fun refreshAccessToken(): String {
        val refreshToken = prefs.getString(PREF_REFRESH_TOKEN, null)
            ?: throw AuthException("No refresh token — please log in again")

        val refreshUrl = "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0/token"
        val formBody = FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("refresh_token", refreshToken)
            .build()

        val authHeader = buildBasicOAuth2Header(CONSUMER_KEY, CONSUMER_SECRET)

        val request = Request.Builder()
            .url(refreshUrl)
            .header("User-Agent", MOBILE_USER_AGENT)
            .header("Authorization", authHeader)
            .post(formBody)
            .build()

        val body = httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) throw AuthException("Token refresh failed: ${resp.code}")
            resp.body?.string() ?: throw AuthException("Empty refresh response")
        }

        val json = JSONObject(body)
        val newAccess = json.getString("access_token")
        val newRefresh = json.optString("refresh_token", refreshToken)
        val expiresIn = json.optLong("expires_in", 3600L)
        val expiryMs = System.currentTimeMillis() + expiresIn * 1000L

        prefs.edit()
            .putString(PREF_ACCESS_TOKEN, newAccess)
            .putString(PREF_REFRESH_TOKEN, newRefresh)
            .putLong(PREF_TOKEN_EXPIRY, expiryMs)
            .apply()

        return newAccess
    }

    // ---- OAuth1 signing ---------------------------------------------------

    private fun buildOAuth1Header(
        method: String,
        url: String,
        consumerKey: String,
        consumerSecret: String,
        token: String?,
        tokenSecret: String?,
        extraParams: Map<String, String>
    ): String {
        val timestamp = (System.currentTimeMillis() / 1000L).toString()
        val nonce = java.util.UUID.randomUUID().toString().replace("-", "")

        val oauthParams = mutableMapOf(
            "oauth_consumer_key" to consumerKey,
            "oauth_nonce" to nonce,
            "oauth_signature_method" to "HMAC-SHA1",
            "oauth_timestamp" to timestamp,
            "oauth_version" to "1.0"
        )
        if (token != null) oauthParams["oauth_token"] = token

        // Collect all params for base string
        val allParams = (oauthParams + extraParams).toSortedMap()
        val paramString = allParams.entries.joinToString("&") { (k, v) ->
            "${percentEncode(k)}=${percentEncode(v)}"
        }
        val baseString = listOf(method.uppercase(), percentEncode(url), percentEncode(paramString))
            .joinToString("&")

        val signingKey = "${percentEncode(consumerSecret)}&${percentEncode(tokenSecret ?: "")}"
        val signature = hmacSha1(signingKey, baseString)
        oauthParams["oauth_signature"] = signature

        val headerValue = oauthParams.entries.joinToString(", ") { (k, v) ->
            """${percentEncode(k)}="${percentEncode(v)}""""
        }
        return "OAuth $headerValue"
    }

    private fun buildBasicOAuth2Header(clientId: String, clientSecret: String): String {
        val credentials = "$clientId:$clientSecret"
        val encoded = android.util.Base64.encodeToString(
            credentials.toByteArray(), android.util.Base64.NO_WRAP
        )
        return "Basic $encoded"
    }

    private fun hmacSha1(key: String, data: String): String {
        val mac = javax.crypto.Mac.getInstance("HmacSHA1")
        val keySpec = javax.crypto.spec.SecretKeySpec(key.toByteArray(), "HmacSHA1")
        mac.init(keySpec)
        val bytes = mac.doFinal(data.toByteArray())
        return android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    }

    private fun percentEncode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8")
            .replace("+", "%20")
            .replace("*", "%2A")
            .replace("%7E", "~")

    private fun parseUrlEncoded(body: String): Map<String, String> =
        body.split("&").associate { pair ->
            val idx = pair.indexOf('=')
            if (idx < 0) pair to ""
            else java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8") to
                    java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
        }

    // ---- Constants --------------------------------------------------------

    private val MOBILE_USER_AGENT =
        "GCM-iOS-5.7.2.1 (com.garmin.connect.mobile; build:5.7.2.1; iOS 16.6.0) Alamofire/5.7.1"
}

class AuthException(message: String) : Exception(message)
