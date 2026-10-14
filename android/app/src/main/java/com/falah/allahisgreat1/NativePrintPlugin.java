package com.falah.allahisgreat1;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {
    @PluginMethod
    public void saveTextFile(PluginCall call) {
        String fileName = call.getString("fileName", "backup.json");
        String content = call.getString("content");
        if (content == null) {
            call.reject("محتوى الملف فارغ");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(fileName.toLowerCase().endsWith(".json")
            ? "application/json"
            : "text/plain");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleSaveTextFileResult");
    }

    @ActivityCallback
    private void handleSaveTextFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("تم إلغاء حفظ الملف أو لم يتم اختيار موقع للحفظ");
            return;
        }

        Uri uri = result.getData().getData();
        String content = call.getString("content");
        String fileName = call.getString("fileName", "backup.json");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) {
                call.reject("تعذر فتح الملف للكتابة");
                return;
            }
            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();
            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            response.put("fileName", fileName);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("تعذر حفظ الملف: " + e.getMessage(), e);
        }
    }
    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "Alhamdulillah");

        if (html == null || html.trim().isEmpty()) {
            call.reject("لا يوجد محتوى للطباعة");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                WebView printWebView = new WebView(getContext());
                printWebView.getSettings().setJavaScriptEnabled(false);
                printWebView.getSettings().setDefaultTextEncodingName("UTF-8");
                printWebView.getSettings().setSupportZoom(false);
                printWebView.setBackgroundColor(android.graphics.Color.WHITE);
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        view.postDelayed(() -> {
                            try {
                                PrintManager printManager =
                                    (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                                if (printManager == null) {
                                    call.reject("خدمة الطباعة غير متاحة على هذا الجهاز");
                                    view.destroy();
                                    return;
                                }

                                PrintAttributes attributes = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .setResolution(new PrintAttributes.Resolution("pdf", "PDF", 300, 300))
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                    .build();

                                printManager.print(
                                    title,
                                    view.createPrintDocumentAdapter(title),
                                    attributes
                                );
                                JSObject result = new JSObject();
                                result.put("opened", true);
                                call.resolve(result);
                            } catch (Exception e) {
                                call.reject("تعذر فتح نافذة إنشاء PDF: " + e.getMessage(), e);
                                view.destroy();
                            }
                        }, 350);
                    }
                });
                // The caller embeds same-origin stylesheet rules into this HTML.
                // Use a neutral base URL so the standalone WebView never depends
                // on the main Capacitor WebView's private asset interception.
                printWebView.loadDataWithBaseURL(
                    "about:blank",
                    html,
                    "text/html",
                    "UTF-8",
                    null
                );
            } catch (Exception e) {
                call.reject("تعذر تجهيز المستند للطباعة: " + e.getMessage(), e);
            }
        });
    }
}
