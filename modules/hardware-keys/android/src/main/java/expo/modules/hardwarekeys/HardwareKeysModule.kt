package expo.modules.hardwarekeys

import android.content.Context
import android.view.KeyEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** The player's invisible key catcher: reports the space bar of a hardware keyboard. */
class HardwareKeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HardwareKeys")

    View(SpaceKeyView::class) {
      Events("onSpace")

      Prop("active") { view: SpaceKeyView, active: Boolean? ->
        view.active = active ?: true
      }
    }
  }
}

/**
 * Focusable (also in touch mode, so a tap elsewhere doesn't drop the keyboard) and takes focus
 * when attached or re-activated. Consumes an unmodified space press; other keys pass through.
 */
class SpaceKeyView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onSpace by EventDispatcher<Unit>()

  var active = true
    set(value) {
      val turnedOn = value && !field
      field = value
      isFocusable = value
      isFocusableInTouchMode = value
      if (turnedOn) claimKeyboard()
    }

  init {
    isFocusable = true
    isFocusableInTouchMode = true
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    claimKeyboard()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) claimKeyboard()
  }

  private fun claimKeyboard() {
    // After layout: a zero-size or not-yet-laid-out view can't take focus.
    post { if (active && !hasFocus()) requestFocus() }
  }

  private fun isSpace(event: KeyEvent) =
    event.keyCode == KeyEvent.KEYCODE_SPACE && !event.isCtrlPressed && !event.isAltPressed && !event.isShiftPressed && !event.isMetaPressed

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (!active || !isSpace(event)) return super.dispatchKeyEvent(event)
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) onSpace(Unit)
    return true
  }
}
