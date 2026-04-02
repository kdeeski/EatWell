package com.eatwell.garminwidget

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Garmin Connect internal API client.
 *
 * Hydration log endpoint (undocumented, reverse-engineered from mobile app traffic):
 *   POST https://connect.garmin.com/proxy/usersummary-service/usersummary/hydration/log
 *   Body: { "valueInML": 200.0, "userProfilePK": <int>, "calendarDate": "YYYY-MM-DD" }
 *
 * Today's total:
 *   GET  https://connect.garmin.com/proxy/usersummary-service/usersummary/hydration/allday/<date>
 */
class GarminApiClient(private val authManager: GarminAuthManager) {

    companion object {
        private const val TAG = "GarminApiClient"
        private const val BASE_URL = "https://connect.garmin.com"
        private const val LOG_ENDPOINT =
            "$BASE_URL/proxy/usersummary-service/usersummary/hydration/log"
        private const val ALLDAY_ENDPOINT =
            "$BASE_URL/proxy/usersummary-service/usersummary/hydration/allday"
        private const val PROFILE_ENDPOINT = "$BASE_URL/modern/currentuser-service/user/info"
    }

    private val client get() = authManager.httpClient

    /**
     * Log [amountMl] ml of water for today.
     * Returns the updated total for the day (ml), or null if the server
     * doesn't return the updated value (still success).
     */
    @Throws(AuthException::class, IOException::class, ApiException::class)
    fun logWater(amountMl: Double = 200.0): Double? {
        val token = authManager.getValidAccessToken()
        val today = todayDate()

        val body = JSONObject().apply {
            put("valueInML", amountMl)
            put("calendarDate", today)
        }.toString()

        val request = Request.Builder()
            .url(LOG_ENDPOINT)
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .header("NK", "NT")          // required by Garmin Connect API
            .header("X-App-Ver", "4.54.0.0")
            .header("DI-Backend", "connectapi.garmin.com")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        Log.d(TAG, "Logging $amountMl ml for $today")

        val responseBody = client.newCall(request).execute().use { resp ->
            val respBody = resp.body?.string()
            if (!resp.isSuccessful) {
                Log.e(TAG, "Log water failed ${resp.code}: $respBody")
                throw ApiException("Failed to log water: HTTP ${resp.code}")
            }
            respBody
        }

        // The POST may return the updated hydration entry
        return try {
            responseBody?.let {
                val json = JSONObject(it)
                json.optDouble("valueInML", -1.0).takeIf { v -> v >= 0 }
            }
        } catch (e: Exception) {
            null // non-critical, we can fetch the total separately
        }
    }

    /**
     * Fetch today's total hydration in ml.
     * Returns 0.0 if no data logged yet.
     */
    @Throws(AuthException::class, IOException::class, ApiException::class)
    fun getTodayTotal(): Double {
        val token = authManager.getValidAccessToken()
        val today = todayDate()

        val request = Request.Builder()
            .url("$ALLDAY_ENDPOINT/$today")
            .header("Authorization", "Bearer $token")
            .header("NK", "NT")
            .header("X-App-Ver", "4.54.0.0")
            .header("DI-Backend", "connectapi.garmin.com")
            .get()
            .build()

        val responseBody = client.newCall(request).execute().use { resp ->
            if (resp.code == 404) return 0.0 // no entry yet for today
            val body = resp.body?.string()
            if (!resp.isSuccessful) {
                Log.e(TAG, "Get total failed ${resp.code}: $body")
                throw ApiException("Failed to get hydration total: HTTP ${resp.code}")
            }
            body ?: return 0.0
        }

        return try {
            val json = JSONObject(responseBody)
            // The allday endpoint returns totalInML or valueInML depending on version
            json.optDouble("totalInML",
                json.optDouble("valueInML", 0.0))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse hydration response", e)
            0.0
        }
    }

    private fun todayDate(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        sdf.timeZone = TimeZone.getDefault()
        return sdf.format(Date())
    }
}

class ApiException(message: String) : Exception(message)
