package com.falah.allahisgreat1;

import android.app.Activity;
import android.content.Context;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
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
        try {
            if (content == null || content.isEmpty()) {
                call.reject("محتوى النسخة الاحتياطية فارغ");
                return;
            }
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) {
                    call.reject("تعذر فتح الملف الذي اخترته للكتابة");
                    return;
                }
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
            }
            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            response.put("fileName", fileName);
            call.resolve(response);
        } catch (Exception e) {
            String detail = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            call.reject("تعذر حفظ النسخة الاحتياطية في الموقع المحدد: " + detail, e);
        }
    }
    private void removePrintWebView(WebView view, ViewGroup parent) {
        try {
            if (parent != null) {
                parent.removeView(view);
            }
            view.stopLoading();
            view.destroy();
        } catch (Exception ignored) {
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
                printWebView.setClickable(false);
                printWebView.setFocusable(false);

                // Android's print adapter needs a laid-out WebView. Attach it behind
                // the app content instead of printing from a detached WebView (which
                // can result in blank output or a print dialog that never completes).
                View contentRoot = getActivity().findViewById(android.R.id.content);
                ViewGroup printParent = contentRoot instanceof ViewGroup
                    ? (ViewGroup) contentRoot
                    : null;
                if (printParent != null) {
                    // Keep the print WebView fully rendered; it is inserted at index 0 behind the app's visible WebView.
                    printWebView.setAlpha(1f);
                    printParent.addView(printWebView, 0, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    ));
                }

                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        view.postDelayed(() -> {
                            try {
                                PrintManager printManager =
                                    (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                                if (printManager == null) {
                                    call.reject("خدمة الطباعة غير متاحة على هذا الجهاز");
                                    removePrintWebView(view, printParent);
                                    return;
                                }

                                PrintAttributes attributes = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .setResolution(new PrintAttributes.Resolution("pdf", "PDF", 300, 300))
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                    .build();

                                PrintDocumentAdapter delegate = view.createPrintDocumentAdapter(title);
                                PrintDocumentAdapter retainedAdapter = new PrintDocumentAdapter() {
                                    @Override
                                    public void onLayout(
                                        PrintAttributes oldAttributes,
                                        PrintAttributes newAttributes,
                                        CancellationSignal cancellationSignal,
                                        LayoutResultCallback callback,
                                        Bundle extras
                                    ) {
                                        delegate.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
                                    }

                                    @Override
                                    public void onWrite(
                                        PageRange[] pages,
                                        ParcelFileDescriptor destination,
                                        CancellationSignal cancellationSignal,
                                        WriteResultCallback callback
                                    ) {
                                        delegate.onWrite(pages, destination, cancellationSignal, callback);
                                    }

                                    @Override
                                    public void onFinish() {
                                        try {
                                            delegate.onFinish();
                                        } finally {
                                            removePrintWebView(view, printParent);
                                        }
                                    }
                                };

                                printManager.print(title, retainedAdapter, attributes);
                                JSObject result = new JSObject();
                                result.put("opened", true);
                                call.resolve(result);
                            } catch (Exception e) {
                                call.reject("تعذر فتح نافذة إنشاء PDF: " + e.getMessage(), e);
                                removePrintWebView(view, printParent);
                            }
                        }, 350);
                    }
                });
                // The caller embeds stylesheet rules into this HTML. Keep a
                // stable HTTPS base for absolute/relative remote document assets.
                printWebView.loadDataWithBaseURL(
                    "https://localhost/",
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

    /**
     * Creates a selectable/searchable PDF from WebView's print adapter and saves it
     * directly in the public Downloads collection (Android 10+), without rasterizing
     * the HTML into a screenshot and without opening the print dialog.
     */
    @PluginMethod
    public void downloadHtmlPdf(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "Alhamdulillah");
        if (html == null || html.trim().isEmpty()) {
            call.reject("لا يوجد محتوى لإنشاء ملف PDF");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("التنزيل المباشر إلى مجلد التنزيلات يتطلب Android 10 أو أحدث");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView view = null;
            try {
                view = new WebView(getContext());
                view.getSettings().setJavaScriptEnabled(false);
                view.getSettings().setDefaultTextEncodingName("UTF-8");
                view.setBackgroundColor(android.graphics.Color.WHITE);
                final WebView pdfView = view;
                pdfView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView finishedView, String url) {
                        finishedView.postDelayed(() -> {
                            Uri uri = null;
                            ParcelFileDescriptor descriptor = null;
                            try {
                                ContentValues values = new ContentValues();
                                String safeName = title == null ? "Alhamdulillah" : title.trim();
                                safeName = safeName.replaceAll("[\\\\/:*?\\"<>|]", "_");
                                if (safeName.isEmpty()) safeName = "Alhamdulillah";
                                if (!safeName.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) {
                                    safeName += ".pdf";
                                }
                                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                                values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                                values.put(MediaStore.Downloads.IS_PENDING, 1);
                                uri = getContext().getContentResolver().insert(
                                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                                if (uri == null) throw new Exception("تعذر إنشاء ملف داخل التنزيلات");
                                descriptor = getContext().getContentResolver().openFileDescriptor(uri, "w");
                                if (descriptor == null) throw new Exception("تعذر فتح ملف PDF للكتابة");

                                PrintDocumentAdapter adapter = pdfView.createPrintDocumentAdapter(safeName);
                                Uri outputUri = uri;
                                ParcelFileDescriptor outputDescriptor = descriptor;
                                PrintAttributes attributes = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .setResolution(new PrintAttributes.Resolution("pdf", "PDF", 300, 300))
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                    .build();

                                adapter.onLayout(null, attributes, new CancellationSignal(),
                                    new PrintDocumentAdapter.LayoutResultCallback() {
                                        @Override
                                        public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                                            adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES},
                                                outputDescriptor, new CancellationSignal(),
                                                new PrintDocumentAdapter.WriteResultCallback() {
                                                    @Override
                                                    public void onWriteFinished(PageRange[] pages) {
                                                        try {
                                                            outputDescriptor.close();
                                                            ContentValues complete = new ContentValues();
                                                            complete.put(MediaStore.Downloads.IS_PENDING, 0);
                                                            getContext().getContentResolver().update(outputUri, complete, null, null);
                                                            JSObject response = new JSObject();
                                                            response.put("uri", outputUri.toString());
                                                            response.put("fileName", safeName);
                                                            call.resolve(response);
                                                        } catch (Exception e) {
                                                            getContext().getContentResolver().delete(outputUri, null, null);
                                                            call.reject("تعذر إكمال حفظ ملف PDF: " + e.getMessage(), e);
                                                        } finally {
                                                            removePrintWebView(pdfView, null);
                                                        }
                                                    }
                                                    @Override
                                                    public void onWriteFailed(CharSequence error) {
                                                        try { outputDescriptor.close(); } catch (Exception ignored) {}
                                                        getContext().getContentResolver().delete(outputUri, null, null);
                                                        call.reject("فشل إنشاء ملف PDF: " + error);
                                                        removePrintWebView(pdfView, null);
                                                    }
                                                    @Override
                                                    public void onWriteCancelled() {
                                                        try { outputDescriptor.close(); } catch (Exception ignored) {}
                                                        getContext().getContentResolver().delete(outputUri, null, null);
                                                        call.reject("تم إلغاء إنشاء ملف PDF");
                                                        removePrintWebView(pdfView, null);
                                                    }
                                                });
                                        }
                                        @Override
                                        public void onLayoutFailed(CharSequence error) {
                                            try { outputDescriptor.close(); } catch (Exception ignored) {}
                                            getContext().getContentResolver().delete(outputUri, null, null);
                                            call.reject("تعذر تجهيز صفحات PDF: " + error);
                                            removePrintWebView(pdfView, null);
                                        }
                                    }, null);
                            } catch (Exception e) {
                                if (descriptor != null) try { descriptor.close(); } catch (Exception ignored) {}
                                if (uri != null) getContext().getContentResolver().delete(uri, null, null);
                                call.reject("تعذر تنزيل PDF: " + e.getMessage(), e);
                                removePrintWebView(pdfView, null);
                            }
                        }, 300);
                    }
                });
                view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                if (view != null) removePrintWebView(view, null);
                call.reject("تعذر تجهيز PDF للتنزيل: " + e.getMessage(), e);
            }
        });
    }

}
