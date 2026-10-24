package ai.openclaw.app

import ai.openclaw.releasevalidation.ReleaseValidationUi
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Condition
import androidx.test.uiautomator.UiDevice
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Observation-only instrumentation; real native UI, owners, and WebSocket requests. */
@RunWith(AndroidJUnit4::class)
class CatalogRefreshProofTest {
  @Test
  fun observeRealCatalogRefresh() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val app = instrumentation.targetContext.applicationContext as NodeApp
    val ui = ReleaseValidationUi(instrumentation)
    ui.launch(MainActivity::class.java.name)
    if (ui.device.hasObject(By.text("Continue"))) {
      ui.clickText("Continue")
      ui.clickText("Scan QR or setup code")
      ui.clickText("Enter setup code")
      val code = File(app.filesDir, "release-setup-code").readText().trim()
      ui.requireObject(By.clazz("android.widget.EditText"), "Setup code field missing").text = code
      ui.clickText("Use setup code")
      ui.requireObject(By.text("Gateway paired"), "Gateway setup-code pairing did not complete", 60_000)
      ui.clickText("Continue")
      repeat(4) {
        val next = ui.device.wait(Condition<UiDevice, String?> {
          when {
            ui.device.hasObject(By.desc("Show Sidebar")) -> "done"
            ui.device.hasObject(By.text("Approve access and continue").enabled(true)) -> "Approve access and continue"
            ui.device.hasObject(By.text("Continue").enabled(true)) -> "Continue"
            else -> null
          }
        }, 60_000)
        checkNotNull(next) { "Onboarding did not reach continuation" }
        if (next != "done") ui.clickText(next)
      }
    }
    ui.requireObject(By.desc("Show Sidebar"), "Native shell unavailable")
    val observations = JSONArray()
    val directory = File(app.filesDir, "catalog-proof").apply { mkdirs() }
    File(directory, "ready").writeText("ready")
    val deadline = System.currentTimeMillis() + 180_000
    var last = ""
    while (!File(directory, "finish").exists() && System.currentTimeMillis() < deadline) {
      val facts = JSONObject()
      instrumentation.runOnMainSync {
        val activity = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
          .filterIsInstance<MainActivity>().firstOrNull()
        facts.put("activityResumed", activity != null)
        if (activity != null) {
          val viewModel = ViewModelProvider(activity)[MainViewModel::class.java]
          facts.put("catalogRows", viewModel.chatModelCatalog.value.size)
          facts.put("generalModelCatalogRows", viewModel.modelCatalog.value.size)
          facts.put("refreshWarning", viewModel.chatError.value ?: JSONObject.NULL)
          facts.put("providerModelCatalogRows", viewModel.providerModelCatalog.value.size)
          facts.put("providerModelCatalogErrorText", viewModel.providerModelCatalogErrorText.value ?: JSONObject.NULL)
          facts.put("providerModelCatalogRefreshing", viewModel.providerModelCatalogRefreshing.value)
          if (File(directory, "refresh").exists()) {
            File(directory, "refresh").delete()
            viewModel.refreshChatCommands()
          }
        }
      }
      val state = facts.toString()
      if (state != last) {
        observations.put(JSONObject(state).put("timestampMs", System.currentTimeMillis()))
        File(directory, "observations.json").writeText(observations.toString(2))
        last = state
      }
      Thread.sleep(100)
    }
    assertTrue("Host did not finish bounded observation", File(directory, "finish").exists())
    assertTrue(ui.device.takeScreenshot(File(directory, "native-ui.png")))
  }
}
