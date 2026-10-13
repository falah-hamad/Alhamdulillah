import React, { useMemo, useRef, useState } from "react";
import {
  Package, Search, PlusCircle, TrendingUp, SquarePen, Trash2, X,
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
  purchasePrice: string;
  salePrice: string;
  quantity: string;
  category: string;
  barcode: string;
  imageUrl: string;
  description: string;
  notes: string;
  supplierName: string;
  supplierPhone: string;
  minStock: string;
  unitName: string;
};

const emptyForm: ProductForm = {
  name: "", purchasePrice: "", salePrice: "", quantity: "", category: "",
  barcode: "", imageUrl: "", description: "", notes: "", supplierName: "",
  supplierPhone: "", minStock: "", unitName: "قطعة",
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

function ProductsViewContent({
  products: rawProducts, invoices: rawInvoices = [], settings, addProduct, updateProduct, deleteProduct,
}: ProductsViewProps) {
  // Protect this view from malformed legacy/cache records so one bad record cannot blank the page.
  const products: Product[] = Array.isArray(rawProducts)
    ? rawProducts.filter((p): p is Product => Boolean(p && typeof p === "object")).map((p) => ({
        ...p,
        name: typeof p.name === "string" ? p.name : "",
        category: typeof p.category === "string" ? p.category : "",
        priceHistory: Array.isArray(p.priceHistory) ? p.priceHistory : [],
        stockMovements: Array.isArray(p.stockMovements) ? p.stockMovements : [],
      }))
    : [];
  const invoices: Invoice[] = Array.isArray(rawInvoices)
    ? rawInvoices.filter((invoice): invoice is Invoice => Boolean(invoice && typeof invoice === "object"))
        .map((invoice) => ({ ...invoice, items: Array.isArray(invoice.items) ? invoice.items : [] }))
    : [];
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
  const [movementQty, setMovementQty] = useState("1");
  const [movementNote, setMovementNote] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [actionProduct, setActionProduct] = useState<Product | null>(null);
  const [actionMode, setActionMode] = useState<"move" | "copy" | null>(null);
  const [targetCategory, setTargetCategory] = useState("");
  const [openProductMenuId, setOpenProductMenuId] = useState<string | null>(null);
  const [openCategoryMenu, setOpenCategoryMenu] = useState<string | null>(null);
  const [pressedItem, setPressedItem] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const longPressTimer = useRef<number | null>(null);
  const suppressNextClick = useRef(false);
  const placeMenuAt = (x: number, y: number, height: number) => {
    const top = y + height + 8 <= window.innerHeight ? y + 4 : Math.max(8, y - height - 4);
    const left = Math.max(8, Math.min(x - 192, window.innerWidth - 200));
    setMenuPosition({ top, left });
  };
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressedItem(null);
  };
  const startLongPress = (event: React.TouchEvent, height: number, itemKey: string, open: () => void) => {
    clearLongPress();
    const touch = event.touches[0];
    if (!touch) return;
    const x = touch.clientX;
    const y = touch.clientY;
    setPressedItem(itemKey);
    longPressTimer.current = window.setTimeout(() => {
      suppressNextClick.current = true;
      placeMenuAt(x, y, height);
      open();
      longPressTimer.current = null;
    }, 550);
  };

  const activeProducts = useMemo(() => products.filter(p => !p.isDeleted), [products]);
  const trashedProducts = useMemo(() => products.filter(p => p.isDeleted), [products]);
  const categories = useMemo(() => ["all", ...Array.from(new Set(activeProducts.map(p => p.category).filter(Boolean)))], [activeProducts]);
  const totalItemsCount = activeProducts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  const totalCostValue = activeProducts.reduce((sum, p) => sum + (Number(p.purchasePrice) || 0) * (Number(p.quantity) || 0), 0);
  const totalRetailValue = activeProducts.reduce((sum, p) => sum + (Number(p.salePrice) || 0) * (Number(p.quantity) || 0), 0);
  const potentialProfit = totalRetailValue - totalCostValue;
  const linkedSalesProfitEstimate = invoices.reduce((sum, invoice) => sum + (invoice.items || []).reduce((itemSum, item) => {
    if (!item.productId || item.isSeparator || item.isPaymentRow || item.isRemainingRow) return itemSum;
    const product = products.find(p => p.id === item.productId);
    const historicalCost = product?.stockMovements?.find(m => m.referenceId === invoice.id && m.type === "sale")?.unitCost;
    const unitCost = historicalCost !== undefined && Number.isFinite(Number(historicalCost))
      ? Number(historicalCost)
      : (Number(product?.purchasePrice) || 0);
    return itemSum + ((Number(item.unitPrice) || 0) - unitCost) * (Number(item.quantity) || 0);
  }, 0), 0);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    return activeProducts.filter(p => {
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
  }, [activeProducts, searchQuery, selectedCategory, quickFilter]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    filteredProducts.forEach(product => {
      const category = product.category?.trim() || "بدون تصنيف";
      const current = groups.get(category) || [];
      current.push(product);
      groups.set(category, current);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "ar"));
  }, [filteredProducts]);

  const setField = <K extends keyof ProductForm,>(key: K, value: ProductForm[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  const openAdd = (category = "") => {
    setEditingProduct(null);
    setForm({ ...emptyForm, category: category === "بدون تصنيف" ? "" : category });
    setFormError("");
    setIsFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      ...emptyForm,
      name: product.name || "",
      purchasePrice: product.purchasePrice == null ? "" : String(product.purchasePrice),
      salePrice: product.salePrice == null ? "" : String(product.salePrice),
      quantity: product.quantity == null ? "" : String(product.quantity),
      category: product.category || "",
      barcode: product.barcode || "",
      imageUrl: product.imageUrl || "",
      description: product.description || "",
      notes: product.notes || "",
      supplierName: product.supplierName || "",
      supplierPhone: product.supplierPhone || "",
      minStock: product.minStock == null ? "5" : String(product.minStock),
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
    if ([form.purchasePrice, form.salePrice, form.quantity, form.minStock].some(value => value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
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
      const supplierChanged = (editingProduct.supplierName || "") !== (common.supplierName || "");
      const quantityDelta = common.quantity - (Number(editingProduct.quantity) || 0);
      const priceHistory: ProductPriceHistoryEntry[] = [...(editingProduct.priceHistory || [])];
      if (priceChanged || supplierChanged) {
        priceHistory.unshift({
          id: priceId(), changedAt: nowIso(),
          previousPurchasePrice: editingProduct.purchasePrice,
          previousSalePrice: editingProduct.salePrice,
          purchasePrice: common.purchasePrice,
          salePrice: common.salePrice,
          supplierName: common.supplierName,
          note: priceChanged
            ? (supplierChanged ? "تحديث الأسعار والمجهّز من بطاقة البضاعة" : "تعديل سعر من بطاقة البضاعة")
            : "تحديث المجهّز من بطاقة البضاعة",
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
    setMovementQty("1");
    setMovementNote("");
  };

  const saveMovement = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedMovementQty = Number(movementQty);
    if (!movementProduct || movementQty.trim() === "" || !Number.isFinite(parsedMovementQty) || parsedMovementQty === 0) return;
    if (movementType !== "adjustment" && parsedMovementQty < 1) {
      alert("أدخل كمية أكبر من صفر.");
      return;
    }
    const delta = movementType === "restock" || movementType === "return"
      ? Math.abs(parsedMovementQty)
      : movementType === "damaged" ? -Math.abs(parsedMovementQty) : parsedMovementQty;
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
    if (confirm(`نقل "${product.name}" إلى المهملات؟ يمكنك استعادتها لاحقاً، ولن تُحذف الفواتير السابقة.`)) {
      void updateProduct({ ...product, isDeleted: true, deletedAt: nowIso(), originalCategory: product.category });
      if (detailsProduct?.id === product.id) setDetailsProduct(null);
    }
  };

  const restoreProduct = (product: Product) => {
    const restoredCategory = product.originalCategory || product.category || "";
    void updateProduct({ ...product, category: restoredCategory, isDeleted: false, deletedAt: undefined, originalCategory: undefined });
  };

  const openProductAction = (product: Product, mode: "move" | "copy") => {
    setActionProduct(product); setActionMode(mode); setTargetCategory(product.category || categories.find(c => c !== "all") || "");
  };

  const commitProductAction = () => {
    if (!actionProduct || !actionMode || !targetCategory.trim()) return;
    const destination = targetCategory.trim();
    if (actionMode === "move") {
      if (destination === actionProduct.category) { alert("الصنف موجود بالفعل في هذا التصنيف."); return; }
      void updateProduct({ ...actionProduct, category: destination });
      alert(`تم نقل "${actionProduct.name}" إلى "${destination}".`);
    } else {
      const { id: _oldId, userId: _oldUser, isDeleted: _deleted, deletedAt: _deletedAt, originalCategory: _originalCategory, lastViewedAt: _lastViewed, ...copy } = actionProduct;
      addProduct({ ...copy, name: `${actionProduct.name} - نسخة`, category: destination, barcode: undefined, quantity: 0, isFavorite: false, priceHistory: [{ id: priceId(), changedAt: nowIso(), purchasePrice: actionProduct.purchasePrice, salePrice: actionProduct.salePrice, supplierName: actionProduct.supplierName, note: "نسخة جديدة من صنف موجود؛ المخزون يبدأ من صفر" }], stockMovements: [] });
      alert(`تم إنشاء نسخة مستقلة من "${actionProduct.name}" بكمية صفر.`);
    }
    setActionProduct(null); setActionMode(null);
  };

  const renameCategory = (category: string) => {
    const nextName = prompt(`اكتب الاسم الجديد للتصنيف "${category}":`, category)?.trim();
    if (!nextName || nextName === category) return;
    if (categories.includes(nextName)) { alert("يوجد تصنيف بهذا الاسم بالفعل."); return; }
    const members = activeProducts.filter(p => p.category === category);
    if (!confirm(`تغيير اسم التصنيف وتحديث ${members.length} صنف إلى "${nextName}"؟`)) return;
    members.forEach(product => { void updateProduct({ ...product, category: nextName }); });
  };

  const deleteCategory = (category: string) => {
    const members = activeProducts.filter(p => p.category === category);
    if (!members.length) { alert("لا توجد أصناف نشطة في هذا التصنيف."); return; }
    const destination = prompt(`التصنيف "${category}" يحتوي ${members.length} صنف. اكتب اسم تصنيف بديل لنقلها إليه، أو اكتب بدون تصنيف:`, "بدون تصنيف")?.trim();
    if (!destination || destination === category) return;
    if (!confirm(`نقل ${members.length} صنف إلى "${destination}" ثم إزالة التصنيف القديم من القائمة؟`)) return;
    members.forEach(product => { void updateProduct({ ...product, category: destination === "بدون تصنيف" ? "" : destination }); });
    if (selectedCategory === category) setSelectedCategory("all");
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
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setShowCategoryManager(true); setShowTrash(false); }} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-semibold"><Layers className="w-4 h-4" /> إدارة التصنيفات</button>
            <button type="button" onClick={() => { setShowTrash(v => !v); setShowCategoryManager(false); }} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-semibold"><Trash2 className="w-4 h-4" /> المهملات ({trashedProducts.length})</button>
            <button onClick={openAdd} className="inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"><PlusCircle className="w-4 h-4" /> إضافة بضاعة</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="relative lg:col-span-6">
            <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
            <input value={searchQuery} onInput={e => setSearchQuery(e.target.value)} placeholder="ابحث بالاسم أو الباركود أو المجهّز أو الملاحظات..." className="w-full min-w-0 pr-9 pl-3 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-blue-500" />
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
          <div className="space-y-5 min-w-0">
            {groupedProducts.map(([category, categoryProducts]) => (
              <section key={category} className="min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                <div
                  className={`flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b select-none transition-colors duration-150 ${pressedItem === `category:${category}` ? "bg-blue-100/80 border-blue-300 shadow-[inset_0_0_0_2px_rgba(59,130,246,0.65)]" : "bg-slate-50 border-slate-200"}`}
                  onContextMenu={event => { event.preventDefault(); placeMenuAt(event.clientX, event.clientY, 150); setOpenCategoryMenu(category); setOpenProductMenuId(null); }}
                  onTouchStart={event => startLongPress(event, 150, `category:${category}`, () => { setOpenCategoryMenu(category); setOpenProductMenuId(null); })}
                  onTouchEnd={clearLongPress}
                  onTouchMove={clearLongPress}
                  onTouchCancel={clearLongPress}
                  title="اضغط مطولاً لعرض إجراءات التصنيف"
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4 text-blue-600 shrink-0" /> <span className="truncate">{category}</span></h3>
                    <span className="text-xs text-slate-500 mt-1 block">{categoryProducts.length} صنف</span>
                  </div>
                  <div className="relative shrink-0 text-xs text-slate-400">اضغط مطولاً</div>
                  {openCategoryMenu === category && (
                      <div style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, zIndex: 99999 }} className="w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                        <button type="button" onClick={() => { setOpenCategoryMenu(null); openAdd(category); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-blue-50"><PackagePlus className="w-4 h-4 text-blue-600" /> إضافة بضاعة لهذا التصنيف</button>
                        <button type="button" disabled={category === "بدون تصنيف"} onClick={() => { setOpenCategoryMenu(null); renameCategory(category); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50 disabled:opacity-40"><SquarePen className="w-4 h-4" /> إعادة تسمية التصنيف</button>
                        <button type="button" disabled={category === "بدون تصنيف"} onClick={() => { setOpenCategoryMenu(null); deleteCategory(category); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="w-4 h-4" /> حذف التصنيف</button>
                      </div>
                    )}
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm text-right">
                    <thead className="bg-white text-slate-500 text-xs">
                      <tr>
                                                <th scope="col" className="px-3 py-3 font-semibold">اسم البضاعة</th>
                        <th scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">سعر الشراء</th>
                        <th scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">سعر البيع</th>
                        <th scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">الربح / قطعة</th>
                        <th scope="col" className="px-3 py-3 font-semibold">الصورة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {categoryProducts.map(product => {
                        const profit = (Number(product.salePrice) || 0) - (Number(product.purchasePrice) || 0);
                        return (
                          <tr
                            key={product.id}
                            className={`select-none cursor-pointer transition-colors duration-150 ${pressedItem === `product:${product.id}` ? "bg-blue-100/80 shadow-[inset_0_0_0_2px_rgba(59,130,246,0.65)]" : "hover:bg-slate-50/80"}`}
                            onClick={event => {
                              if (suppressNextClick.current) { suppressNextClick.current = false; return; }
                              if ((event.target as HTMLElement).closest("button")) return;
                              setOpenProductMenuId(null);
                              setOpenCategoryMenu(null);
                              openDetails(product);
                            }}
                            onContextMenu={event => { event.preventDefault(); placeMenuAt(event.clientX, event.clientY, 360); setOpenProductMenuId(product.id); setOpenCategoryMenu(null); }}
                            onTouchStart={event => startLongPress(event, 360, `product:${product.id}`, () => { setOpenProductMenuId(product.id); setOpenCategoryMenu(null); })}
                            onTouchEnd={clearLongPress}
                            onTouchMove={clearLongPress}
                            onTouchCancel={clearLongPress}
                            title="اضغط مطولاً لعرض إجراءات البضاعة"
                          >
                                                        <td className="px-3 py-3">
                              <div className="font-bold text-slate-800">{product.name}</div>
                              <div className="text-[11px] text-slate-500 mt-1">المخزون: {Number(product.quantity) || 0} {product.unitName || "قطعة"}{product.barcode ? ` • ${product.barcode}` : ""}</div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">{money(product.purchasePrice)} <span className="text-[10px] text-slate-500">{settings.currency}</span></td>
                            <td className="px-3 py-3 whitespace-nowrap font-semibold text-blue-700">{money(product.salePrice)} <span className="text-[10px] text-slate-500">{settings.currency}</span></td>
                            <td className={`px-3 py-3 whitespace-nowrap font-bold ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(profit)} <span className="text-[10px] font-normal text-slate-500">{settings.currency}</span></td>
                            <td className="px-3 py-3">
                              <button type="button" onClick={() => openDetails(product)} className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center" title={`عرض صورة ${product.name}`} aria-label={`تفاصيل ${product.name}`}>
                                {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" /> : <ImagePlus className="w-5 h-5 text-slate-300" />}
                              </button>
                            </td>
                            {openProductMenuId === product.id && (
                              <div style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, zIndex: 99999 }} className="w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                                <button type="button" onClick={() => { setOpenProductMenuId(null); openDetails(product); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><Eye className="w-4 h-4" /> عرض التفاصيل</button>
                                <button type="button" onClick={() => { setOpenProductMenuId(null); openEdit(product); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><SquarePen className="w-4 h-4" /> تعديل البضاعة</button>
                                <button type="button" onClick={() => { setOpenProductMenuId(null); const name = prompt("اكتب الاسم الجديد للبضاعة:", product.name)?.trim(); if (name && name !== product.name) { void updateProduct({ ...product, name }); } }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><Package className="w-4 h-4" /> إعادة تسمية</button>
                                <button type="button" onClick={() => { setOpenProductMenuId(null); openProductAction(product, "move"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><Layers className="w-4 h-4" /> نقل إلى تصنيف</button>
                                <button type="button" onClick={() => { setOpenProductMenuId(null); openProductAction(product, "copy"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><ClipboardList className="w-4 h-4" /> نسخ البضاعة</button>
                                <button type="button" onClick={() => { setOpenProductMenuId(null); setMovementProduct(product); setMovementType("restock"); setMovementQty("1"); setMovementNote(""); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-slate-50"><PackagePlus className="w-4 h-4" /> إضافة للمخزون</button>
                                <button type="button" onClick={() => { setOpenProductMenuId(null); void updateProduct({ ...product, isFavorite: !product.isFavorite }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm hover:bg-amber-50"><Star className="w-4 h-4" /> {product.isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}</button>
                                <div className="my-1 border-t border-slate-100" />
                                <button type="button" onClick={() => { setOpenProductMenuId(null); handleDelete(product); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-sm text-rose-700 hover:bg-rose-50"><Trash2 className="w-4 h-4" /> حذف إلى المهملات</button>
                              </div>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {showCategoryManager && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3"><section dir="rtl" className="bg-white w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-bold text-lg">إدارة التصنيفات</h3><button type="button" onClick={() => setShowCategoryManager(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div><p className="text-xs text-slate-500">التصنيفات الحالية مستنتجة من الأصناف. تغيير الاسم يحدّث الأصناف المرتبطة، وحذف تصنيف ينقل أصنافه إلى وجهة تختارها.</p>{categories.filter(c => c !== "all").length === 0 ? <p className="text-sm text-slate-500">لا توجد تصنيفات بعد.</p> : categories.filter(c => c !== "all").map(category => <div key={category} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3"><div><b>{category}</b><p className="text-xs text-slate-500">{activeProducts.filter(p => p.category === category).length} صنف</p></div><div className="flex gap-2"><button type="button" onClick={() => renameCategory(category)} className="px-3 py-2 text-xs border rounded-lg">تعديل الاسم</button><button type="button" onClick={() => deleteCategory(category)} className="px-3 py-2 text-xs border border-rose-200 text-rose-700 rounded-lg">حذف التصنيف</button></div></div>)}<button type="button" onClick={() => { setShowCategoryManager(false); openAdd(); }} className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm">إضافة تصنيف عبر إضافة بضاعة</button></section></div>}

      {showTrash && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3"><section dir="rtl" className="bg-white w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-bold text-lg">مهملات البضائع ({trashedProducts.length})</h3><button type="button" onClick={() => setShowTrash(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div><p className="text-xs text-slate-500">الحذف هنا مؤقت. الاستعادة تعيد الصنف إلى القائمة، والحذف النهائي لا يمسح الفواتير التاريخية.</p>{trashedProducts.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">المهملات فارغة.</p> : <div className="space-y-2">{trashedProducts.map(product => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3"><div className="flex items-center gap-3 min-w-0">{product.imageUrl ? <img src={product.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg" /> : <Package className="w-8 h-8 text-slate-300" />}<div className="min-w-0"><b>{product.name}</b><p className="text-xs text-slate-500">التصنيف: {product.originalCategory || product.category || "بدون تصنيف"} • حذف: {product.deletedAt ? new Date(product.deletedAt).toLocaleString("ar-IQ") : "غير معروف"}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => restoreProduct(product)} className="px-3 py-2 border rounded-lg text-xs">استعادة</button><button type="button" onClick={() => { if (confirm(`حذف "${product.name}" نهائياً من قائمة البضائع؟ ستبقى تفاصيل الفواتير التاريخية كما هي.`)) deleteProduct(product.id); }} className="px-3 py-2 border border-rose-200 text-rose-700 rounded-lg text-xs">حذف نهائي</button></div></div>)}</div>}{trashedProducts.length > 0 && <button type="button" onClick={() => { if (confirm(`حذف ${trashedProducts.length} صنف نهائياً من قائمة البضائع؟ لا يمكن التراجع عن ذلك.`)) trashedProducts.forEach(p => deleteProduct(p.id)); }} className="w-full py-2.5 border border-rose-200 text-rose-700 rounded-lg text-sm">إفراغ المهملات نهائياً</button>}</section></div>}

      {actionProduct && actionMode && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3"><section dir="rtl" className="bg-white w-full max-w-md rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-bold">{actionMode === "move" ? "نقل الصنف إلى تصنيف" : "نسخ الصنف إلى تصنيف"}</h3><button type="button" onClick={() => { setActionProduct(null); setActionMode(null); }} className="p-2 rounded-lg"><X className="w-5 h-5" /></button></div><p className="text-sm">{actionProduct.name} — التصنيف الحالي: {actionProduct.category || "بدون تصنيف"}</p>{actionMode === "copy" && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">ستُنشأ بطاقة مستقلة بكمية صفر، دون نسخ سجل الحركات أو ربط الفواتير القديمة.</p>}<label className="block text-sm font-semibold">التصنيف المستهدف</label><input list="product-category-options" value={targetCategory} onInput={e => setTargetCategory(e.currentTarget.value)} placeholder="اكتب أو اختر تصنيفاً" className="w-full p-3 border rounded-lg" /><datalist id="product-category-options">{categories.filter(c => c !== "all").map(c => <option key={c} value={c} />)}</datalist><div className="flex gap-2"><button type="button" onClick={() => { setActionProduct(null); setActionMode(null); }} className="flex-1 py-2.5 border rounded-lg">إلغاء</button><button type="button" onClick={commitProductAction} disabled={!targetCategory.trim()} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg disabled:opacity-50">تأكيد</button></div></section></div>}

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
                  <input required value={form.name} onInput={e => setField("name", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="اسم واضح يساعدك تتذكرها" />
                </label>
                <label className="text-xs font-semibold text-slate-600">التصنيف *
                  <input required list="product-categories" value={form.category} onInput={e => setField("category", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="مثلاً: أجهزة، ملابس..." />
                  <datalist id="product-categories">{categories.filter(c => c !== "all").map(c => <option key={c} value={c} />)}</datalist>
                </label>
                <label className="text-xs font-semibold text-slate-600">رأس المال / سعر الشراء
                  <input type="number" min="0" required value={form.purchasePrice} onInput={e => setField("purchasePrice", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">سعر البيع للعميل
                  <input type="number" min="0" required value={form.salePrice} onInput={e => setField("salePrice", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">الكمية الحالية
                  <input type="number" min="0" required value={form.quantity} onInput={e => setField("quantity", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">وحدة القياس
                  <input value={form.unitName} onInput={e => setField("unitName", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="قطعة، كرتون، متر..." />
                </label>
                <label className="text-xs font-semibold text-slate-600">الحد الأدنى للتنبيه
                  <input type="number" min="0" value={form.minStock} onInput={e => setField("minStock", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">الباركود / رقم الصنف
                  <input value={form.barcode} onInput={e => setField("barcode", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="أدخل الرمز أو امسحه بالقارئ" />
                </label>
                <label className="text-xs font-semibold text-slate-600">اسم المجهّز / المورد
                  <input value={form.supplierName} onInput={e => setField("supplierName", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="المحل أو الشخص الذي اشتريت منه" />
                </label>
                <label className="text-xs font-semibold text-slate-600">هاتف المجهّز
                  <input value={form.supplierPhone} onInput={e => setField("supplierPhone", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" inputMode="tel" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-600">وصف ومواصفات البضاعة
                <textarea value={form.description} onInput={e => setField("description", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm min-h-20" placeholder="الموديل، اللون، الحجم، الضمان، وأي معلومات تريد تتذكرها..." />
              </label>
              <label className="block text-xs font-semibold text-slate-600">ملاحظات خاصة
                <textarea value={form.notes} onInput={e => setField("notes", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm min-h-20" placeholder="تفاصيل إضافية أو ملاحظات للشراء والبيع..." />
              </label>
              <div className="border rounded-xl p-3 space-y-3">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2"><ImagePlus className="w-4 h-4" /> صورة البضاعة</div>
                {form.imageUrl && <img src={form.imageUrl} alt="معاينة البضاعة" className="w-28 h-28 object-cover rounded-lg border" />}
                <label className="block text-xs text-slate-600">رابط الصورة
                  <input type="url" value={form.imageUrl} onInput={e => setField("imageUrl", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="https://..." />
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
              <input type="number" required step="1" value={movementQty} onInput={e => setMovementQty(e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">ملاحظة / رقم فاتورة المجهّز
              <textarea value={movementNote} onInput={e => setMovementNote(e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="اختياري" />
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
              <button onClick={() => { setDetailsProduct(null); openEdit(detailsProduct); }} className="px-3 py-2 rounded-lg bg-slate-100 text-sm inline-flex items-center gap-1"><SquarePen className="w-4 h-4" /> تعديل البطاقة</button>
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


type ProductsViewBoundaryState = { error: Error | null };

class ProductsViewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ProductsViewBoundaryState
> {
  declare props: Readonly<{ children: React.ReactNode }>;
  state: ProductsViewBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ProductsViewBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ProductsView runtime error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section dir="rtl" role="alert" className="m-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-slate-800">
          <h2 className="font-bold text-rose-800">تعذر فتح نظام البضائع</h2>
          <p className="mt-2 text-sm">تم إيقاف الجزء المتعطل فقط حتى لا تصبح الصفحة كلها بيضاء. رسالة الخطأ:</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs">{this.state.error.message}</pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            إعادة تحميل الموقع
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

export default function ProductsView(props: ProductsViewProps) {
  return (
    <ProductsViewErrorBoundary>
      <ProductsViewContent {...props} />
    </ProductsViewErrorBoundary>
  );
}
