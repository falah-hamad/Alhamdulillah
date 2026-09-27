import React, { useState } from "react";
import {
  Package,
  Search,
  PlusCircle,
  TrendingUp,
  AlertTriangle,
  Barcode,
  Edit,
  Trash2,
  X,
  PackagePlus,
  Layers,
  ChevronLeft
} from "lucide-react";
import { Product, SystemSettings } from "../types";

interface ProductsViewProps {
  products: Product[];
  settings: SystemSettings;
  addProduct: (product: Omit<Product, "id">) => Product;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
}

export default function ProductsView({
  products,
  settings,
  addProduct,
  updateProduct,
  deleteProduct,
}: ProductsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Quick Restock Modal
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState<number>(10);

  // Form State
  const [name, setName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(0);
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");

  // Categories list derived dynamically
  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category)))];

  // Calculations
  const totalItemsCount = products.reduce((acc, p) => acc + p.quantity, 0);
  const totalCostValue = products.reduce((acc, p) => acc + p.purchasePrice * p.quantity, 0);
  const totalRetailValue = products.reduce((acc, p) => acc + p.salePrice * p.quantity, 0);
  const potentialProfit = totalRetailValue - totalCostValue;

  // Form handlers
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !category.trim()) {
      alert("الرجاء تعبئة اسم البضاعة والتصنيف.");
      return;
    }
    addProduct({
      name,
      purchasePrice: Number(purchasePrice) || 0,
      salePrice: Number(salePrice) || 0,
      quantity: Number(quantity) || 0,
      category,
      barcode: barcode.trim() || undefined,
    });
    setIsAddModalOpen(false);
    resetForm();
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!name.trim() || !category.trim()) {
      alert("الرجاء تعبئة اسم البضاعة والتصنيف.");
      return;
    }
    updateProduct({
      ...editingProduct,
      name,
      purchasePrice: Number(purchasePrice) || 0,
      salePrice: Number(salePrice) || 0,
      quantity: Number(quantity) || 0,
      category,
      barcode: barcode.trim() || undefined,
    });
    setIsEditModalOpen(false);
    setEditingProduct(null);
    resetForm();
  };

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    updateProduct({
      ...restockProduct,
      quantity: restockProduct.quantity + Number(restockQty),
    });
    setIsRestockModalOpen(false);
    setRestockProduct(null);
    setRestockQty(10);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setPurchasePrice(p.purchasePrice);
    setSalePrice(p.salePrice);
    setQuantity(p.quantity);
    setCategory(p.category);
    setBarcode(p.barcode || "");
    setIsEditModalOpen(true);
  };

  const openRestockModal = (p: Product) => {
    setRestockProduct(p);
    setIsRestockModalOpen(true);
  };

  const handleDelete = (id: string, pName: string) => {
    if (confirm(`هل أنت متأكد من حذف سلعة البضاعة "${pName}"؟`)) {
      deleteProduct(id);
    }
  };

  const resetForm = () => {
    setName("");
    setPurchasePrice(0);
    setSalePrice(0);
    setQuantity(0);
    setCategory("");
    setBarcode("");
  };

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery));
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">عدد البضائع الكلي</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-800 font-mono">{totalItemsCount}</span>
              <span className="text-xs text-slate-400 font-medium">وحدة</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">رأس المال المستثمر (سعر الشراء)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-800 font-mono">{totalCostValue.toLocaleString()}</span>
              <span className="text-xs text-slate-400 font-medium">{settings.currency}</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">القيمة السوقية المتوقعة (سعر البيع)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-blue-600 font-mono">{totalRetailValue.toLocaleString()}</span>
              <span className="text-xs text-blue-500 font-medium">{settings.currency}</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium">الأرباح المتوقعة عند البيع الكامل</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-blue-600 font-mono">{potentialProfit.toLocaleString()}</span>
              <span className="text-xs text-blue-500 font-medium">{settings.currency}</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        
        {/* Header and Add Button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              مستودع البضائع والمنتجات
            </h2>
            <p className="text-[11px] text-slate-500">
              إدارة المخزون، أسعار البيع والشراء، والتحكم بمستويات المواد في المستودع.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> إضافة بضاعة جديدة
          </button>
        </div>

        {/* Filters and Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث عن المادة بالاسم أو الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-4 py-2 bg-slate-50 hover:bg-slate-50/80 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
            >
              <option value="all">📁 جميع التصنيفات</option>
              {categories.filter((cat) => cat !== "all").map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Products Table */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            لا توجد مواد مسجلة تطابق محددات البحث.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                  <th className="p-3">اسم البضاعة</th>
                  <th className="p-3">الباركود</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3 text-left">سعر الشراء</th>
                  <th className="p-3 text-left">سعر البيع</th>
                  <th className="p-3 text-center">الكمية المتوفرة</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{p.name}</p>
                    </td>
                    <td className="p-3">
                      {p.barcode ? (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                          <Barcode className="w-3.5 h-3.5 text-slate-400" /> {p.barcode}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[10px] font-sans">غير محدد</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-semibold border border-blue-100/50">
                        {p.category}
                      </span>
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-slate-500">
                      {p.purchasePrice.toLocaleString()} {settings.currency}
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-blue-600">
                      {p.salePrice.toLocaleString()} {settings.currency}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded font-mono font-bold ${
                          p.quantity === 0
                            ? "bg-rose-100 text-rose-700"
                            : p.quantity <= 10
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {p.quantity} قطع
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openRestockModal(p)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="إعادة تزويد المخزون"
                        >
                          <PackagePlus className="w-3.5 h-3.5" /> توريد
                        </button>
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                          title="تعديل"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD PRODUCT */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-blue-600" />
                إضافة بضاعة جديدة للمخزن
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">اسم المادة / البضاعة بالتفصيل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: كيس أرز بسمتي هندي (10 كجم)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">سعر الشراء (رأس المال) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="0.00"
                    value={purchasePrice || ""}
                    onChange={(e) => setPurchasePrice(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">سعر البيع (للعميل) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="0.00"
                    value={salePrice || ""}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">الكمية المتوفرة حالياً *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="0"
                    value={quantity || ""}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-center focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">التصنيف / العائلة *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: المواد الغذائية"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">الباركود (اختياري)</label>
                <input
                  type="text"
                  placeholder="أدخل الرمز الشريطي للسلعة"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  تثبيت السلعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT PRODUCT */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                تعديل بيانات السلعة الحالية
              </h3>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingProduct(null);
                }}
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">اسم المادة بالتفصيل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">سعر الشراء *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">سعر البيع *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">الكمية المتوفرة *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-center focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs font-semibold mb-1">التصنيف *</label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">الباركود (اختياري)</label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-left focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: QUICK RESTOCK */}
      {isRestockModalOpen && restockProduct && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-blue-600" />
                توريد مخزون جديد للمستودع
              </h3>
              <button
                onClick={() => {
                  setIsRestockModalOpen(false);
                  setRestockProduct(null);
                }}
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1">
                <p className="font-semibold text-slate-700">البضاعة: {restockProduct.name}</p>
                <p className="text-slate-500">المخزون الحالي: {restockProduct.quantity} قطع</p>
              </div>

              <div>
                <label className="block text-slate-500 text-xs font-semibold mb-1">الكمية الجديدة الموردة (قطع) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={restockQty}
                  onChange={(e) => setRestockQty(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono text-center focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRestockModalOpen(false);
                    setRestockProduct(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  إضافة للمستودع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
