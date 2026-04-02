package com.eatwell.garminwidget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Declared as APPWIDGET_CONFIGURE activity so Android shows it when a widget is added.
 * If already authenticated, immediately returns OK and the widget appears.
 * If not, forwards to LoginActivity which handles the auth and returns the result.
 */
class WidgetConfigActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        )

        // Cancel result by default (user pressed back)
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val auth = GarminAuthManager(this)

        if (auth.isAuthenticated) {
            // Already set up — just confirm and add the widget
            HydrationWidget.updateAll(this)
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
            finish()
        } else {
            // Send user through login, passing the widget ID
            val loginIntent = Intent(this, LoginActivity::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            startActivityForResult(loginIntent, REQUEST_LOGIN)
        }
    }

    @Deprecated("Required for API < 31")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_LOGIN) {
            // Propagate whatever result LoginActivity set
            setResult(resultCode, data)
            finish()
        }
    }

    companion object {
        private const val REQUEST_LOGIN = 1001
    }
}
