package com.eatwell.garminwidget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * First-launch setup screen.
 * - Shown automatically when no stored tokens exist.
 * - Also launched by WidgetConfigActivity when the widget is added but auth is missing.
 *
 * On success, updates all home screen widgets and finishes.
 */
class LoginActivity : AppCompatActivity() {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var auth: GarminAuthManager

    private lateinit var etEmail: EditText
    private lateinit var etPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        auth = GarminAuthManager(this)

        etEmail = findViewById(R.id.etEmail)
        etPassword = findViewById(R.id.etPassword)
        btnLogin = findViewById(R.id.btnLogin)
        progressBar = findViewById(R.id.progressBar)
        tvStatus = findViewById(R.id.tvStatus)

        // Pre-fill email if we have one stored
        auth.savedEmail?.let { etEmail.setText(it) }

        // If already authenticated, skip straight to success
        if (auth.isAuthenticated) {
            onLoginSuccess()
            return
        }

        btnLogin.setOnClickListener { attemptLogin() }
    }

    private fun attemptLogin() {
        val email = etEmail.text.toString().trim()
        val password = etPassword.text.toString()

        if (email.isEmpty() || password.isEmpty()) {
            tvStatus.text = "Please enter email and password"
            return
        }

        setLoading(true)
        tvStatus.text = "Signing in…"

        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { auth.login(email, password) }
            }
            setLoading(false)
            result.fold(
                onSuccess = {
                    Toast.makeText(
                        this@LoginActivity,
                        "Signed in! Widget ready.",
                        Toast.LENGTH_SHORT
                    ).show()
                    onLoginSuccess()
                },
                onFailure = { e ->
                    val msg = when (e) {
                        is AuthException -> e.message ?: "Authentication failed"
                        else -> "Network error: ${e.message}"
                    }
                    tvStatus.text = msg
                }
            )
        }
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        btnLogin.isEnabled = !loading
        etEmail.isEnabled = !loading
        etPassword.isEnabled = !loading
    }

    private fun onLoginSuccess() {
        // Trigger widget update for all instances
        HydrationWidget.updateAll(this)

        // If launched from widget config, return RESULT_OK
        val appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        )
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            val resultIntent = Intent().apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            setResult(RESULT_OK, resultIntent)
        }
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
