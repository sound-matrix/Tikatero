package com.soundmatrix.tikatero;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Tikatero native Android foundation.
 * No WebView: all navigation and UI are Android views.
 * Server-backed features are intentionally gated until native API integrations are ready.
 */
public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(12, 16, 28);
    private static final int PANEL = Color.rgb(25, 32, 47);
    private static final int FOREGROUND = Color.WHITE;
    private static final int MUTED = Color.rgb(169, 180, 196);
    private static final int ACCENT = Color.rgb(83, 211, 180);

    private LinearLayout content;
    private LinearLayout nav;
    private String selected = "Home";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showScreen("Home");
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        return shape;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(size);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private void addText(String value, int size, int color, boolean bold) {
        TextView view = text(value, size, color, bold);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.bottomMargin = dp(14);
        content.addView(view, p);
    }

    private void addPanel(String title, String description) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(18), dp(18), dp(18), dp(18));
        panel.setBackground(background(PANEL, 18));
        TextView heading = text(title, 18, FOREGROUND, true);
        panel.addView(heading);
        TextView body = text(description, 14, MUTED, false);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(-1, -2);
        bodyParams.topMargin = dp(8);
        panel.addView(body, bodyParams);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(14);
        content.addView(panel, params);
    }

    private void addAction(String label, String target) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextColor(BACKGROUND);
        button.setBackground(background(ACCENT, 14));
        button.setOnClickListener(v -> showScreen(target));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52));
        params.bottomMargin = dp(18);
        content.addView(button, params);
    }

    private void showScreen(String screen) {
        selected = screen;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        root.setFitsSystemWindows(true);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(32), dp(22), dp(20));
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(dp(6), dp(10), dp(6), dp(10));
        nav.setBackgroundColor(PANEL);
        root.addView(nav, new LinearLayout.LayoutParams(-1, dp(68)));
        setContentView(root);

        addText("TIKATERO", 14, ACCENT, true);
        switch (screen) {
            case "Home":
                addText("Discover what's happening", 28, FOREGROUND, true);
                addText("Find experiences and events worth attending.", 16, MUTED, false);
                addAction("Explore events", "Discover");
                addPanel("Native Android experience", "Fast native navigation, accessible screens and an Android-first layout. Live event listings will appear after the public event API is connected.");
                addPanel("For organisers", "Event creation, sales, payouts and scanning require secure native integrations before they can be enabled.");
                break;
            case "Discover":
                addText("Discover events", 28, FOREGROUND, true);
                addPanel("Event catalogue", "Live events are not connected in this foundation build. We will connect the Tikatero events API and add category, city and date filters.");
                break;
            case "Tickets":
                addText("Your tickets", 28, FOREGROUND, true);
                addPanel("Sign-in required", "Your bookings and QR tickets will appear here after secure native authentication and tickets API integration.");
                break;
            case "Account":
                addText("Your account", 28, FOREGROUND, true);
                addPanel("Account & organiser access", "Native login, profile, organiser tools and role-based access are planned for the next integration stage. No account information is stored in this foundation build.");
                break;
            default:
                showScreen("Home");
                return;
        }

        for (String destination : new String[]{"Home", "Discover", "Tickets", "Account"}) {
            TextView item = text(destination, 12, destination.equals(selected) ? ACCENT : MUTED, destination.equals(selected));
            item.setGravity(Gravity.CENTER);
            item.setOnClickListener(v -> showScreen(destination));
            nav.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
        }
    }

    @Override public void onBackPressed() {
        if (!"Home".equals(selected)) showScreen("Home");
        else super.onBackPressed();
    }
}
