package com.quran.qasas

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    @PluginMethod
    fun updateWidgetData(call: PluginCall) {
        val prefs = context.getSharedPreferences(QasasWidgetProvider.PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putString("today_title", call.getString("todayTitle", "برنامهٔ امروز"))
            .putString("today_detail", call.getString("todayDetail", ""))
            .putInt("chilleh_days", call.getInt("chillehDays") ?: 0)
            .putInt("due_count", call.getInt("dueCount") ?: 0)
            .apply()
        QasasWidgetProvider.refreshAll(context)
        call.resolve(JSObject().put("ok", true))
    }
}
