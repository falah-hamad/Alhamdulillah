package com.falah.allahisgreat1;

import android.app.Activity;
import android.graphics.pdf.PdfDocument;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
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

        getActivity().runOnUiThread(() -> {
            final WebView pdfView = new WebView(getContext());
            pdfView.getSettings().setJavaScriptEnabled(false);
            pdfView.getSettings().setDefaultTextEncodingName("UTF-8");
            pdfView.setBackgroundColor(android.graphics.Color.WHITE);
            pdfView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    view.postDelayed(() -> {
                        try {
                            String safeTitle = title == null ? "Alhamdulillah" : title.trim();
                            safeTitle = safeTitle.replaceAll("[\\\\/:*?<>|\\\"]", "_");
                            if (safeTitle.isEmpty()) safeTitle = "Alhamdulillah";
                            if (safeTitle.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) {
                                safeTitle = safeTitle.substring(0, safeTitle.length() - 4);
                            }
                            final String fileName = safeTitle + ".pdf";

                            // Lay out the full HTML document, then render A4 pages directly to PDF.
                            final int pageWidthPx = 794;
                            final int pageHeightPx = 1123;
                            pdfView.measure(
                                View.MeasureSpec.makeMeasureSpec(pageWidthPx, View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                            );
                            int contentHeight = Math.max(pdfView.getContentHeight(),
                                pdfView.getMeasuredHeight());
                            contentHeight = Math.max(contentHeight, pageHeightPx);
                            pdfView.layout(0, 0, pageWidthPx, contentHeight);

                            PdfDocument document = new PdfDocument();
                            float scale = 595f / pageWidthPx;
                            int pageCount = (int) Math.ceil(contentHeight / (pageHeightPx * 1.0));
                            for (int pageNumber = 0; pageNumber < pageCount; pageNumber++) {
                                PdfDocument.PageInfo pageInfo = new PdfDocument.PageInfo.Builder(
                                    595, 842, pageNumber + 1
                                ).create();
                                PdfDocument.Page page = document.startPage(pageInfo);
                                android.graphics.Canvas canvas = page.getCanvas();
                                canvas.save();
                                canvas.scale(scale, scale);
                                canvas.translate(0, -pageNumber * pageHeightPx);
                                canvas.clipRect(0, pageNumber * pageHeightPx,
                                    pageWidthPx, (pageNumber + 1) * pageHeightPx);
                                pdfView.draw(canvas);
                                canvas.restore();
                                document.finishPage(page);
                            }

                            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                            document.writeTo(buffer);
                            document.close();
                            byte[] pdfBytes = buffer.toByteArray();

                            Uri savedUri;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                ContentValues values = new ContentValues();
                                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                                values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                                    Environment.DIRECTORY_DOWNLOADS);
                                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                                savedUri = getContext().getContentResolver().insert(
                                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                                if (savedUri == null) {
                                    throw new java.io.IOException("تعذر إنشاء الملف داخل مجلد التنزيلات");
                                }
                                try (OutputStream output = getContext().getContentResolver()
                                        .openOutputStream(savedUri, "w")) {
                                    if (output == null) throw new java.io.IOException("تعذر فتح ملف PDF للكتابة");
                                    output.write(pdfBytes);
                                    output.flush();
                                }
                                ContentValues completed = new ContentValues();
                                completed.put(MediaStore.MediaColumns.IS_PENDING, 0);
                                getContext().getContentResolver().update(savedUri, completed, null, null);
                            } else {
                                File downloads = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                                if (downloads == null) throw new java.io.IOException("مجلد التنزيلات غير متاح");
                                if (!downloads.exists() && !downloads.mkdirs()) {
                                    throw new java.io.IOException("تعذر إنشاء مجلد التنزيلات");
                                }
                                File outputFile = new File(downloads, fileName);
                                try (FileOutputStream output = new FileOutputStream(outputFile)) {
                                    output.write(pdfBytes);
                                    output.flush();
                                }
                                savedUri = Uri.fromFile(outputFile);
                            }

                            JSObject response = new JSObject();
                            response.put("uri", savedUri.toString());
                            response.put("fileName", fileName);
                            response.put("base64", android.util.Base64.encodeToString(
                                pdfBytes, android.util.Base64.NO_WRAP));
                            call.resolve(response);
                        } catch (Exception e) {
                            call.reject("تعذر تنزيل ملف PDF مباشرةً: " +
                                (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()), e);
                        } finally {
                            removePrintWebView(pdfView, null);
                        }
                    }, 350);
                }
            });
            pdfView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }

}
