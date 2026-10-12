import React, { useMemo, useState } from "react";
import {
  Package, Search, PlusCircle, TrendingUp, Edit, Trash2, X,
  PackagePlus, Layers, Star, ImagePlus, History, RotateCcw, AlertTriangle,
  Eye, Save, Camera, ClipboardList,
  Phone, Truck, Clock, ScanBarcode
} from "lucide-react";
import { Invoice, Product, ProductPriceHistoryEntry, ProductStockMovement, ProductStockMovementType, SystemSettings } from "../types";
import { uploadUserFile } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

interface ProductsViewProps {
  products: Product[];
  invoices?: Invoice[];
  settings: SystemSettings;
  addProduct: (product: Omit<Product, "id">) => Product;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
}

type ProductForm = {
  name: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  category: string;
  barcode: string;
  imageUrl: string;
  description: string;
  notes: string;
  supplierName: string;
  supplierPhone: string;
  minStock: number;
  unitName: string;
};

const emptyForm: ProductForm = {
  name: "", purchasePrice: 0, salePrice: 0, quantity: 0, category: "",
  barcode: "", imageUrl: "", description: "", notes: "", supplierName: "",
  supplierPhone: "", minStock: 5, unitName: "قطعة",
};

const nowIso = () => new Date().toISOString();
const movementId = () => `move-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const priceId = () => `price-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const money = (value: number) => (Number(value) || 0).toLocaleString("en-US");

const movementLabels: Record<ProductStockMovementType, string> = {
  opening: "رصيد افتتاحي",
  restock: "توريد / شراء",
  sale: "بيع من فاتورة",
  return: "مرتجع إلى المخزن",
  damaged: "تالف / مفقود",
  adjustment: "تسوية مخزون",
};

export default function ProductsView({
  products, invoices = [], settings, addProduct, updateProduct, deleteProduct,
}: ProductsViewProps) {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "favorites" | "recent" | "low">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [formError, setFormError] = useState("");
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [movementType, setMovementType] = useState<"restock" | "return" | "damaged" | "adjustment">("restock");
  const [movementQty, setMovementQty] = useState(1);
  const [movementNote, setMovementNote] = useState("");

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))], [products]);
  const totalItemsCount = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  const totalCostValue = products.reduce((sum, p) => sum + (Number(p.purchasePrice) || 0) * (Number(p.quantity) || 0), 0);
  const totalRetailValue = products.reduce((sum, p) => sum + (Number(p.salePrice) || 0) * (Number(p.quantity) || 0), 0);
  const potentialProfit = totalRetailValue - totalCostValue;
  const linkedSalesProfitEstimate = invoices.reduce((sum, invoice) => sum + (invoice.items || []).reduce((itemSum, item) => {
    if (!item.productId || item.isSeparator || item.isPaymentRow || item.isRemainingRow) return itemSum;
    const product = products.find(p => p.id === item.productId);
    return itemSum + ((Number(item.unitPrice) || 0) - (Number(product?.purchasePrice) || 0)) * (Number(item.quantity) || 0);
  }, 0), 0);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    return products.filter(p => {
      const searchable = [p.name, p.category, p.barcode, p.description, p.notes, p.supplierName, p.supplierPhone]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      const matchesQuery = !q || searchable.includes(q);
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
      const matchesQuick = quickFilter === "all"
        || (quickFilter === "favorites" && Boolean(p.isFavorite))
        || (quickFilter === "recent" && Boolean(p.lastViewedAt))
        || (quickFilter === "low" && (Number(p.quantity) || 0) <= (Number(p.minStock ?? 5) || 0));
      return matchesQuery && matchesCategory && matchesQuick;
    }).sort((a, b) => {
      if (quickFilter === "recent") return (b.lastViewedAt || "").localeCompare(a.lastViewedAt || "");
      if (quickFilter === "favorites") return Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) || a.name.localeCompare(b.name, "ar");
      return a.name.localeCompare(b.name, "ar");
    });
  }, [products, searchQuery, selectedCategory, quickFilter]);

  const setField = <K extends keyof ProductForm,>(key: K, value: ProductForm[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      ...emptyForm,
      name: product.name || "",
      purchasePrice: Number(product.purchasePrice) || 0,
      salePrice: Number(product.salePrice) || 0,
      quantity: Number(product.quantity) || 0,
      category: product.category || "",
      barcode: product.barcode || "",
      imageUrl: product.imageUrl || "",
      description: product.description || "",
      notes: product.notes || "",
      supplierName: product.supplierName || "",
      supplierPhone: product.supplierPhone || "",
      minStock: Number(product.minStock ?? 5),
      unitName: product.unitName || "قطعة",
    });
    setFormError("");
    setIsFormOpen(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("اختر ملف صورة صالحاً.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFormError("حجم الصورة أكبر من 8 ميغابايت. اختر صورة أصغر.");
      return;
    }
    if (!currentUser?.uid) {
      setFormError("حتى تُحفظ الصورة وتظهر على أجهزتك الأخرى، سجّل الدخول أولاً. ويمكنك وضع رابط صورة في الحقل أدناه.");
      return;
    }
    setIsSavingImage(true);
    setFormError("");
    try {
      const url = await uploadUserFile(currentUser.uid, "products", file.name, file);
      setField("imageUrl", url);
    } catch (error) {
      console.error("Product image upload failed:", error);
      setFormError("تعذر رفع الصورة. تحقق من اتصال الإنترنت وصلاحيات التخزين ثم أعد المحاولة.");
    } finally {
      setIsSavingImage(false);
      event.target.value = "";
    }
  };

  const saveProduct = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.category.trim()) {
      setFormError("اسم البضاعة والتصنيف مطلوبان.");
      return;
    }
    if (form.purchasePrice < 0 || form.salePrice < 0 || form.quantity < 0 || form.minStock < 0) {
      setFormError("الأسعار والكميات لا يمكن أن تكون سالبة.");
      return;
    }
    const common = {
      name: form.name.trim(),
      purchasePrice: Number(form.purchasePrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      quantity: Number(form.quantity) || 0,
      category: form.category.trim(),
      barcode: form.barcode.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      description: form.description.trim() || undefined,
      notes: form.notes.trim() || undefined,
      supplierName: form.supplierName.trim() || undefined,
      supplierPhone: form.supplierPhone.trim() || undefined,
      minStock: Number(form.minStock) || 0,
      unitName: form.unitName.trim() || "قطعة",
    };

    if (editingProduct) {
      const priceChanged = editingProduct.purchasePrice !== common.purchasePrice || editingProduct.salePrice !== common.salePrice;
      const quantityDelta = common.quantity - (Number(editingProduct.quantity) || 0);
      const priceHistory: ProductPriceHistoryEntry[] = [...(editingProduct.priceHistory || [])];
      if (priceChanged) {
        priceHistory.unshift({
          id: priceId(), changedAt: nowIso(),
          previousPurchasePrice: editingProduct.purchasePrice,
          previousSalePrice: editingProduct.salePrice,
          purchasePrice: common.purchasePrice,
          salePrice: common.salePrice,
          supplierName: common.supplierName,
          note: "تعديل سعر من بطاقة البضاعة",
        });
      }
      const stockMovements: ProductStockMovement[] = [...(editingProduct.stockMovements || [])];
      if (quantityDelta !== 0) {
        stockMovements.unshift({
          id: movementId(), type: "adjustment", quantity: quantityDelta,
          createdAt: nowIso(), note: "تسوية كمية من نموذج تعديل البضاعة",
        });
      }
      updateProduct({ ...editingProduct, ...common, priceHistory, stockMovements });
    } else {
      const createdAt = nowIso();
      addProduct({
        ...common,
        isFavorite: false,
        priceHistory: [{
          id: priceId(), changedAt: createdAt,
          purchasePrice: common.purchasePrice, salePrice: common.salePrice,
          supplierName: common.supplierName, note: "السعر عند تسجيل البضاعة",
        }],
        stockMovements: common.quantity > 0 ? [{
          id: movementId(), type: "opening", quantity: common.quantity,
          createdAt, note: "الرصيد الافتتاحي عند إضافة البضاعة",
          unitCost: common.purchasePrice,
        }] : [],
      });
    }
    setIsFormOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
  };

  const toggleFavorite = (product: Product) => updateProduct({ ...product, isFavorite: !product.isFavorite });
  const openDetails = (product: Product) => {
    const viewed = { ...product, lastViewedAt: nowIso() };
    updateProduct(viewed);
    setDetailsProduct(viewed);
  };

  const openMovement = (product: Product, type: "restock" | "return" | "damaged" | "adjustment") => {
    setMovementProduct(product);
    setMovementType(type);
    setMovementQty(1);
    setMovementNote("");
  };

  const saveMovement = (event: React.FormEvent) => {
    event.preventDefault();
    if (!movementProduct || !Number.isFinite(movementQty) || movementQty === 0) return;
    if (movementType !== "adjustment" && movementQty < 1) {
      alert("أدخل كمية أكبر من صفر.");
      return;
    }
    const delta = movementType === "restock" || movementType === "return"
      ? Math.abs(movementQty)
      : movementType === "damaged" ? -Math.abs(movementQty) : movementQty;
    const nextQuantity = (Number(movementProduct.quantity) || 0) + delta;
    if (nextQuantity < 0) {
      alert("لا يمكن أن تصبح كمية المخزون أقل من صفر.");
      return;
    }
    const movement: ProductStockMovement = {
      id: movementId(), type: movementType, quantity: delta, createdAt: nowIso(),
      note: movementNote.trim() || undefined,
      unitCost: movementProduct.purchasePrice,
    };
    updateProduct({
      ...movementProduct,
      quantity: nextQuantity,
      stockMovements: [movement, ...(movementProduct.stockMovements || [])].slice(0, 250),
    });
    setMovementProduct(null);
  };

  const handleDelete = (product: Product) => {
    if (confirm(`هل تريد حذف "${product.name}" من قائمة البضاعة؟ لن تُحذف الفواتير السابقة المرتبطة بها.`)) {
      deleteProduct(product.id);
      if (detailsProduct?.id === product.id) setDetailsProduct(null);
    }
  };

  const salesForProduct = (product: Product) => invoices.flatMap(invoice =>
    (product.stockMovements || []).some(m => m.referenceId === invoice.id && m.type === "sale")
      ? []
      : (invoice.items || []).filter(item => item.productId === product.id && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow)
      .map(item => ({
        id: `sale-${invoice.id}-${item.id}`, type: "sale" as const,
        quantity: -(Number(item.quantity) || 0), createdAt: invoice.date || invoice.createdAt,
        note: `فاتورة ${invoice.invoiceNumber || ""}`.trim(),
        customerName: invoice.customerName,
        referenceId: invoice.id,
      }))
  );

  const historyForProduct = (product: Product) => [
    ...(product.stockMovements || []).map(m => ({ ...m, label: movementLabels[m.type] || "حركة مخزون" })),
    ...salesForProduct(product).map(m => ({ ...m, label: movementLabels.sale })),
  ].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 30);

  return (
    <div className="space-y-5 min-w-0" dir="rtl">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { label: "الكمية الموجودة", value: totalItemsCount, icon: Package },
          { label: "رأس المال بالمخزون", value: totalCostValue, icon: Layers },
          { label: "قيمة البيع المتوقعة", value: totalRetailValue, icon: TrendingUp },
          { label: "الربح المتوقع للمخزون", value: potentialProfit, icon: TrendingUp },
          { label: "ربح تقديري من الفواتير", value: linkedSalesProfitEstimate, icon: ClipboardList },
        ].map(metric => (
          <div key={metric.label} className="min-w-0 bg-white p-3 sm:p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0"><metric.icon className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">{metric.label}</div>
              <div className="text-sm sm:text-base font-bold text-slate-800 break-words">{money(metric.value)} <span className="text-[10px] font-normal text-slate-500">{settings.currency}</span></div>
            </div>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 sm:p-5 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" /> مستودع البضائع</h2>
            <p className="text-xs text-slate-500 mt-1">بطاقات بالصور والأسعار والمجهّزين وسجل حركة المخزون.</p>
          </div>
          <button onClick={openAdd} className="inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
            <PlusCircle className="w-4 h-4" /> إضافة بضاعة
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="relative lg:col-span-6">
            <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ابحث بالاسم أو الباركود أو المجهّز أو الملاحظات..." className="w-full min-w-0 pr-9 pl-3 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-blue-500" />
          </div>
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="lg:col-span-3 w-full min-w-0 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <option value="all">كل التصنيفات</option>
            {categories.filter(c => c !== "all").map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={quickFilter} onChange={e => setQuickFilter(e.target.value as typeof quickFilter)} className="lg:col-span-3 w-full min-w-0 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <option value="all">كل البضاعة</option>
            <option value="favorites">⭐ المفضلة</option>
            <option value="recent">شوهدت مؤخراً</option>
            <option value="low">مخزون منخفض</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-500 flex items-center gap-1"><ScanBarcode className="w-3.5 h-3.5" /> يمكن استخدام قارئ باركود يكتب الرمز في مربع البحث، أو البحث يدوياً بالرمز المسجل.</p>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">لا توجد بضاعة تطابق البحث الحالي.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {filteredProducts.map(product => {
              const low = (Number(product.quantity) || 0) <= (Number(product.minStock ?? 5) || 0);
              return (
                <article key={product.id} className="border border-slate-200 rounded-xl p-3 flex gap-3 min-w-0 hover:border-blue-200 transition-colors">
                  <button onClick={() => openDetails(product)} className="w-24 h-28 sm:w-28 sm:h-32 shrink-0 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center" title="عرض صورة وتفاصيل البضاعة">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" /> : <ImagePlus className="w-8 h-8 text-slate-300" />}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <button onClick={() => openDetails(product)} className="font-bold text-sm text-slate-800 text-right break-words flex-1">{product.name}</button>
                      <button onClick={() => toggleFavorite(product)} className={product.isFavorite ? "text-amber-500" : "text-slate-300 hover:text-amber-500"} title={product.isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}><Star className="w-4 h-4" fill={product.isFavorite ? "currentColor" : "none"} /></button>
                    </div>
                    <div className="text-[11px] text-slate-500">{product.category || "بدون تصنيف"}{product.barcode ? ` • ${product.barcode}` : ""}</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2"><span className="text-slate-500">الشراء</span><strong>{money(product.purchasePrice)} {settings.currency}</strong></div>
                      <div className="flex justify-between gap-2"><span className="text-slate-500">البيع</span><strong className="text-blue-700">{money(product.salePrice)} {settings.currency}</strong></div>
                      <div className="flex justify-between gap-2"><span className="text-slate-500">الربح/قطعة</span><strong className={product.salePrice >= product.purchasePrice ? "text-emerald-700" : "text-rose-700"}>{money(product.salePrice - product.purchasePrice)} {settings.currency}</strong></div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={low ? "text-amber-700 bg-amber-50" : "text-slate-600 bg-slate-100"} style={{ borderRadius: 999, padding: "3px 8px", fontSize: 11 }}>
                        المخزون: {product.quantity} {product.unitName || "قطعة"}{low ? " • منخفض" : ""}
                      </span>
                      <button onClick={() => openMovement(product, "restock")} className="text-blue-700 hover:bg-blue-50 border border-blue-100 rounded-md px-2 py-1 text-[11px] inline-flex items-center gap-1"><PackagePlus className="w-3.5 h-3.5" /> توريد</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button onClick={() => openDetails(product)} className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-[11px] inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> التفاصيل</button>
                      <button onClick={() => openEdit(product)} className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-[11px] inline-flex items-center gap-1"><Edit className="w-3.5 h-3.5" /> تعديل</button>
                      <button onClick={() => handleDelete(product)} className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-md text-[11px] inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-2xl shadow-xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b pb-3 mb-4">
              <h3 className="font-bold text-slate-800">{editingProduct ? "تعديل بطاقة البضاعة" : "إضافة بضاعة جديدة"}</h3>
              <button type="button" onClick={() => setIsFormOpen(false)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="إغلاق"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={saveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600">اسم البضاعة *
                  <input required value={form.name} onChange={e => setField("name", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="اسم واضح يساعدك تتذكرها" />
                </label>
                <label className="text-xs font-semibold text-slate-600">التصنيف *
                  <input required list="product-categories" value={form.category} onChange={e => setField("category", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="مثلاً: أجهزة، ملابس..." />
                  <datalist id="product-categories">{categories.filter(c => c !== "all").map(c => <option key={c} value={c} />)}</datalist>
                </label>
                <label className="text-xs font-semibold text-slate-600">رأس المال / سعر الشراء
                  <input type="number" min="0" required value={form.purchasePrice} onChange={e => setField("purchasePrice", Number(e.target.value))} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">سعر البيع للعميل
                  <input type="number" min="0" required value={form.salePrice} onChange={e => setField("salePrice", Number(e.target.value))} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">الكمية الحالية
                  <input type="number" min="0" required value={form.quantity} onChange={e => setField("quantity", Number(e.target.value))} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">وحدة القياس
                  <input value={form.unitName} onChange={e => setField("unitName", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="قطعة، كرتون، متر..." />
                </label>
                <label className="text-xs font-semibold text-slate-600">الحد الأدنى للتنبيه
                  <input type="number" min="0" value={form.minStock} onChange={e => setField("minStock", Number(e.target.value))} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">الباركود / رقم الصنف
                  <input value={form.barcode} onChange={e => setField("barcode", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="أدخل الرمز أو امسحه بالقارئ" />
                </label>
                <label className="text-xs font-semibold text-slate-600">اسم المجهّز / المورد
                  <input value={form.supplierName} onChange={e => setField("supplierName", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="المحل أو الشخص الذي اشتريت منه" />
                </label>
                <label className="text-xs font-semibold text-slate-600">هاتف المجهّز
                  <input value={form.supplierPhone} onChange={e => setField("supplierPhone", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" inputMode="tel" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-600">وصف ومواصفات البضاعة
                <textarea value={form.description} onChange={e => setField("description", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm min-h-20" placeholder="الموديل، اللون، الحجم، الضمان، وأي معلومات تريد تتذكرها..." />
              </label>
              <label className="block text-xs font-semibold text-slate-600">ملاحظات خاصة
                <textarea value={form.notes} onChange={e => setField("notes", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm min-h-20" placeholder="تفاصيل إضافية أو ملاحظات للشراء والبيع..." />
              </label>
              <div className="border rounded-xl p-3 space-y-3">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2"><ImagePlus className="w-4 h-4" /> صورة البضاعة</div>
                {form.imageUrl && <img src={form.imageUrl} alt="معاينة البضاعة" className="w-28 h-28 object-cover rounded-lg border" />}
                <label className="block text-xs text-slate-600">رابط الصورة
                  <input type="url" value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="https://..." />
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-slate-50">
                  <Camera className="w-4 h-4" /> {isSavingImage ? "جارٍ رفع الصورة..." : "اختيار صورة من الهاتف"}
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={isSavingImage} className="sr-only" />
                </label>
                <p className="text-[11px] text-slate-500">تُرفع الصورة إلى Firebase Storage لحسابك المسجّل، ثم يُحفظ رابطها مع بطاقة الصنف.</p>
              </div>
              {formError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">{formError}</p>}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 border-t pt-4">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2.5 border rounded-lg text-sm">إلغاء</button>
                <button type="submit" disabled={isSavingImage} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"><Save className="w-4 h-4" /> حفظ بطاقة البضاعة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {movementProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3">
          <form onSubmit={saveMovement} className="bg-white w-full max-w-md rounded-2xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-bold">تسجيل حركة مخزون</h3><button type="button" onClick={() => setMovementProduct(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div>
            <p className="text-sm text-slate-600">{movementProduct.name} — الكمية الحالية: {movementProduct.quantity}</p>
            <label className="block text-xs font-semibold text-slate-600">نوع الحركة
              <select value={movementType} onChange={e => setMovementType(e.target.value as typeof movementType)} className="mt-1 w-full p-3 border rounded-lg text-sm">
                <option value="restock">توريد / شراء (+)</option>
                <option value="return">مرتجع إلى المخزن (+)</option>
                <option value="damaged">تالف أو مفقود (-)</option>
                <option value="adjustment">تسوية كمية (+ أو -)</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">{movementType === "adjustment" ? "فرق الكمية (مثلاً -2 أو +5)" : "عدد القطع"}
              <input type="number" required step="1" value={movementQty} onChange={e => setMovementQty(Number(e.target.value))} className="mt-1 w-full p-3 border rounded-lg text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">ملاحظة / رقم فاتورة المجهّز
              <textarea value={movementNote} onChange={e => setMovementNote(e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="اختياري" />
            </label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setMovementProduct(null)} className="px-4 py-2 border rounded-lg text-sm">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">حفظ الحركة</button></div>
          </form>
        </div>
      )}

      {detailsProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-2xl shadow-xl p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-800">{detailsProduct.name}</h3><p className="text-xs text-slate-500 mt-1">{detailsProduct.category} {detailsProduct.barcode ? `• ${detailsProduct.barcode}` : ""}</p></div><button onClick={() => setDetailsProduct(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">{detailsProduct.imageUrl ? <img src={detailsProduct.imageUrl} alt={detailsProduct.name} className="w-full max-h-64 object-contain bg-slate-50 rounded-xl border" /> : <div className="h-40 bg-slate-50 border rounded-xl flex items-center justify-center"><ImagePlus className="w-10 h-10 text-slate-300" /></div>}</div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-3 content-start">
                {[["سعر الشراء", detailsProduct.purchasePrice], ["سعر البيع", detailsProduct.salePrice], ["ربح القطعة المتوقع", detailsProduct.salePrice - detailsProduct.purchasePrice], ["الكمية الحالية", detailsProduct.quantity]].map(([label, value]) => <div key={String(label)} className="bg-slate-50 rounded-lg p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="font-bold text-slate-800 mt-1">{money(Number(value))} {label === "الكمية الحالية" ? (detailsProduct.unitName || "قطعة") : settings.currency}</div></div>)}
                <div className="col-span-2 text-sm text-slate-700 space-y-1">
                  {detailsProduct.supplierName && <p className="flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" /> المجهّز: {detailsProduct.supplierName}</p>}
                  {detailsProduct.supplierPhone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {detailsProduct.supplierPhone}</p>}
                  {detailsProduct.description && <p className="whitespace-pre-wrap">{detailsProduct.description}</p>}
                  {detailsProduct.notes && <p className="whitespace-pre-wrap text-slate-500">ملاحظات: {detailsProduct.notes}</p>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setDetailsProduct(null); openEdit(detailsProduct); }} className="px-3 py-2 rounded-lg bg-slate-100 text-sm inline-flex items-center gap-1"><Edit className="w-4 h-4" /> تعديل البطاقة</button>
              <button onClick={() => { const p = detailsProduct; setDetailsProduct(null); openMovement(p, "restock"); }} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm inline-flex items-center gap-1"><PackagePlus className="w-4 h-4" /> توريد</button>
              <button onClick={() => { const p = detailsProduct; setDetailsProduct(null); openMovement(p, "return"); }} className="px-3 py-2 rounded-lg bg-slate-100 text-sm inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> مرتجع</button>
              <button onClick={() => { const p = detailsProduct; setDetailsProduct(null); openMovement(p, "damaged"); }} className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> تالف</button>
            </div>
            <section className="space-y-2">
              <h4 className="font-bold text-sm flex items-center gap-2"><History className="w-4 h-4" /> سجل الأسعار</h4>
              {(detailsProduct.priceHistory || []).length === 0 ? <p className="text-xs text-slate-500">سيظهر سجل الأسعار عند تسجيل الأسعار أو تغييرها مستقبلاً.</p> : <div className="space-y-2">{(detailsProduct.priceHistory || []).slice(0, 12).map(entry => <div key={entry.id} className="border rounded-lg p-3 text-xs flex flex-wrap justify-between gap-2"><span className="text-slate-500">{new Date(entry.changedAt).toLocaleString("ar-IQ")}</span><span>شراء: <b>{money(entry.purchasePrice)}</b> • بيع: <b>{money(entry.salePrice)}</b></span>{entry.supplierName && <span>المجهّز: {entry.supplierName}</span>}{entry.note && <span className="text-slate-500">{entry.note}</span>}</div>)}</div>}
            </section>
            <section className="space-y-2">
              <h4 className="font-bold text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> حركة المخزون والفواتير المرتبطة</h4>
              {historyForProduct(detailsProduct).length === 0 ? <p className="text-xs text-slate-500">لا توجد حركات مسجلة بعد.</p> : <div className="space-y-2">{historyForProduct(detailsProduct).map((entry: any) => <div key={entry.id} className="border rounded-lg p-3 flex flex-wrap justify-between gap-2 text-xs"><div><b>{entry.label}</b><div className="text-slate-500 mt-1">{entry.note || ""}{entry.customerName ? ` • العميل: ${entry.customerName}` : ""}</div></div><div className="text-left"><b className={entry.quantity < 0 ? "text-rose-700" : "text-emerald-700"}>{entry.quantity > 0 ? "+" : ""}{entry.quantity}</b><div className="text-slate-400 mt-1">{entry.createdAt ? new Date(entry.createdAt).toLocaleString("ar-IQ") : ""}</div></div></div>)}</div>}
            </section>
            <div className="flex justify-end border-t pt-3"><button onClick={() => setDetailsProduct(null)} className="px-4 py-2 border rounded-lg text-sm">إغلاق</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
