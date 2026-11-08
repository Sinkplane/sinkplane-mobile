package expo.modules.foldposture

import android.app.Activity
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

private const val POSTURE_EVENT = "onPostureChange"

/**
 * Reports the window's folding feature (hinge) through Jetpack WindowManager: its state
 * (flat / half-opened), orientation and bounds in window dp, matching React Native's layout units.
 * Only while JS listens, and re-attached when the activity comes back to the foreground.
 */
class FoldPostureModule : Module() {
  // Only touched on the UI thread (see start/stop).
  private var tracker: WindowInfoTrackerCallbackAdapter? = null
  private var trackedActivity = WeakReference<Activity>(null)

  // Written on Expo's module queue, read by the UI-thread blocks it schedules.
  @Volatile private var observing = false
  private var latest: Map<String, Any?>? = null

  private val consumer = Consumer<WindowLayoutInfo> { info ->
    val activity = trackedActivity.get() ?: return@Consumer
    latest = toPosture(info, activity.resources.displayMetrics.density)
    sendEvent(POSTURE_EVENT, mapOf("posture" to latest))
  }

  override fun definition() = ModuleDefinition {
    Name("FoldPosture")

    Events(POSTURE_EVENT)

    Function("getPosture") { latest }

    OnStartObserving(POSTURE_EVENT) {
      observing = true
      start()
    }

    OnStopObserving(POSTURE_EVENT) {
      observing = false
      stop()
    }

    // The tracker is bound to an activity; follow activity re-creation (e.g. unfolding resizes it).
    OnActivityEntersForeground {
      if (observing) start()
    }

    OnActivityDestroys {
      stop()
    }

    OnDestroy {
      stop()
    }
  }

  /**
   * Registration and removal both run on the UI thread, in the order they were requested, and a
   * queued registration re-checks `observing`: an unsubscribe that lands before the block runs
   * (stop() while `tracker` is still null) must not leave a listener behind.
   */
  private fun start() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      if (!observing) return@runOnUiThread
      if (tracker != null && trackedActivity.get() === activity) return@runOnUiThread
      removeListener()
      val adapter = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
      trackedActivity = WeakReference(activity)
      tracker = adapter
      adapter.addWindowLayoutInfoListener(activity, ContextCompat.getMainExecutor(activity), consumer)
    }
  }

  private fun stop() {
    val activity = trackedActivity.get() ?: appContext.currentActivity
    if (activity != null) activity.runOnUiThread { removeListener() } else removeListener()
  }

  private fun removeListener() {
    tracker?.removeWindowLayoutInfoListener(consumer)
    tracker = null
    trackedActivity = WeakReference(null)
  }

  private fun toPosture(info: WindowLayoutInfo, density: Float): Map<String, Any?>? {
    val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull() ?: return null
    val bounds = fold.bounds
    return mapOf(
      "state" to if (fold.state == FoldingFeature.State.HALF_OPENED) "halfOpened" else "flat",
      "orientation" to if (fold.orientation == FoldingFeature.Orientation.HORIZONTAL) "horizontal" else "vertical",
      "isSeparating" to fold.isSeparating,
      "bounds" to mapOf(
        "x" to bounds.left / density,
        "y" to bounds.top / density,
        "width" to bounds.width() / density,
        "height" to bounds.height() / density
      )
    )
  }
}
