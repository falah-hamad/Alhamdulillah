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
import android.widget.Toast;
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
    /**
     * Saves a PDF already rendered by the shared server-side Chromium engine.
     * This avoids Android's Canvas-based re-rendering, which can alter layout.
     */
    @PluginMethod
    public void savePdfBase64(PluginCall call) {
        String encoded = call.getString("base64");
        String requestedName = call.getString("fileName", "Alhamdulillah.pdf");
        if (encoded == null || encoded.trim().isEmpty()) {
            call.reject("بيانات ملف PDF فارغة");
            return;
        }

        try {
            byte[] pdfBytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            if (pdfBytes.length < 5 || pdfBytes[0] != '%' || pdfBytes[1] != 'P' ||
                    pdfBytes[2] != 'D' || pdfBytes[3] != 'F' || pdfBytes[4] != '-') {
                call.reject("البيانات المستلمة لا تحتوي على ملف PDF صالح");
                return;
            }

            String fileName = requestedName == null ? "Alhamdulillah.pdf" : requestedName.trim();
            fileName = fileName.replaceAll("[\\\\/:*?<>|\\\"]", "_");
            if (fileName.isEmpty()) fileName = "Alhamdulillah.pdf";
            if (!fileName.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) fileName += ".pdf";

            Uri savedUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                savedUri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (savedUri == null) throw new java.io.IOException("تعذر إنشاء الملف داخل مجلد التنزيلات");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(savedUri, "w")) {
                    if (output == null) throw new java.io.IOException("تعذر فتح ملف PDF للكتابة");
                    output.write(pdfBytes);
                    output.flush();
                } catch (Exception writeError) {
                    getContext().getContentResolver().delete(savedUri, null, null);
                    throw writeError;
                }
                ContentValues completed = new ContentValues();
                completed.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(savedUri, completed, null, null);
            } else {
                File downloads = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (downloads == null) throw new java.io.IOException("مجلد التنزيلات غير متاح");
                if (!downloads.exists() && !downloads.mkdirs()) throw new java.io.IOException("تعذر إنشاء مجلد التنزيلات");
                File outputFile = new File(downloads, fileName);
                try (OutputStream output = new FileOutputStream(outputFile)) {
                    output.write(pdfBytes);
                    output.flush();
                }
                savedUri = Uri.fromFile(outputFile);
            }

            JSObject response = new JSObject();
            response.put("uri", savedUri.toString());
            response.put("fileName", fileName);
            Toast.makeText(getContext(), "تم حفظ ملف PDF في التنزيلات", Toast.LENGTH_SHORT).show();
            call.resolve(response);
        } catch (Exception e) {
            call.reject("تعذر حفظ ملف PDF في التنزيلات: " +
                    (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()), e);
        }
    }

    /**
     * Opens a cached PDF with Android's system resolver so the user can choose
     * any compatible PDF reader installed on their device.
     */
    @PluginMethod
    public void openPdfWithChooser(PluginCall call) {
        String encoded = call.getString("base64");
        String requestedName = call.getString("fileName", "Alhamdulillah.pdf");
        if (encoded == null || encoded.trim().isEmpty()) {
            call.reject("بيانات ملف PDF فارغة");
            return;
        }
        try {
            byte[] bytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' ||
                    bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-') {
                call.reject("الملف ليس PDF صالحًا");
                return;
            }
            String fileName = requestedName == null ? "Alhamdulillah.pdf" : requestedName.trim();
            fileName = fileName.replaceAll("[\\\\/:*?<>|\\\"]", "_");
            if (fileName.isEmpty()) fileName = "Alhamdulillah.pdf";
            if (!fileName.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) fileName += ".pdf";

            File openDir = new File(getContext().getCacheDir(), "pdf-open");
            if (!openDir.exists() && !openDir.mkdirs()) {
                throw new java.io.IOException("تعذر تجهيز ملف PDF للفتح");
            }
            File openFile = new File(openDir, fileName);
            try (OutputStream output = new FileOutputStream(openFile)) {
                output.write(bytes);
                output.flush();
            }
            Uri contentUri = androidx.core.content.FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", openFile
            );
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(contentUri, "application/pdf");
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(viewIntent, "فتح ملف PDF باستخدام");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            JSObject response = new JSObject();
            response.put("openedChooser", true);
            call.resolve(response);
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("ماكو تطبيق مثبت يفتح ملفات PDF على هذا الجهاز", e);
        } catch (Exception e) {
            call.reject("تعذر فتح قائمة تطبيقات PDF: " +
                (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()), e);
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

    private void createPdfFromWebView(WebView webView, File outputFile) throws java.io.IOException {
        final int contentWidth = 794;
        final int pageWidth = 595;
        final int pageHeight = 842;
        webView.measure(
            View.MeasureSpec.makeMeasureSpec(contentWidth, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        );
        int contentHeight = Math.max(webView.getContentHeight(), webView.getMeasuredHeight());
        if (contentHeight <= 0) throw new java.io.IOException("المستند فارغ أو لم يكتمل تحميله");
        webView.layout(0, 0, contentWidth, contentHeight);
        float scale = (float) pageWidth / contentWidth;
        int pageContentHeight = Math.max(1, (int) (pageHeight / scale));
        PdfDocument document = new PdfDocument();
        try (FileOutputStream output = new FileOutputStream(outputFile)) {
            int pageNumber = 1;
            for (int top = 0; top < contentHeight; top += pageContentHeight) {
                PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber++).create();
                PdfDocument.Page page = document.startPage(info);
                android.graphics.Canvas canvas = page.getCanvas();
                canvas.save();
                canvas.clipRect(0, 0, pageWidth, pageHeight);
                canvas.scale(scale, scale);
                canvas.translate(0, -top);
                webView.draw(canvas);
                canvas.restore();
                document.finishPage(page);
            }
            document.writeTo(output);
            output.flush();
        } finally {
            document.close();
        }
    }

    /**
     * Creates a text/vector PDF through WebView's native print adapter and saves
     * it to Android Downloads without opening the print UI. The generated bytes
     * are also returned so the app can keep the same PDF in its in-app library.
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
                        java.io.File tempPdf = null;
                        PrintDocumentAdapter adapter = null;
                        try {
                            String safeTitle = title == null ? "Alhamdulillah" : title.trim();
                            safeTitle = safeTitle.replaceAll("[\\\\/:*?<>|\\\"]", "_");
                            if (safeTitle.isEmpty()) safeTitle = "Alhamdulillah";
                            if (safeTitle.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) {
                                safeTitle = safeTitle.substring(0, safeTitle.length() - 4);
                            }
                            final String fileName = safeTitle + ".pdf";

                            View contentRoot = getActivity().findViewById(android.R.id.content);
                            ViewGroup parent = contentRoot instanceof ViewGroup ? (ViewGroup) contentRoot : null;
                            if (parent != null) {
                                pdfView.setAlpha(1f);
                                parent.addView(pdfView, 0, new ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT
                                ));
                            }

                            PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setResolution(new PrintAttributes.Resolution("pdf", "PDF", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();

                            tempPdf = File.createTempFile("alhamdulillah-export-", ".pdf", getContext().getCacheDir());
                            // Render directly to PdfDocument. Android's PrintDocumentAdapter callback
                            // constructors are package-private and cannot be instantiated by this plugin.
                            createPdfFromWebView(pdfView, tempPdf);
                            byte[] pdfBytes;
                            try (java.io.FileInputStream input = new java.io.FileInputStream(tempPdf);
                                 ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                                byte[] chunk = new byte[8192];
                                int count;
                                while ((count = input.read(chunk)) != -1) buffer.write(chunk, 0, count);
                                pdfBytes = buffer.toByteArray();
                            }
                            if (pdfBytes.length < 5 || pdfBytes[0] != '%' || pdfBytes[1] != 'P' ||
                                pdfBytes[2] != 'D' || pdfBytes[3] != 'F' || pdfBytes[4] != '-') {
                                throw new java.io.IOException("ملف PDF الناتج غير صالح");
                            }
                            Uri savedUri;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                ContentValues values = new ContentValues();
                                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                                savedUri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                                if (savedUri == null) throw new java.io.IOException("تعذر إنشاء الملف داخل مجلد التنزيلات");
                                try (OutputStream output = getContext().getContentResolver().openOutputStream(savedUri, "w")) {
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
                                if (!downloads.exists() && !downloads.mkdirs()) throw new java.io.IOException("تعذر إنشاء مجلد التنزيلات");
                                File outputFile = new File(downloads, fileName);
                                try (OutputStream output = new FileOutputStream(outputFile)) {
                                    output.write(pdfBytes);
                                    output.flush();
                                }
                                savedUri = Uri.fromFile(outputFile);
                            }
                            JSObject response = new JSObject();
                            response.put("uri", savedUri.toString());
                            response.put("fileName", fileName);
                            response.put("base64", android.util.Base64.encodeToString(pdfBytes, android.util.Base64.NO_WRAP));
                            Toast.makeText(getContext(), "تم حفظ الملف بنجاح", Toast.LENGTH_SHORT).show();
                            call.resolve(response);
                            removePrintWebView(pdfView, parent);
                            tempPdf.delete();
                        } catch (Exception e) {
                            if (adapter != null) {
                                try { adapter.onFinish(); } catch (Exception ignored) {}
                            }
                            removePrintWebView(pdfView, null);
                            if (tempPdf != null) tempPdf.delete();
                            call.reject("تعذر إنشاء ملف PDF مباشرةً: " +
                                (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()), e);
                        }
                    }, 350);
                }
            });
            pdfView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }
}
