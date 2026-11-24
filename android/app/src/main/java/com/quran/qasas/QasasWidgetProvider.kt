package com.quran.qasas

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class QasasWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) updateWidget(context, manager, id)
    }

    companion object {
        const val PREFS = "qasas_widget"

        fun updateWidget(context: Context, manager: AppWidgetManager, id: Int) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.qasas_widget)
            views.setTextViewText(R.id.widgetTodayTitle, prefs.getString("today_title", "برنامهٔ امروز"))
            views.setTextViewText(R.id.widgetTodayDetail, prefs.getString("today_detail", "وارد برنامه شوید و تمرین امروز را ببینید"))
            views.setTextViewText(R.id.widgetChilleh, "چله: " + prefs.getInt("chilleh_days", 0) + " روز")
            views.setTextViewText(R.id.widgetDue, "مرور سررسید: " + prefs.getInt("due_count", 0))
            val intent = Intent(context, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widgetRoot, pending)
            manager.updateAppWidget(id, views)
        }

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, QasasWidgetProvider::class.java))
            for (id in ids) updateWidget(context, manager, id)
        }
    }
}
