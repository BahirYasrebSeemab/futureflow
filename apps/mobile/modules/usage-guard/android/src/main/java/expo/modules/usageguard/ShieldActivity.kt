package expo.modules.usageguard

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher

/** Covers a blocked app once the time is gone. Built in code: it must work without React Native. */
class ShieldActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val dark =
      resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
        Configuration.UI_MODE_NIGHT_YES
    val background = if (dark) Color.rgb(18, 18, 20) else Color.rgb(246, 244, 240)
    val text = if (dark) Color.rgb(240, 240, 240) else Color.rgb(28, 28, 30)
    val pad = (24 * resources.displayMetrics.density).toInt()

    val root =
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(pad, pad, pad, pad)
        setBackgroundColor(background)
      }
    root.addView(
      TextView(this).apply {
        setText(R.string.guard_shield_title)
        textSize = 28f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(text)
        gravity = Gravity.CENTER
      }
    )
    root.addView(
      TextView(this).apply {
        setText(R.string.guard_shield_body)
        textSize = 17f
        setTextColor(text)
        gravity = Gravity.CENTER
        setPadding(0, pad / 2, 0, pad)
      }
    )
    root.addView(
      Button(this).apply {
        setText(R.string.guard_shield_open)
        setOnClickListener { openFutureFlow() }
      }
    )
    root.addView(
      Button(this).apply {
        setText(R.string.guard_shield_home)
        setOnClickListener { goHome() }
      }
    )
    root.addView(
      Button(this).apply {
        setText(R.string.guard_shield_unlock)
        setOnClickListener { openUnlock() }
      }
    )
    setContentView(root)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT
      ) {
        goHome()
      }
    }
  }

  @Deprecated("Back goes home, never back into the blocked app.")
  override fun onBackPressed() = goHome()

  private fun openFutureFlow() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    finish()
  }

  /** The reason and the 10-minute wait live in the app (spec §7 "Emergency unlock"). */
  private fun openUnlock() {
    startActivity(
      Intent(Intent.ACTION_VIEW, Uri.parse("futureflow://unlock"))
        .setPackage(packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    finish()
  }

  private fun goHome() {
    startActivity(
      Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_HOME)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    finish()
  }
}
