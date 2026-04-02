package com.eatwell.garminwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Home screen AppWidget.
 *
 * - Displays today's hydration total (ml) with a water drop icon.
 * - Tap triggers ACTION_LOG_WATER → logs 200 ml → refreshes display.
 * - Handles BOOT_COMPLETED to restore the widget after device restart.
 */
class HydrationWidget : AppWidgetProvider() {

    // A coroutine scope that lives as long as the process does.
    // AppWidgetProvider is stateless so we keep scope at companion level.
    companion object {
        private const val TAG = "HydrationWidget"
        const val ACTION_LOG_WATER = "com.eatwell.garminwidget.ACTION_LOG_WATER"

        private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

        /** Force-update every widget instance on the home screen. */
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, HydrationWidget::class.java)
            )
            if (ids.isNotEmpty()) {
                val intent = Intent(context, HydrationWidget::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            }
        }

        /** Build the RemoteViews for a single widget instance. */
        private fun buildViews(context: Context, totalMl: Int, isLoading: Boolean): RemoteViews {
            return RemoteViews(context.packageName, R.layout.widget_hydration).apply {
                setTextViewText(
                    R.id.tvTotal,
                    if (isLoading) "…" else "${totalMl} ml"
                )

                // Tap anywhere on the widget to log 200 ml
                val tapIntent = Intent(context, HydrationWidget::class.java).apply {
                    action = ACTION_LOG_WATER
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    0,
                    tapIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                setOnClickPendingIntent(R.id.widgetRoot, pendingIntent)
            }
        }
    }

    // ---- AppWidgetProvider callbacks --------------------------------------

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (id in appWidgetIds) {
            // Show loading state immediately
            appWidgetManager.updateAppWidget(id, buildViews(context, 0, isLoading = true))
        }
        refreshTotal(context, appWidgetManager, appWidgetIds)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        when (intent.action) {
            ACTION_LOG_WATER -> {
                val manager = AppWidgetManager.getInstance(context)
                val ids = manager.getAppWidgetIds(
                    ComponentName(context, HydrationWidget::class.java)
                )
                logWaterAndRefresh(context, manager, ids)
            }
            Intent.ACTION_BOOT_COMPLETED -> {
                updateAll(context)
            }
        }
    }

    // ---- Core logic -------------------------------------------------------

    private fun refreshTotal(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray
    ) {
        scope.launch {
            val auth = GarminAuthManager(context)
            if (!auth.isAuthenticated) {
                // Not logged in — show prompt on widget
                for (id in ids) {
                    val views = RemoteViews(context.packageName, R.layout.widget_hydration).apply {
                        setTextViewText(R.id.tvTotal, "Tap to set up")
                        val setupIntent = PendingIntent.getActivity(
                            context,
                            0,
                            Intent(context, LoginActivity::class.java),
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                        )
                        setOnClickPendingIntent(R.id.widgetRoot, setupIntent)
                    }
                    manager.updateAppWidget(id, views)
                }
                return@launch
            }

            val api = GarminApiClient(auth)
            runCatching { api.getTodayTotal() }
                .onSuccess { totalMl ->
                    val views = buildViews(context, totalMl.toInt(), isLoading = false)
                    for (id in ids) manager.updateAppWidget(id, views)
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to fetch hydration total", e)
                    for (id in ids) {
                        val views = buildViews(context, 0, isLoading = false).apply {
                            setTextViewText(R.id.tvTotal, "Error")
                        }
                        manager.updateAppWidget(id, views)
                    }
                }
        }
    }

    private fun logWaterAndRefresh(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray
    ) {
        // Immediately show loading
        for (id in ids) manager.updateAppWidget(id, buildViews(context, 0, isLoading = true))

        scope.launch {
            val auth = GarminAuthManager(context)
            val api = GarminApiClient(auth)

            runCatching { api.logWater(200.0) }
                .onSuccess {
                    Log.d(TAG, "Logged 200ml successfully")
                    // Fetch updated total
                    val total = runCatching { api.getTodayTotal() }.getOrDefault(0.0)
                    val views = buildViews(context, total.toInt(), isLoading = false)
                    for (id in ids) manager.updateAppWidget(id, views)

                    // Toast — post to main thread
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        Toast.makeText(context, "+200ml logged!", Toast.LENGTH_SHORT).show()
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to log water", e)
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        Toast.makeText(
                            context,
                            "Failed to log: ${e.message}",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    // Refresh to show current (unfailed) state
                    refreshTotal(context, manager, ids)
                }
        }
    }
}
