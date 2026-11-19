import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PriceLabelsModal from "./PriceLabelsModal";
import BarcodeScannerModal from "./BarcodeScannerModal";
import { FilterButton, FilterPanel } from "./FilterPanel";
import {
  Package, Search, PlusCircle, TrendingUp, SquarePen, Trash2, X, Sparkles,
  PackagePlus, Layers, Star, ImagePlus, History, RotateCcw, AlertTriangle,
  Eye, Save, Camera, ClipboardList, FileText,
  Phone, Truck, Clock, ScanBarcode, ChevronLeft, ChevronRight, ChevronDown, GripVertical, SlidersHorizontal
} from "lucide-react";
import { Customer, Invoice, Product, ProductStockMovement, ProductStockMovementType, SystemSettings } from "../types";
import { db, uploadUserFile } from "../lib/firebase";
import { collection, doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { parseProductsFromTextServer } from "../lib/cloudFunctions";
import { useAuth } from "../contexts/AuthContext";
import { formatStockSaleTimestamp, getProductSalesHistory } from "../lib/productSalesHistory";
import FormattedNumberInput from "./FormattedNumberInput";
import { formatThousands } from "../utils/numberFormatting";


interface ProductsViewProps {
  products: Product[];
  invoices?: Invoice[];
  customers?: Customer[];
  settings: SystemSettings;
  addProduct: (product: Omit<Product, "id">) => Product;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
}

type AIParsedProduct = { name: string; category: string; quantity: number; unitName: string; purchasePrice: number; salePrice: number; supplierName?: string; supplierPhone?: string; barcode?: string; description?: string; notes?: string; minStock?: number };

type ProductForm = {
  name: string;
  purchasePrice: string;
  salePrice: string;
  quantity: string;
  category: string;
  barcode: string;
  imageUrl: string;
  imageUrls: string[];
  description: string;
  notes: string;
  supplierName: string;
  supplierPhone: string;
  location: string;
  minStock: string;
  unitName: string;
};

const emptyForm: ProductForm = {
  name: "", purchasePrice: "", salePrice: "", quantity: "", category: "",
  barcode: "", imageUrl: "", imageUrls: [], description: "", notes: "", supplierName: "",
  supplierPhone: "", location: "", minStock: "", unitName: "قطعة",
};

const nowIso = () => new Date().toISOString();
const movementId = () => `move-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const priceId = () => `price-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const money = (value: number) => formatThousands((Number(value) || 0));
const productTableColumns = [
  { id: "name", label: "اسم البضاعة" }, { id: "category", label: "التصنيف" },
  { id: "purchasePrice", label: "رأس المال / سعر الشراء" }, { id: "salePrice", label: "سعر البيع للعميل" },
  { id: "profit", label: "الربح" },
  { id: "totalCapital", label: "إجمالي رأس المال" },
  { id: "totalSaleValue", label: "إجمالي قيمة البيع" },
  { id: "totalExpectedProfit", label: "إجمالي الربح المتوقع" },
  { id: "quantity", label: "الكمية الحالية" }, { id: "unitName", label: "وحدة القياس" },
  { id: "minStock", label: "الحد الأدنى للتنبيه" }, { id: "barcode", label: "الباركود / رقم الصنف" },
  { id: "location", label: "موقع البضاعة" },
  { id: "supplierName", label: "اسم المورد" }, { id: "supplierPhone", label: "هاتف المورد" },
] as const;
type ProductColumnId = typeof productTableColumns[number]["id"];
type ProductColumnSettings = { order: ProductColumnId[]; visible: ProductColumnId[]; panelOpen: boolean };
const productColumnIds = productTableColumns.map(column => column.id);
const productColumnLabel = (id: ProductColumnId) => productTableColumns.find(column => column.id === id)!.label;
const defaultProductColumns = (): ProductColumnSettings => ({ order: [...productColumnIds], visible: [...productColumnIds], panelOpen: false });
const readProductColumns = (key: string): ProductColumnSettings => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return defaultProductColumns();
    const valid = (id: unknown): id is ProductColumnId => typeof id === "string" && productColumnIds.includes(id as ProductColumnId);
    const order = Array.isArray(saved.order) ? [...new Set<ProductColumnId>(saved.order.filter(valid))] : [];
    const visible = Array.isArray(saved.visible) ? [...new Set<ProductColumnId>(saved.visible.filter(valid))] : [...productColumnIds];
    // Introduce new columns beside their defaults while preserving saved visibility and order.
    productColumnIds.forEach((id, index) => {
      if (order.includes(id)) return;
      const previousIndex = index > 0 ? order.indexOf(productColumnIds[index - 1]) : -1;
      order.splice(previousIndex < 0 ? order.length : previousIndex + 1, 0, id);
      if (visible.length && !visible.includes(id)) visible.push(id);
    });
    return { order: [...order, ...productColumnIds.filter(id => !order.includes(id))], visible: visible.length ? visible : [...productColumnIds], panelOpen: saved.panelOpen === true };
  } catch { return defaultProductColumns(); }
};
type ProductSortRule = { key: "none" | ProductColumnId; direction: "asc" | "desc"; show: boolean };
const defaultProductSort = (): ProductSortRule[] => [{ key: "name", direction: "asc", show: false }];
const readProductSort = (key: string): { rules: ProductSortRule[]; panelOpen: boolean } => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved || !Array.isArray(saved.rules)) return { rules: defaultProductSort(), panelOpen: true };
    const rules = saved.rules.filter((rule: unknown): rule is ProductSortRule => {
      if (!rule || typeof rule !== "object") return false;
      const candidate = rule as Partial<ProductSortRule>;
      return (candidate.key === "none" || productColumnIds.includes(candidate.key as ProductColumnId)) && (candidate.direction === "asc" || candidate.direction === "desc") && typeof candidate.show === "boolean";
    });
    return { rules, panelOpen: typeof saved.panelOpen === "boolean" ? saved.panelOpen : true };
  } catch { return { rules: defaultProductSort(), panelOpen: true }; }
};
const productSortValue = (product: Product, key: ProductColumnId): string | number => {
  const purchase = Number(product.purchasePrice) || 0, sale = Number(product.salePrice) || 0, quantity = Number(product.quantity) || 0;
  switch (key) {
    case "purchasePrice": return purchase;
    case "salePrice": return sale;
    case "profit": return sale - purchase;
    case "totalCapital": return purchase * quantity;
    case "totalSaleValue": return sale * quantity;
    case "totalExpectedProfit": return (sale - purchase) * quantity;
    case "quantity": return quantity;
    case "minStock": return Number(product.minStock ?? 5) || 0;
    case "category": return product.category.trim() || "بدون تصنيف";
    case "unitName": return product.unitName?.trim() || "قطعة";
    default: return String(product[key] || "").trim();
  }
};
const productTextLines = (value?: string) => {
  const words = (value || "—").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 4) lines.push(words.slice(i, i + 4).join(" "));
  return lines.map((line, index) => <span key={index} className="block leading-5 whitespace-nowrap">{line}</span>);
};
const getProductImages = (product?: Product | null): string[] => Array.from(new Set([
  product?.imageUrl,
  ...(Array.isArray(product?.imageUrls) ? product.imageUrls : []),
].filter((url): url is string => typeof url === "string" && url.trim().length > 0).map(url => url.trim())));
const getFormImages = (form: ProductForm): string[] => Array.from(new Set([
  form.imageUrl,
  ...form.imageUrls,
].filter(url => typeof url === "string" && url.trim().length > 0).map(url => url.trim())));

const movementLabels: Record<ProductStockMovementType, string> = {
  opening: "رصيد افتتاحي",
  restock: "توريد / شراء",
  sale: "بيع من فاتورة",
  return: "مرتجع إلى المخزن",
  damaged: "تالف / مفقود",
  adjustment: "تسوية مخزون",
};

function ProductsViewContent({
  products: rawProducts, invoices: rawInvoices = [], customers: rawCustomers = [], settings, addProduct, updateProduct, deleteProduct,
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
  const columnSettingsKey = currentUser?.uid ? `acc_u_${currentUser.uid}_product_table_columns` : "acc_guest_product_table_columns";
  const [columnSettings, setColumnSettings] = useState(() => ({ key: columnSettingsKey, ...readProductColumns(columnSettingsKey) }));
  const draggedColumnRef = useRef<ProductColumnId | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<ProductColumnId | null>(null);
  useEffect(() => {
    setColumnSettings({ key: columnSettingsKey, ...readProductColumns(columnSettingsKey) });
    draggedColumnRef.current = null;
    setDraggedColumnId(null);
  }, [columnSettingsKey]);
  useEffect(() => {
    if (columnSettings.key !== columnSettingsKey) return;
    const { order, visible, panelOpen } = columnSettings;
    try { localStorage.setItem(columnSettingsKey, JSON.stringify({ order, visible, panelOpen })); } catch {}
  }, [columnSettings, columnSettingsKey]);
  const moveProductColumn = useCallback((source: ProductColumnId, target: ProductColumnId) => {
    setColumnSettings(old => {
      if (source === target) return old;
      const order = [...old.order];
      order.splice(order.indexOf(source), 1);
      order.splice(old.order.indexOf(target), 0, source);
      return { ...old, order };
    });
  }, []);
  useEffect(() => {
    const stop = () => { draggedColumnRef.current = null; setDraggedColumnId(null); };
    const move = (event: PointerEvent) => {
      const source = draggedColumnRef.current;
      if (!source || event.pointerType === "mouse") return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-product-column-id]")?.dataset.productColumnId;
      if (target && productColumnIds.includes(target as ProductColumnId)) moveProductColumn(source, target as ProductColumnId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [moveProductColumn]);
  const visibleProductColumns = columnSettings.order.filter(id => columnSettings.visible.includes(id));
  const sortSettingsKey = currentUser?.uid ? `acc_u_${currentUser.uid}_product_table_sort` : "acc_guest_product_table_sort";
  const [sortSettings, setSortSettings] = useState(() => ({ key: sortSettingsKey, ...readProductSort(sortSettingsKey) }));
  const [openSortMenu, setOpenSortMenu] = useState<string | null>(null);
  useEffect(() => {
    setSortSettings({ key: sortSettingsKey, ...readProductSort(sortSettingsKey) });
    setOpenSortMenu(null);
  }, [sortSettingsKey]);
  useEffect(() => {
    if (sortSettings.key !== sortSettingsKey) return;
    try { localStorage.setItem(sortSettingsKey, JSON.stringify({ rules: sortSettings.rules, panelOpen: sortSettings.panelOpen })); } catch {}
  }, [sortSettings, sortSettingsKey]);
  const updateProductSort = (index: number, patch: Partial<ProductSortRule>) => setSortSettings(old => ({ ...old, rules: old.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) }));
  const activeProductSort = sortSettings.rules.filter((rule): rule is ProductSortRule & { key: ProductColumnId } => rule.key !== "none");
  const shownProductSort = activeProductSort.filter(rule => rule.show);
  const lastShownProductSort = activeProductSort.reduce((last, rule, index) => rule.show ? index : last, -1);
  const productSortGroup = (product: Product) => JSON.stringify(activeProductSort.slice(0, lastShownProductSort + 1).map(rule => productSortValue(product, rule.key)));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "favorites" | "recent" | "low">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [minimumSalePrice, setMinimumSalePrice] = useState("");
  const [maximumSalePrice, setMaximumSalePrice] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("");
  const [maximumQuantity, setMaximumQuantity] = useState("");
  const [stockStatus, setStockStatus] = useState<"all" | "available" | "low" | "out">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [formError, setFormError] = useState("");
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [detailsTab, setDetailsTab] = useState<"overview" | "prices" | "stock" | "invoices">("overview");
  const [priceDeleteEntryId, setPriceDeleteEntryId] = useState<string | null>(null);
  const priceLongPressTimer = useRef<number | null>(null);
  const suppressPriceDeleteDismissClick = useRef(false);
  const startPriceLongPress = (entryId: string) => {
    if (priceLongPressTimer.current !== null) window.clearTimeout(priceLongPressTimer.current);
    priceLongPressTimer.current = window.setTimeout(() => {
      setPriceDeleteEntryId(entryId);
      suppressPriceDeleteDismissClick.current = true;
      priceLongPressTimer.current = null;
    }, 600);
  };
  const cancelPriceLongPress = () => {
    if (priceLongPressTimer.current !== null) {
      window.clearTimeout(priceLongPressTimer.current);
      priceLongPressTimer.current = null;
    }
  };
  const [detailsImageIndex, setDetailsImageIndex] = useState(0);
  const imageTouchStartX = useRef<number | null>(null);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [movementType, setMovementType] = useState<"restock" | "return" | "damaged" | "adjustment">("restock");
  const [movementQty, setMovementQty] = useState("1");
  const [movementNote, setMovementNote] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [expandedCategoryPaths, setExpandedCategoryPaths] = useState<string[]>([]);
  type ProductCategoryNode = { id: string; path: string; parentPath: string; name: string; order: number };
  const categoryStorageKey = currentUser?.uid ? `acc_u_${currentUser.uid}_product_categories` : "acc_guest_product_categories";
  const [categoryNodes, setCategoryNodes] = useState<ProductCategoryNode[]>(() => { try { return JSON.parse(localStorage.getItem(categoryStorageKey) || "[]"); } catch { return []; } });
  const initialEmptyCategoryPaths = categoryNodes.filter(node => !products.some(product => !product.isDeleted && (product.category === node.path || product.category.startsWith(node.path + " / ")))).map(node => node.path);
  const initialNestedCategoryPaths = Array.from(new Set([
    ...categoryNodes.map(node => node.path),
    ...products.filter(product => !product.isDeleted).map(product => product.category || "")
  ])).flatMap(path => {
    const parts = path.split(" / ").filter(Boolean);
    return parts.slice(1).map((_part, index) => parts.slice(0, index + 2).join(" / "));
  });
  const initialCollapsedCategoryPaths = Array.from(new Set([...initialEmptyCategoryPaths, ...initialNestedCategoryPaths]));
  const [collapsedProductCategoryPaths, setCollapsedProductCategoryPaths] = useState<string[]>(() => initialCollapsedCategoryPaths);
  const initializedEmptyProductCategories = useRef(new Set(initialEmptyCategoryPaths));
  const initializedProductCategoryPaths = useRef(new Set(initialNestedCategoryPaths));
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("");
  const [categorySyncError, setCategorySyncError] = useState("");
  useEffect(() => {
    try { setCategoryNodes(JSON.parse(localStorage.getItem(categoryStorageKey) || "[]")); } catch { setCategoryNodes([]); }
    if (!currentUser?.uid) return;
    return onSnapshot(collection(db, "users", currentUser.uid, "productCategories"), snapshot => {
      const remote = snapshot.docs.map(item => ({ id: item.id, ...(item.data() as Omit<ProductCategoryNode, "id">) })).filter(item => typeof item.path === "string" && item.path.trim());
      setCategoryNodes(remote.sort((a,b) => a.path.localeCompare(b.path, "ar", { numeric: true })));
      try { localStorage.setItem(categoryStorageKey, JSON.stringify(remote)); } catch {}
      setCategorySyncError("");
    }, error => { console.error("Could not sync product categories:", error); setCategorySyncError("تعذر مزامنة التصنيفات؛ يمكنك متابعة العمل محلياً."); });
  }, [categoryStorageKey, currentUser?.uid]);
  useEffect(() => { try { localStorage.setItem(categoryStorageKey, JSON.stringify(categoryNodes)); } catch {} }, [categoryNodes, categoryStorageKey]);
  const [actionProduct, setActionProduct] = useState<Product | null>(null);
  const [actionMode, setActionMode] = useState<"move" | "copy" | null>(null);
  const [targetCategory, setTargetCategory] = useState("");
  const [openCategoryMenuPath, setOpenCategoryMenuPath] = useState<string | null>(null);
  const [categoryTransfer, setCategoryTransfer] = useState<{ path: string; mode: "move" | "copy" } | null>(null);
  const [categoryTransferTarget, setCategoryTransferTarget] = useState("");
  const [openProductMenuId, setOpenProductMenuId] = useState<string | null>(null);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showPriceLabels, setShowPriceLabels] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [aiImportText, setAiImportText] = useState("");
  const [aiImportItems, setAiImportItems] = useState<AIParsedProduct[]>([]);
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [aiImportError, setAiImportError] = useState("");
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
  useEffect(() => {
    const knownPaths = [
      ...categoryNodes.map(node => node.path),
      ...activeProducts.map(product => product.category || "")
    ];
    const nestedPaths = Array.from(new Set(knownPaths)).flatMap(path => {
      const parts = path.split(" / ").filter(Boolean);
      return parts.slice(1).map((_part, index) => parts.slice(0, index + 2).join(" / "));
    });
    const newlyDiscoveredNestedPaths = nestedPaths.filter(path => !initializedProductCategoryPaths.current.has(path));
    newlyDiscoveredNestedPaths.forEach(path => initializedProductCategoryPaths.current.add(path));

    const emptyPaths = categoryNodes.filter(node => !activeProducts.some(product => product.category === node.path || product.category.startsWith(node.path + " / "))).map(node => node.path).filter(path => !initializedEmptyProductCategories.current.has(path));
    emptyPaths.forEach(path => initializedEmptyProductCategories.current.add(path));
    const pathsToCollapse = Array.from(new Set([...newlyDiscoveredNestedPaths, ...emptyPaths]));
    if (pathsToCollapse.length) {
      setCollapsedProductCategoryPaths(current => Array.from(new Set([...current, ...pathsToCollapse])));
    }
  }, [categoryNodes, activeProducts]);

  const trashedProducts = useMemo(() => products.filter(p => p.isDeleted), [products]);
  const legacyCategories = useMemo(() => Array.from(new Set(activeProducts.map(p => p.category).filter(Boolean))).filter(path => !categoryNodes.some(node => node.path === path)), [activeProducts, categoryNodes]);
  const categories = useMemo(() => ["all", ...Array.from(new Set([...categoryNodes.map(node => node.path), ...legacyCategories]))], [categoryNodes, legacyCategories]);
  const categoryDepth = (path: string) => path.split(" / ").filter(Boolean).length;
  const categoryChildren = (parentPath: string) => categoryNodes.filter(node => node.parentPath === parentPath).sort((a,b) => a.order - b.order || a.name.localeCompare(b.name, "ar", { numeric: true }));
  const categoryLabel = (path: string) => path.split(" / ").filter(Boolean).map((name, index) => `${"— ".repeat(index)}${name}`).join(" / ");
  const allCategoryPaths = useMemo(() => {
    const paths = new Set<string>();
    [...categoryNodes.map(node => node.path), ...activeProducts.map(product => product.category || "بدون تصنيف")].forEach(path => {
      const parts = path.split(" / ").filter(Boolean);
      for (let index = 0; index < parts.length; index++) paths.add(parts.slice(0, index + 1).join(" / "));
    });
    return Array.from(paths);
  }, [categoryNodes, activeProducts]);
  const categoryNumber = (path: string) => {
    const parts = path.split(" / ").filter(Boolean);
    let parent = "";
    const numbers = parts.map((_part, index) => {
      const currentPath = parts.slice(0, index + 1).join(" / ");
      const siblings = allCategoryPaths.filter(candidate => {
        const split = candidate.lastIndexOf(" / ");
        return (split < 0 ? "" : candidate.slice(0, split)) === parent;
      }).sort((left, right) => {
        const leftNode = categoryNodes.find(node => node.path === left);
        const rightNode = categoryNodes.find(node => node.path === right);
        if (leftNode && rightNode && leftNode.order !== rightNode.order) return leftNode.order - rightNode.order;
        if (leftNode && !rightNode) return -1;
        if (rightNode && !leftNode) return 1;
        return left.split(" / ").slice(-1)[0].localeCompare(right.split(" / ").slice(-1)[0], "ar", { numeric: true });
      });
      parent = currentPath;
      return String(Math.max(1, siblings.indexOf(currentPath) + 1));
    });
    return numbers.join(".");
  };
  const categoryChildrenPaths = (parentPath: string) => allCategoryPaths.filter(path => path.includes(" / ") ? path.slice(0, path.lastIndexOf(" / ")) === parentPath : parentPath === "");
  const compareCategoryPaths = (left: string, right: string) => {
    const leftParts = categoryNumber(left).split(".").map(Number);
    const rightParts = categoryNumber(right).split(".").map(Number);
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
      const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
      if (difference) return difference;
    }
    return 0;
  };
  const managerCategoryPaths = useMemo(() => allCategoryPaths.filter(path => path && path !== "بدون تصنيف").sort(compareCategoryPaths), [allCategoryPaths, categoryNodes]);
  const managerVisiblePaths = useMemo(() => {
    const query = categorySearch.trim().toLocaleLowerCase();
    const matching = query ? managerCategoryPaths.filter(path =>
      path.toLocaleLowerCase().includes(query) ||
      activeProducts.some(product => product.category === path && product.name.toLocaleLowerCase().includes(query))
    ) : managerCategoryPaths;
    const relevant = new Set<string>();
    matching.forEach(path => {
      const parts = path.split(" / ");
      for (let index = 0; index < parts.length; index++) relevant.add(parts.slice(0, index + 1).join(" / "));
    });
    return managerCategoryPaths.filter(path => {
      if (query && !relevant.has(path)) return false;
      if (query) return true;
      const parts = path.split(" / ");
      for (let index = 1; index < parts.length; index++) {
        if (!expandedCategoryPaths.includes(parts.slice(0, index).join(" / "))) return false;
      }
      return true;
    });
  }, [managerCategoryPaths, categorySearch, activeProducts, expandedCategoryPaths]);
  const toggleCategoryExpanded = (path: string) => setExpandedCategoryPaths(current =>
    current.includes(path) ? current.filter(item => item !== path) : [...current, path]
  );
  const productsAtCategory = (path: string) => activeProducts.filter(product => product.category === path);
  useEffect(() => {
    if (!showCategoryManager) return;
    setExpandedCategoryPaths(current => current.length ? current : managerCategoryPaths.filter(path => !path.includes(" / ")));
  }, [showCategoryManager, managerCategoryPaths]);

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
      const searchable = [p.name, p.category, p.barcode, p.description, p.notes, p.supplierName, p.supplierPhone, p.location]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      const matchesQuery = !q || searchable.includes(q);
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory || p.category.startsWith(`${selectedCategory} / `);
      const quantity = Number(p.quantity) || 0;
      const salePrice = Number(p.salePrice) || 0;
      const matchesQuick = quickFilter === "all"
        || (quickFilter === "favorites" && Boolean(p.isFavorite))
        || (quickFilter === "recent" && Boolean(p.lastViewedAt))
        || (quickFilter === "low" && quantity <= (Number(p.minStock ?? 5) || 0));
      const matchesSupplier = !supplierFilter || (p.supplierName || "").toLocaleLowerCase().includes(supplierFilter.trim().toLocaleLowerCase());
      const matchesMinimumPrice = !minimumSalePrice || salePrice >= Number(minimumSalePrice);
      const matchesMaximumPrice = !maximumSalePrice || salePrice <= Number(maximumSalePrice);
      const matchesMinimumQuantity = !minimumQuantity || quantity >= Number(minimumQuantity);
      const matchesMaximumQuantity = !maximumQuantity || quantity <= Number(maximumQuantity);
      const matchesStockStatus = stockStatus === "all"
        || (stockStatus === "available" && quantity > 0)
        || (stockStatus === "low" && quantity > 0 && quantity <= (Number(p.minStock ?? 5) || 0))
        || (stockStatus === "out" && quantity <= 0);
      return matchesQuery && matchesCategory && matchesQuick && matchesSupplier && matchesMinimumPrice && matchesMaximumPrice && matchesMinimumQuantity && matchesMaximumQuantity && matchesStockStatus;
    }).sort((a, b) => {
      const categoryOrder = compareCategoryPaths(a.category || "بدون تصنيف", b.category || "بدون تصنيف");
      if (categoryOrder !== 0) return categoryOrder;
      for (const rule of activeProductSort) {
        const left = productSortValue(a, rule.key), right = productSortValue(b, rule.key);
        const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ar", { numeric: true });
        if (compared !== 0) return rule.direction === "asc" ? compared : -compared;
      }
      if (quickFilter === "recent") return (b.lastViewedAt || "").localeCompare(a.lastViewedAt || "");
      if (quickFilter === "favorites") return Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) || a.name.localeCompare(b.name, "ar");
      return a.name.localeCompare(b.name, "ar");
    });
  }, [activeProducts, searchQuery, selectedCategory, quickFilter, supplierFilter, minimumSalePrice, maximumSalePrice, minimumQuantity, maximumQuantity, stockStatus, sortSettings.rules, allCategoryPaths, categoryNodes]);

  const emptyCategoryPathsByIndex = useMemo(() => {
    const byIndex = new Map<number, ProductCategoryNode[]>();
    categoryNodes.filter(node => !activeProducts.some(product => product.category === node.path || product.category.startsWith(`${node.path} / `)))
      .sort((left, right) => compareCategoryPaths(left.path, right.path))
      .forEach(node => {
        const index = filteredProducts.findIndex(product => compareCategoryPaths(product.category || "بدون تصنيف", node.path) >= 0);
        const insertionIndex = index < 0 ? filteredProducts.length : index;
        byIndex.set(insertionIndex, [...(byIndex.get(insertionIndex) || []), node]);
      });
    return byIndex;
  }, [categoryNodes, activeProducts, filteredProducts, allCategoryPaths]);

  const setField = <K extends keyof ProductForm,>(key: K, value: ProductForm[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  const parseAiImport = async () => {
    if (!aiImportText.trim()) { setAiImportError("اكتب تفاصيل البضاعة أولاً."); return; }
    setIsParsingAi(true); setAiImportError(""); setAiImportItems([]);
    try {
      const parsed = await parseProductsFromTextServer(aiImportText.trim());
      if (!parsed.length) { setAiImportError("لم أستطع استخراج أصناف واضحة. أضف أسماء البضاعة أو الأسعار ثم حاول مرة أخرى."); return; }
      setAiImportItems(parsed.map((item: any) => ({
        name: String(item.name || "").trim(), category: String(item.category || "غير مصنف").trim() || "غير مصنف",
        quantity: Math.max(0, Number(item.quantity) || 0), unitName: String(item.unitName || "قطعة").trim() || "قطعة",
        purchasePrice: Math.max(0, Number(item.purchasePrice) || 0), salePrice: Math.max(0, Number(item.salePrice) || 0),
        supplierName: item.supplierName ? String(item.supplierName).trim() : undefined,
        supplierPhone: item.supplierPhone ? String(item.supplierPhone).trim() : undefined,
        barcode: item.barcode ? String(item.barcode).trim() : undefined,
        description: item.description ? String(item.description).trim() : undefined,
        notes: item.notes ? String(item.notes).trim() : undefined, minStock: Math.max(0, Number(item.minStock) || 0),
      })).filter((item: AIParsedProduct) => item.name));
    } catch (error: any) {
      setAiImportError(error?.message || "تعذر تحليل النص بالذكاء الاصطناعي. تحقق من الاتصال وإعدادات الخدمة.");
    } finally { setIsParsingAi(false); }
  };

  const saveAiImportedProducts = () => {
    const validItems = aiImportItems.filter(item => item.name.trim() && item.category.trim());
    if (!validItems.length) { setAiImportError("لا توجد أصناف صالحة للحفظ."); return; }
    const createdAt = nowIso();
    validItems.forEach(item => {
      const purchasePrice = Math.max(0, Number(item.purchasePrice) || 0);
      const salePrice = Math.max(0, Number(item.salePrice) || 0);
      const quantity = Math.max(0, Number(item.quantity) || 0);
      addProduct({
        name: item.name.trim(), category: item.category.trim(), quantity,
        unitName: item.unitName.trim() || "قطعة", purchasePrice, salePrice,
        supplierName: item.supplierName || undefined, supplierPhone: item.supplierPhone || undefined,
        barcode: item.barcode || undefined, description: item.description || undefined,
        notes: item.notes || undefined, minStock: Math.max(0, Number(item.minStock) || 0),
        isFavorite: false,
        priceHistory: [{ id: priceId(), changedAt: createdAt, purchasePrice, salePrice, supplierName: item.supplierName, note: "تم تسجيل الصنف عبر الاستيراد الذكي من النص" }],
        stockMovements: quantity > 0 ? [{ id: movementId(), type: "opening", quantity, createdAt, note: "الرصيد الافتتاحي من الاستيراد الذكي", unitCost: purchasePrice }] : [],
      });
    });
    setShowAiImport(false); setAiImportText(""); setAiImportItems([]); setAiImportError("");
    alert(`تمت إضافة ${validItems.length} صنفاً إلى مستودع البضائع.`);
  };

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
      imageUrl: product.imageUrl || product.imageUrls?.[0] || "",
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : [],
      description: product.description || "",
      notes: product.notes || "",
      supplierName: product.supplierName || "",
      supplierPhone: product.supplierPhone || "",
      location: product.location || "",
      minStock: product.minStock == null ? "5" : String(product.minStock),
      unitName: product.unitName || "قطعة",
    });
    setFormError("");
    setIsFormOpen(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = event.currentTarget.files ? Array.from(event.currentTarget.files) as File[] : [];
    if (files.length === 0) return;
    const invalidType = files.find(file => !file.type.startsWith("image/"));
    if (invalidType) {
      setFormError("توجد ملفات ليست صوراً. اختر ملفات صور فقط.");
      event.target.value = "";
      return;
    }
    const oversized = files.find(file => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setFormError("إحدى الصور أكبر من 8 ميغابايت. اختر صوراً أصغر.");
      event.target.value = "";
      return;
    }
    if (!currentUser?.uid) {
      setFormError("حتى تُحفظ الصور وتظهر على أجهزتك الأخرى، سجّل الدخول أولاً. ويمكنك وضع رابط صورة أدناه.");
      event.target.value = "";
      return;
    }
    setIsSavingImage(true);
    setFormError("");
    try {
      const uploadedUrls: string[] = [];
      for (const [index, file] of files.entries()) {
        uploadedUrls.push(await uploadUserFile(currentUser.uid, "products", `${index}_${file.name}`, file));
      }
      setForm(current => {
        const merged = Array.from(new Set([...getFormImages(current), ...uploadedUrls]));
        return { ...current, imageUrl: current.imageUrl.trim() || uploadedUrls[0] || "", imageUrls: merged };
      });
    } catch (error) {
      console.error("Product image upload failed:", error);
      setFormError("تعذر رفع إحدى الصور. تحقق من اتصال الإنترنت وصلاحيات التخزين ثم أعد المحاولة.");
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
      imageUrl: getFormImages(form)[0] || undefined,
      imageUrls: getFormImages(form).length ? getFormImages(form) : undefined,
      description: form.description.trim() || undefined,
      notes: form.notes.trim() || undefined,
      supplierName: form.supplierName.trim() || undefined,
      supplierPhone: form.supplierPhone.trim() || undefined,
      location: form.location.trim() || undefined,
      minStock: Number(form.minStock) || 0,
      unitName: form.unitName.trim() || "قطعة",
    };

    if (editingProduct) {
      const quantityDelta = common.quantity - (Number(editingProduct.quantity) || 0);
      const stockMovements: ProductStockMovement[] = [...(editingProduct.stockMovements || [])];
      if (quantityDelta !== 0) {
        stockMovements.unshift({
          id: movementId(), type: "adjustment", quantity: quantityDelta,
          createdAt: nowIso(), note: "تسوية كمية من نموذج تعديل البضاعة",
        });
      }
      updateProduct({ ...editingProduct, ...common, stockMovements });
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
  const openDetails = (product: Product, tab: "overview" | "prices" | "stock" | "invoices" = "overview") => {
    const viewed = { ...product, lastViewedAt: nowIso() };
    updateProduct(viewed);
    setDetailsImageIndex(0);
    setDetailsTab(tab);
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

  const persistCategoryNode = async (node: ProductCategoryNode) => {
    setCategorySyncError("");
    if (!currentUser?.uid) { setCategoryNodes(current => current.some(item => item.id === node.id) ? current.map(item => item.id === node.id ? node : item) : [...current, node]); return; }
    try { await setDoc(doc(db, "users", currentUser.uid, "productCategories", node.id), { path: node.path, parentPath: node.parentPath, name: node.name, order: node.order }); }
    catch (error) { console.error("Could not save product category:", error); setCategorySyncError("تعذر حفظ التصنيف على السحابة. تحقق من الاتصال ثم أعد المحاولة."); }
  };
  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const parentPath = newCategoryParent;
    const path = parentPath ? `${parentPath} / ${name}` : name;
    if (categories.includes(path)) { setCategorySyncError("هذا التصنيف موجود بالفعل في هذا المسار."); return; }
    const node: ProductCategoryNode = { id: `cat-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, path, parentPath, name, order: categoryChildren(parentPath).length };
    await persistCategoryNode(node);
    setExpandedCategoryPaths(current => Array.from(new Set([...current, ...parentPath.split(" / ").filter(Boolean).map((_part, index, parts) => parts.slice(0, index + 1).join(" / ")), path])));
    setCategorySearch("");
    setNewCategoryName("");
    setCategoryFormOpen(false);
  };
  const addChildCategory = (parentPath: string) => {
    setNewCategoryParent(parentPath);
    setNewCategoryName("");
    setCategorySearch("");
    setExpandedCategoryPaths(current => Array.from(new Set([...current, ...parentPath.split(" / ").filter(Boolean).map((_part, index, parts) => parts.slice(0, index + 1).join(" / "))])));
    setCategoryFormOpen(true);
    setOpenCategoryMenuPath(null);
    setShowCategoryManager(true);
  };

  const renameCategory = async (path: string) => {
    const node = categoryNodes.find(item => item.path === path);
    const oldName = path.split(" / ").slice(-1)[0];
    const parentPath = node?.parentPath ?? (path.includes(" / ") ? path.slice(0, path.lastIndexOf(" / ")) : "");
    const nextName = prompt(`اكتب الاسم الجديد للتصنيف "${oldName}":`, oldName)?.trim();
    if (!nextName || nextName === oldName) return;
    const nextPath = parentPath ? `${parentPath} / ${nextName}` : nextName;
    if (categories.includes(nextPath)) { alert("يوجد تصنيف بهذا الاسم في هذا المسار."); return; }
    const affected = categoryNodes.filter(item => item.path === path || item.path.startsWith(`${path} / `));
    const productAffected = activeProducts.filter(product => product.category === path || product.category.startsWith(`${path} / `));
    if (!confirm(`سيُحدّث الاسم والمسار لـ ${affected.length} تصنيف و${productAffected.length} بضاعة. متابعة؟`)) return;
    for (const item of affected) {
      const suffix = item.path.slice(path.length);
      const updatedPath = nextPath + suffix;
      const updatedParent = item.path === path ? parentPath : item.parentPath.startsWith(path) ? nextPath + item.parentPath.slice(path.length) : item.parentPath;
      await persistCategoryNode({ ...item, path: updatedPath, parentPath: updatedParent, name: item.path === path ? nextName : item.name });
    }
    productAffected.forEach(product => { const suffix = product.category.slice(path.length); void updateProduct({ ...product, category: nextPath + suffix }); });
    if (selectedCategory === path || selectedCategory.startsWith(`${path} / `)) setSelectedCategory(nextPath + selectedCategory.slice(path.length));
    setOpenCategoryMenuPath(null);
  };

  const deleteCategory = async (path: string) => {
    const node = categoryNodes.find(item => item.path === path);
    const parent = node?.parentPath ?? (path.includes(" / ") ? path.slice(0, path.lastIndexOf(" / ")) : "");
    const descendants = categoryNodes.filter(item => item.path.startsWith(`${path} / `));
    const members = activeProducts.filter(product => product.category === path || product.category.startsWith(`${path} / `));
    if (!confirm(`حذف "${path.split(" / ").slice(-1)[0]}"؟ ستُنقل البضائع الموجودة مباشرةً إلى التصنيف الأعلى، وتبقى الفروع تحته.`)) return;
    activeProducts.filter(product => product.category === path).forEach(product => { void updateProduct({ ...product, category: parent }); });
    for (const child of descendants) {
      const nextPath = parent ? `${parent}${child.path.slice(path.length)}` : child.path.slice(path.length + 3);
      const updatedParent = child.parentPath === path ? parent : parent ? `${parent}${child.parentPath.slice(path.length)}` : child.parentPath.slice(path.length + 3);
      await persistCategoryNode({ ...child, path: nextPath, parentPath: updatedParent });
    }
    if (node && currentUser?.uid) {
      try { await deleteDoc(doc(db, "users", currentUser.uid, "productCategories", node.id)); }
      catch (error) { console.error(error); setCategorySyncError("تعذر حذف التصنيف من السحابة."); }
    } else if (node) setCategoryNodes(current => current.filter(item => item.id !== node.id));
    if (selectedCategory === path || selectedCategory.startsWith(`${path} / `)) setSelectedCategory(parent || "all");
    setOpenCategoryMenuPath(null);
  };

  const beginCategoryTransfer = (path: string, mode: "move" | "copy") => {
    setOpenCategoryMenuPath(null);
    setCategoryTransfer({ path, mode });
    setCategoryTransferTarget("");
  };

  const commitCategoryTransfer = async () => {
    if (!categoryTransfer) return;
    const { path, mode } = categoryTransfer;
    const destination = categoryTransferTarget.trim();
    if (destination === path || destination.startsWith(`${path} / `)) { alert("لا يمكن نقل التصنيف إلى نفسه أو إلى أحد فروعه."); return; }
    const leaf = path.split(" / ").slice(-1)[0];
    let nextPath = destination ? `${destination} / ${leaf}` : leaf;
    if (mode === "copy") {
      const base = nextPath;
      let copyIndex = 1;
      while (categories.includes(nextPath)) { nextPath = `${base} - نسخة ${copyIndex}`; copyIndex++; }
      const sourceNodes = categoryNodes.filter(node => node.path === path || node.path.startsWith(`${path} / `)).sort((a,b) => categoryDepth(a.path) - categoryDepth(b.path));
      const rootNode = sourceNodes.find(node => node.path === path);
      const nodesToCopy = rootNode ? sourceNodes : [{ id: "", path, parentPath: path.includes(" / ") ? path.slice(0, path.lastIndexOf(" / ")) : "", name: leaf, order: 0 }, ...sourceNodes];
      const pathMap = new Map<string, string>();
      pathMap.set(path, nextPath);
      for (const item of nodesToCopy) {
        const newItemPath = item.path === path ? nextPath : nextPath + item.path.slice(path.length);
        pathMap.set(item.path, newItemPath);
        const newParent = item.path === path ? destination : pathMap.get(item.parentPath) || (item.parentPath.startsWith(path) ? nextPath + item.parentPath.slice(path.length) : item.parentPath);
        await persistCategoryNode({ ...item, id: `cat-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, path: newItemPath, parentPath: newParent, name: item.path === path ? (newItemPath.split(" / ").slice(-1)[0]) : item.name, order: categoryChildren(newParent).length });
      }
      alert("تم نسخ شجرة التصنيف. لم تُنسخ البضائع حتى لا تتكرر كمياتها أو سجلاتها.");
    } else {
      if (nextPath === path) { alert("هذا هو المسار الحالي للتصنيف."); return; }
      if (categories.includes(nextPath)) { alert("يوجد تصنيف بهذا الاسم في الوجهة المحددة."); return; }
      const affectedNodes = categoryNodes.filter(node => node.path === path || node.path.startsWith(`${path} / `)).sort((a,b) => categoryDepth(a.path) - categoryDepth(b.path));
      const affectedProducts = activeProducts.filter(product => product.category === path || product.category.startsWith(`${path} / `));
      if (!confirm(`نقل ${affectedNodes.length || 1} تصنيف و${affectedProducts.length} بضاعة إلى "${nextPath}"؟`)) return;
      if (!affectedNodes.some(item => item.path === path)) {
        await persistCategoryNode({ id: `cat-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, path: nextPath, parentPath: destination, name: leaf, order: categoryChildren(destination).length });
      }
      for (const item of affectedNodes) {
        const updatedPath = nextPath + item.path.slice(path.length);
        const updatedParent = item.path === path ? destination : nextPath + item.parentPath.slice(path.length);
        await persistCategoryNode({ ...item, path: updatedPath, parentPath: updatedParent });
      }
      affectedProducts.forEach(product => { void updateProduct({ ...product, category: nextPath + product.category.slice(path.length) }); });
      if (selectedCategory === path || selectedCategory.startsWith(`${path} / `)) setSelectedCategory(nextPath + selectedCategory.slice(path.length));
      alert("تم نقل التصنيف والبضائع المرتبطة به.");
    }
    setCategoryTransfer(null);
    setCategoryTransferTarget("");
  };

  const categoryRowEvents = (path: string) => ({
    onClick: () => {
      if (suppressNextClick.current) { suppressNextClick.current = false; return; }
      setOpenCategoryMenuPath(null);
    },
    onContextMenu: (event: React.MouseEvent<HTMLTableRowElement>) => {
      event.preventDefault();
      clearLongPress();
      placeMenuAt(event.clientX, event.clientY, 350);
      setOpenCategoryMenuPath(path);
    },
    onTouchStart: (event: React.TouchEvent<HTMLTableRowElement>) => startLongPress(event, 350, "category:" + path, () => setOpenCategoryMenuPath(path)),
    onTouchEnd: clearLongPress,
    onTouchMove: clearLongPress,
    onTouchCancel: clearLongPress,
    title: "إجراءات التصنيف",
  });

  const toggleProductCategory = (path: string) => setCollapsedProductCategoryPaths(current =>
    current.includes(path) ? current.filter(item => item !== path) : [...current, path]
  );
  const isProductCategoryHidden = (path: string, includeSelf: boolean) => {
    if (searchQuery.trim() || selectedCategory !== "all") return false;
    const parts = path.split(" / ").filter(Boolean);
    return parts.some((_part, index) => {
      if (!includeSelf && index === parts.length - 1) return false;
      return collapsedProductCategoryPaths.includes(parts.slice(0, index + 1).join(" / "));
    });
  };

  const handleBarcodeDetected = (code: string) => {
    const normalizedCode = code.trim().toLocaleLowerCase();
    setShowBarcodeScanner(false);
    setSearchQuery(code.trim());
    setSelectedCategory("all");
    setQuickFilter("all");
    const found = activeProducts.find(product => String(product.barcode || "").trim().toLocaleLowerCase() === normalizedCode);
    if (found) openDetails(found);
    else alert(`لم أجد منتجاً برقم الباركود: ${code}. تأكد أن الباركود مسجل في بطاقة المنتج.`);
  };

  const currentDetailsProduct = detailsProduct ? products.find(product => product.id === detailsProduct.id) || detailsProduct : null;
  const priceHistoryRows = (currentDetailsProduct?.priceHistory || []).slice().sort((left, right) => (Date.parse(right.changedAt) || 0) - (Date.parse(left.changedAt) || 0));
  const productSales = currentDetailsProduct ? getProductSalesHistory(currentDetailsProduct, invoices, Array.isArray(rawCustomers) ? rawCustomers : []) : [];
  const salesQuantity = productSales.reduce((sum, row) => sum + row.quantity, 0);
  const salesAmount = productSales.reduce((sum, row) => sum + row.sales, 0);
  const salesCostKnown = productSales.every(row => row.capital !== null);
  const salesCapital = salesCostKnown ? productSales.reduce((sum, row) => sum + (row.capital ?? 0), 0) : null;
  const salesUnits = [...new Set(productSales.map(row => row.unit))];
  const otherStockMovements = (currentDetailsProduct?.stockMovements || []).filter(movement => movement.type !== "sale").slice().sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0));

  return (
    <div className="space-y-5 min-w-0" dir="rtl">
      <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-5 gap-2 sm:gap-3 min-w-0">
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
              <div className="text-xs sm:text-base font-bold text-slate-800 break-words">{money(metric.value)} <span className="text-[10px] font-normal text-slate-500">{settings.currency}</span></div>
            </div>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 sm:p-5 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" /> مستودع البضائع</h2>
            <p className="text-xs text-slate-500 mt-1">جدول بيانات البضاعة والأسعار والمخزون والموردين.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowPriceLabels(true)} className="inline-flex items-center gap-2 px-3 py-2.5 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold"><ScanBarcode className="w-4 h-4" /> طباعة ملصقات الأسعار</button>
            <button type="button" onClick={() => { setShowAiImport(true); setAiImportError(""); setAiImportItems([]); }} className="inline-flex items-center gap-2 px-3 py-2.5 border border-violet-200 bg-violet-50 text-violet-700 rounded-lg text-sm font-semibold"><Sparkles className="w-4 h-4" /> إدخال بالذكاء الاصطناعي</button>
            <button type="button" onClick={() => { setShowCategoryManager(true); setShowTrash(false); }} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-semibold"><Layers className="w-4 h-4" /> إدارة التصنيفات</button>
            <button type="button" onClick={() => { setShowTrash(v => !v); setShowCategoryManager(false); }} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-semibold"><Trash2 className="w-4 h-4" /> المهملات ({trashedProducts.length})</button>
            <button onClick={openAdd} className="inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"><PlusCircle className="w-4 h-4" /> إضافة بضاعة</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="relative lg:col-span-6">
            <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
            <input value={searchQuery} onInput={e => setSearchQuery(e.target.value)} placeholder="ابحث بالاسم أو الباركود أو المورد أو الملاحظات..." className="w-full min-w-0 pr-9 pl-12 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-blue-500" />
            <button type="button" onClick={() => setShowBarcodeScanner(true)} title="البحث بالكاميرا عبر الباركود" aria-label="البحث بالكاميرا عبر الباركود" className="absolute left-2 top-1.5 p-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"><Camera className="w-5 h-5" /></button>
          </div>
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="lg:col-span-3 w-full min-w-0 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <option value="all">كل التصنيفات</option>
            {categories.filter(c => c !== "all").map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
          <select value={quickFilter} onChange={e => setQuickFilter(e.target.value as typeof quickFilter)} className="lg:col-span-3 w-full min-w-0 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <option value="all">كل البضاعة</option>
            <option value="favorites">⭐ المفضلة</option>
            <option value="recent">شوهدت مؤخراً</option>
            <option value="low">مخزون منخفض</option>
          </select>
        </div>
        <div className="flex justify-end"><FilterButton activeCount={[supplierFilter.trim(), minimumSalePrice, maximumSalePrice, minimumQuantity, maximumQuantity, stockStatus !== "all"].filter(Boolean).length} onClick={() => setFiltersOpen(true)} /></div>
        <FilterPanel open={filtersOpen} title="تصفية البضاعة والمخزون" activeCount={[supplierFilter.trim(), minimumSalePrice, maximumSalePrice, minimumQuantity, maximumQuantity, stockStatus !== "all"].filter(Boolean).length} onClose={() => setFiltersOpen(false)} onApply={() => setFiltersOpen(false)} onClear={() => { setSupplierFilter(""); setMinimumSalePrice(""); setMaximumSalePrice(""); setMinimumQuantity(""); setMaximumQuantity(""); setStockStatus("all"); }}>
          <label className="block text-sm font-semibold text-slate-700">المورد<input value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} placeholder="اسم المورد" className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-sm font-semibold text-slate-700">أقل سعر بيع<FormattedNumberInput type="number" min="0" value={minimumSalePrice} onChange={e => setMinimumSalePrice(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label><label className="text-sm font-semibold text-slate-700">أعلى سعر بيع<FormattedNumberInput type="number" min="0" value={maximumSalePrice} onChange={e => setMaximumSalePrice(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label></div>
          <div className="grid grid-cols-2 gap-2"><label className="text-sm font-semibold text-slate-700">أقل كمية<FormattedNumberInput type="number" min="0" value={minimumQuantity} onChange={e => setMinimumQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label><label className="text-sm font-semibold text-slate-700">أعلى كمية<FormattedNumberInput type="number" min="0" value={maximumQuantity} onChange={e => setMaximumQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label></div>
          <label className="block text-sm font-semibold text-slate-700">حالة المخزون<select value={stockStatus} onChange={e => setStockStatus(e.target.value as typeof stockStatus)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"><option value="all">كل الحالات</option><option value="available">متوفر</option><option value="low">مخزون منخفض</option><option value="out">نافد</option></select></label>
        </FilterPanel>
        <p className="text-[11px] text-slate-500 flex items-center gap-1"><ScanBarcode className="w-3.5 h-3.5" /> يمكن استخدام قارئ باركود يكتب الرمز في مربع البحث، أو البحث يدوياً بالرمز المسجل.</p>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-bold text-slate-700">الفرز المتعدد والفواصل الموحّدة</p><p className="mt-1 text-xs text-slate-500">{activeProductSort.length} مستويات فرز فعّالة</p></div>
            <button type="button" onClick={() => { setSortSettings(old => ({ ...old, panelOpen: !old.panelOpen })); setOpenSortMenu(null); }} aria-expanded={sortSettings.panelOpen} aria-controls="product-sort-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><SlidersHorizontal size={17}/><span>تخصيص الفرز</span><ChevronDown size={16} className={`transition-transform duration-200 ${sortSettings.panelOpen ? "rotate-180" : ""}`}/></button>
          </div>
          {sortSettings.panelOpen && <div id="product-sort-options" className="mt-3 space-y-3">
            <p className="text-xs text-slate-500">الفرز يغيّر ترتيب الصفوف فقط ولا يخفي أي بضاعة. كل مستوى يُطبّق عند تساوي المستويات السابقة.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortSettings.rules.map((rule, index) => <div key={index} className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">الفرز {(["الأول", "الثاني", "الثالث", "الرابع"][index] || `رقم ${index + 1}`)}</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rule.show} onChange={event => updateProductSort(index, { show: event.target.checked })} className="h-4 w-4 shrink-0 aspect-square"/> إظهار بالفاصل</label>
                    <button type="button" aria-label={`إلغاء الفرز ${index + 1}`} onClick={() => { setSortSettings(old => ({ ...old, rules: old.rules.filter((_, i) => i !== index) })); setOpenSortMenu(null); }} className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-red-50"><X size={15}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative min-w-0">
                    <button type="button" aria-label={`خاصية الفرز ${index + 1}`} aria-expanded={openSortMenu === `key-${index}`} onClick={() => setOpenSortMenu(openSortMenu === `key-${index}` ? null : `key-${index}`)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-xs flex items-center justify-between gap-1 text-right"><span className="truncate">{rule.key === "none" ? "بدون فرز" : productColumnLabel(rule.key)}</span><ChevronDown size={14}/></button>
                    {openSortMenu === `key-${index}` && <div className="absolute top-full right-0 z-30 mt-1 max-h-60 w-max min-w-full max-w-[85vw] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                      {[{ id: "none" as const, label: "بدون فرز" }, ...productTableColumns].map(option => <button type="button" key={option.id} onClick={() => { updateProductSort(index, { key: option.id }); setOpenSortMenu(null); }} className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-blue-50 ${rule.key === option.id ? "bg-blue-50 font-bold text-blue-700" : ""}`}>{option.label}</button>)}
                    </div>}
                  </div>
                  <div className="relative min-w-0">
                    <button type="button" aria-label={`اتجاه الفرز ${index + 1}`} aria-expanded={openSortMenu === `direction-${index}`} onClick={() => setOpenSortMenu(openSortMenu === `direction-${index}` ? null : `direction-${index}`)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-xs flex items-center justify-between gap-1 text-right"><span>{rule.direction === "asc" ? "تصاعدي ↑" : "تنازلي ↓"}</span><ChevronDown size={14}/></button>
                    {openSortMenu === `direction-${index}` && <div className="absolute top-full right-0 z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{(["asc", "desc"] as const).map(direction => <button type="button" key={direction} onClick={() => { updateProductSort(index, { direction }); setOpenSortMenu(null); }} className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-blue-50 ${rule.direction === direction ? "bg-blue-50 font-bold text-blue-700" : ""}`}>{direction === "asc" ? "تصاعدي ↑" : "تنازلي ↓"}</button>)}</div>}
                  </div>
                </div>
              </div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSortSettings(old => ({ ...old, rules: [...old.rules, { key: "none", direction: "asc", show: false }] }))} className="rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-bold hover:bg-blue-700">+ إضافة فرز</button>
              <button type="button" onClick={() => setSortSettings(old => ({ ...old, rules: old.rules.map(rule => ({ ...rule, show: true })) }))} className="rounded-lg border px-3 py-2 text-xs">إظهار الكل بالفاصل</button>
              <button type="button" onClick={() => setSortSettings(old => ({ ...old, rules: old.rules.map(rule => ({ ...rule, show: false })) }))} className="rounded-lg border px-3 py-2 text-xs">إخفاء الفواصل</button>
              <button type="button" onClick={() => { setSortSettings(old => ({ ...old, rules: defaultProductSort() })); setOpenSortMenu(null); }} className="rounded-lg border px-3 py-2 text-xs flex items-center gap-1"><RotateCcw size={14}/> إعادة ضبط</button>
            </div>
          </div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-700">تخصيص أعمدة الجدول</p>
              <p className="mt-1 text-xs text-slate-500">{columnSettings.visible.length} من {columnSettings.order.length} أعمدة ظاهرة</p>
            </div>
            <button type="button" onClick={() => setColumnSettings(old => ({ ...old, panelOpen: !old.panelOpen }))} aria-expanded={columnSettings.panelOpen} aria-controls="product-column-options" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <SlidersHorizontal size={17}/><span>تخصيص الأعمدة</span>
              <ChevronDown size={16} className={`transition-transform duration-200 ${columnSettings.panelOpen ? "rotate-180" : ""}`}/>
            </button>
          </div>
          {columnSettings.panelOpen && <div id="product-column-options" className="mt-3">
            <p className="mb-2 text-xs text-slate-500">فعّل أو أزل علامة الصح لإظهار العمود أو إخفائه. اسحب مقبض ☷ لترتيب الأعمدة، ويجب إبقاء عمود واحد ظاهر على الأقل.</p>
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2 [touch-action:pan-x]">
              {columnSettings.order.map((id, index) => <div key={id} data-product-column-id={id} onDragOver={event => { event.preventDefault(); const source = draggedColumnRef.current; if (source) moveProductColumn(source, id); }} onDrop={event => { event.preventDefault(); draggedColumnRef.current = null; setDraggedColumnId(null); }} className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${draggedColumnId === id ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-300 bg-[#eef3fa]"}`}>
                <button type="button" draggable aria-label={`اسحب لترتيب عمود ${productColumnLabel(id)}`} onDragStart={event => { draggedColumnRef.current = id; setDraggedColumnId(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }} onDragEnd={() => { draggedColumnRef.current = null; setDraggedColumnId(null); }} onPointerDown={event => { if (event.isPrimary && (event.pointerType === "touch" || event.pointerType === "pen")) { event.preventDefault(); draggedColumnRef.current = id; setDraggedColumnId(id); } }} className="touch-none cursor-grab rounded text-slate-500 active:cursor-grabbing" title="اسحب لترتيب العمود"><GripVertical size={17}/></button>
                <label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-700">
                  <span>{productColumnLabel(id)}</span>
                  <input type="checkbox" checked={columnSettings.visible.includes(id)} disabled={columnSettings.visible.length === 1 && columnSettings.visible.includes(id)} onChange={event => {
                    const checked = event.target.checked;
                    setColumnSettings(old => ({ ...old, visible: checked ? [...old.visible, id] : old.visible.length > 1 ? old.visible.filter(column => column !== id) : old.visible }));
                  }} className="h-4 w-4 shrink-0 aspect-square"/>
                </label>
                <button type="button" aria-label={`تحريك ${productColumnLabel(id)} إلى اليمين`} title="تحريك إلى اليمين" disabled={index === 0} onClick={() => { const target = columnSettings.order[index - 1]; if (target) moveProductColumn(id, target); }} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronRight size={15}/></button>
                <button type="button" aria-label={`تحريك ${productColumnLabel(id)} إلى اليسار`} title="تحريك إلى اليسار" disabled={index === columnSettings.order.length - 1} onClick={() => { const target = columnSettings.order[index + 1]; if (target) moveProductColumn(id, target); }} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronLeft size={15}/></button>
              </div>)}
            </div>
          </div>}
        </div>
        {filteredProducts.length === 0 && (searchQuery.trim() || selectedCategory !== "all" || categoryNodes.length === 0) ? (
          <div className="text-center py-12 text-slate-400 text-sm">لا توجد بضاعة تطابق البحث الحالي.</div>
        ) : (
          <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-400 bg-white shadow-sm">
                  <table aria-label="بيانات البضاعة" className="w-max min-w-full border-collapse text-[10px] sm:text-xs text-center text-slate-800 table-auto">
                    <thead className="bg-[#94acd1] text-slate-950">
                      <tr>
                        {visibleProductColumns.map(id => <th key={id} scope="col" className="border border-slate-400/70 px-1.5 py-2 whitespace-nowrap font-bold text-center">{productColumnLabel(id)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product, index) => {
                        return (
                          <React.Fragment key={product.id}>
                            {!searchQuery.trim() && selectedCategory === "all" && (emptyCategoryPathsByIndex.get(index) || []).map(node => {
                              const depth = categoryDepth(node.path);
                              const tones = ["bg-[#eef4fb] text-slate-950 border-blue-200", "bg-[#eff7f1] text-slate-950 border-emerald-200", "bg-[#fff5ed] text-slate-950 border-orange-200", "bg-[#f5f1fa] text-slate-950 border-violet-200"];
                              const hasChildren = categoryNodes.some(child => child.parentPath === node.path);
                              const isCollapsed = collapsedProductCategoryPaths.includes(node.path);
                              const showEmptyMessage = !hasChildren && !isCollapsed && !isProductCategoryHidden(node.path, false);
                              return <React.Fragment key={"empty-category-" + node.id}>
                                <tr data-product-category-row="empty" style={{ display: isProductCategoryHidden(node.path, false) ? "none" : undefined }} className="cursor-pointer" {...categoryRowEvents(node.path)}>
                                  <td colSpan={visibleProductColumns.length} className={"border px-2 py-2 text-center font-extrabold " + tones[(depth - 1) % tones.length]}>
                                    <div className="grid grid-cols-[34px_64px_1fr] items-center gap-2">
                                      <button type="button" aria-label={isCollapsed ? "فتح التصنيف" : "طي التصنيف"} onClick={event => { event.stopPropagation(); toggleProductCategory(node.path); }} className="mx-auto grid h-7 w-7 place-items-center rounded-md bg-white/70">
                                        <ChevronDown className={"h-4 w-4 transition-transform " + (isCollapsed ? "rotate-90" : "")}/>
                                      </button>
                                      <span className="border-l border-black/15 py-1" dir="ltr">{categoryNumber(node.path)}</span>
                                      <span className="flex items-center gap-2" style={{ paddingRight: (Math.min(depth - 1, 6) * 14) + "px" }}>{node.name}</span>
                                    </div>
                                  </td>
                                </tr>
                                {showEmptyMessage && <tr data-category-empty-message><td colSpan={visibleProductColumns.length} className="border border-slate-200 bg-white px-4 py-3 text-right text-xs font-medium text-slate-500"><span style={{ paddingRight: (Math.min(depth, 6) * 14) + "px" }}>لا توجد بضاعة داخل هذا الفرع بعد.</span></td></tr>}
                              </React.Fragment>;
                            })}
                            {(() => {
                              const parts = (product.category || "بدون تصنيف").split(" / ").filter(Boolean);
                              const previous = index > 0 ? (filteredProducts[index - 1].category || "بدون تصنيف").split(" / ").filter(Boolean) : [];
                              let shared = 0;
                              while (shared < parts.length && shared < previous.length && parts[shared] === previous[shared]) shared++;
                              return parts.slice(shared).map((name, offset) => {
                                const depth = shared + offset + 1;
                                const path = parts.slice(0, depth).join(" / ");
                                const tones = ["bg-[#eef4fb] text-slate-950 border-blue-200", "bg-[#eff7f1] text-slate-950 border-emerald-200", "bg-[#fff5ed] text-slate-950 border-orange-200", "bg-[#f5f1fa] text-slate-950 border-violet-200"];
                                return <tr key={"category-" + path} data-product-category-row style={{ display: isProductCategoryHidden(path, false) ? "none" : undefined }} className="cursor-pointer" {...categoryRowEvents(path)}><td colSpan={visibleProductColumns.length} className={"border px-2 py-2 text-center font-extrabold " + tones[(depth - 1) % tones.length]}><div className="grid grid-cols-[34px_64px_1fr] items-center gap-2"><button type="button" aria-label={collapsedProductCategoryPaths.includes(path) ? "فتح التصنيف" : "طي التصنيف"} onClick={event => { event.stopPropagation(); toggleProductCategory(path); }} className="mx-auto grid h-7 w-7 place-items-center rounded-md bg-white/70"><ChevronDown className={"h-4 w-4 transition-transform " + (collapsedProductCategoryPaths.includes(path) ? "rotate-90" : "")}/></button><span className="border-l border-black/15 py-1" dir="ltr">{categoryNumber(path)}</span><span className="flex items-center gap-2" style={{ paddingRight: (Math.min(depth - 1, 6) * 14) + "px" }}>{name}<span className="text-[10px] font-medium opacity-60"></span></span></div></td></tr>;
                              });
                            })()}
                            {shownProductSort.length > 0 && (index === 0 || productSortGroup(product) !== productSortGroup(filteredProducts[index - 1])) && <tr style={{ display: isProductCategoryHidden(product.category || "بدون تصنيف", true) ? "none" : undefined }} data-product-sort-group><td colSpan={visibleProductColumns.length} className="border border-slate-300 bg-[#e7eef9] px-2 py-2 text-center font-bold">{shownProductSort.map(rule => { const value = productSortValue(product, rule.key); return `${productColumnLabel(rule.key)}: ${typeof value === "number" ? money(value) : value || "غير مسجل"}`; }).join(" — ")}</td></tr>}
                          <tr
                            style={{ display: isProductCategoryHidden(product.category || "بدون تصنيف", true) ? "none" : undefined }}
                            key={product.id}
                            className={`select-none cursor-pointer transition-colors duration-150 ${pressedItem === `product:${product.id}` ? "bg-blue-100/80 shadow-[inset_0_0_0_2px_rgba(59,130,246,0.65)]" : "hover:bg-blue-50/40"}`}
                            onClick={event => {
                              if (suppressNextClick.current) { suppressNextClick.current = false; return; }
                              if ((event.target as HTMLElement).closest("button")) return;
                              setOpenProductMenuId(null);
                              openDetails(product);
                            }}
                            onContextMenu={event => { event.preventDefault(); placeMenuAt(event.clientX, event.clientY, 360); setOpenProductMenuId(product.id); }}
                            onTouchStart={event => startLongPress(event, 360, `product:${product.id}`, () => { setOpenProductMenuId(product.id); })}
                            onTouchEnd={clearLongPress}
                            onTouchMove={clearLongPress}
                            onTouchCancel={clearLongPress}
                            title="اضغط مطولاً لعرض إجراءات البضاعة"
                          >
                            {visibleProductColumns.map((id, index) => (
                              <td key={id} className={`border border-slate-300 px-1 py-2 text-center align-middle ${["name", "category", "unitName", "supplierName", "location"].includes(id) ? "whitespace-normal" : "whitespace-nowrap"}`}>
                                {id === "name" ? <button type="button" onClick={() => {
                                    if (suppressNextClick.current) { suppressNextClick.current = false; return; }
                                    setOpenProductMenuId(null);
                                    openDetails(product);
                                  }} className="font-bold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`تفاصيل ${product.name}`}>
                                    {productTextLines(product.name)}
                                  </button> :
                                  id === "category" ? productTextLines((product.category || "").split(" / ").filter(Boolean).pop() || "بدون تصنيف") :
                                  id === "purchasePrice" || id === "salePrice" ? <>{money(product[id])} <span className="text-slate-500">{settings.currency}</span></> :
                                  id === "profit" ? <>{money((Number(product.salePrice) || 0) - (Number(product.purchasePrice) || 0))} <span className="text-slate-500">{settings.currency}</span></> :
                                  id === "totalCapital" ? <>{money((Number(product.purchasePrice) || 0) * (Number(product.quantity) || 0))} <span className="text-slate-500">{settings.currency}</span></> :
                                  id === "totalSaleValue" ? <>{money((Number(product.salePrice) || 0) * (Number(product.quantity) || 0))} <span className="text-slate-500">{settings.currency}</span></> :
                                  id === "totalExpectedProfit" ? <>{money(((Number(product.salePrice) || 0) - (Number(product.purchasePrice) || 0)) * (Number(product.quantity) || 0))} <span className="text-slate-500">{settings.currency}</span></> :
                                  id === "location" ? productTextLines(product.location) :
                                  id === "quantity" ? money(product.quantity) :
                                  id === "unitName" ? productTextLines(product.unitName || "قطعة") :
                                  id === "minStock" ? money(product.minStock ?? 5) :
                                  id === "supplierName" ? productTextLines(product.supplierName) :
                                  <bdi dir="ltr">{product[id] || "—"}</bdi>}
                                {index === 0 && <>
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
                                </>}
                              </td>
                            ))}

                          </tr>
                          </React.Fragment>
                        );
                      })}
                      {!searchQuery.trim() && selectedCategory === "all" && (emptyCategoryPathsByIndex.get(filteredProducts.length) || []).map(node => {
                        const depth = categoryDepth(node.path);
                        const tones = ["bg-[#eef4fb] text-slate-950 border-blue-200", "bg-[#eff7f1] text-slate-950 border-emerald-200", "bg-[#fff5ed] text-slate-950 border-orange-200", "bg-[#f5f1fa] text-slate-950 border-violet-200"];
                        const hasChildren = categoryNodes.some(child => child.parentPath === node.path);
                        const isCollapsed = collapsedProductCategoryPaths.includes(node.path);
                        const showEmptyMessage = !hasChildren && !isCollapsed && !isProductCategoryHidden(node.path, false);
                        return <React.Fragment key={"empty-category-" + node.id}>
                          <tr data-product-category-row="empty" style={{ display: isProductCategoryHidden(node.path, false) ? "none" : undefined }} className="cursor-pointer" {...categoryRowEvents(node.path)}>
                            <td colSpan={visibleProductColumns.length} className={"border px-2 py-2 text-center font-extrabold " + tones[(depth - 1) % tones.length]}>
                              <div className="grid grid-cols-[34px_64px_1fr] items-center gap-2">
                                <button type="button" aria-label={isCollapsed ? "فتح التصنيف" : "طي التصنيف"} onClick={event => { event.stopPropagation(); toggleProductCategory(node.path); }} className="mx-auto grid h-7 w-7 place-items-center rounded-md bg-white/70">
                                  <ChevronDown className={"h-4 w-4 transition-transform " + (isCollapsed ? "rotate-90" : "")}/>
                                </button>
                                <span className="border-l border-black/15 py-1" dir="ltr">{categoryNumber(node.path)}</span>
                                <span className="flex items-center gap-2" style={{ paddingRight: (Math.min(depth - 1, 6) * 14) + "px" }}>{node.name}</span>
                              </div>
                            </td>
                          </tr>
                          {showEmptyMessage && <tr data-category-empty-message><td colSpan={visibleProductColumns.length} className="border border-slate-200 bg-white px-4 py-3 text-right text-xs font-medium text-slate-500"><span style={{ paddingRight: (Math.min(depth, 6) * 14) + "px" }}>لا توجد بضاعة داخل هذا الفرع بعد.</span></td></tr>}
                        </React.Fragment>;
                      })}
                    </tbody>
                  </table>
          </div>
        )}
      </section>

      {showCategoryManager && <div className="fixed inset-0 z-[60] bg-slate-100" dir="rtl">
        <section className="mx-auto flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-slate-50">
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] shadow-sm sm:px-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { setShowCategoryManager(false); setCategoryFormOpen(false); setOpenCategoryMenuPath(null); }} aria-label="رجوع" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-5 w-5"/></button>
              <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-extrabold text-slate-900 sm:text-xl">إدارة التصنيفات</h2><p className="mt-0.5 text-xs text-slate-500">رتّب المحلات والرفوف والخانات والبضائع</p></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{managerCategoryPaths.length} تصنيف</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <label className="relative block"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={categorySearch} onChange={event => setCategorySearch(event.target.value)} placeholder="ابحث عن تصنيف أو بضاعة" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-10 ps-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"/></label>
              <button type="button" onClick={() => { setNewCategoryParent(""); setNewCategoryName(""); setCategoryFormOpen(value => !value); setOpenCategoryMenuPath(null); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"><PlusCircle className="h-4 w-4"/> تصنيف رئيسي</button>
            </div>
          </header>

          {categoryFormOpen && <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 p-3 sm:px-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs font-bold text-emerald-900">{newCategoryParent ? "إضافة فرع داخل" : "إضافة تصنيف رئيسي"}</div>
                {newCategoryParent && <div className="mb-1 truncate text-xs text-slate-600">{categoryLabel(newCategoryParent)}</div>}
                <input autoFocus value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void createCategory(); }} placeholder={newCategoryParent ? "اسم التصنيف الفرعي" : "اسم التصنيف الرئيسي"} className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"/>
              </div>
              <div className="flex gap-2 sm:pt-5"><button type="button" onClick={() => void createCategory()} disabled={!newCategoryName.trim()} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">حفظ التصنيف</button><button type="button" onClick={() => { setCategoryFormOpen(false); setNewCategoryName(""); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">إلغاء</button></div>
            </div>
          </div>}

          {categorySyncError && <p role="alert" className="mx-4 mt-3 shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 sm:mx-6">{categorySyncError}</p>}

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-5">
            {managerCategoryPaths.length === 0 ? <div className="mx-auto mt-8 max-w-md rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><Layers className="mx-auto h-10 w-10 text-emerald-600"/><h3 className="mt-3 font-bold text-slate-800">ابدأ بأول تصنيف رئيسي</h3><p className="mt-1 text-sm text-slate-500">مثلاً: محل 1، ثم أضف تحته رفوفاً وخانات.</p><button type="button" onClick={() => { setNewCategoryParent(""); setCategoryFormOpen(true); }} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">+ إضافة تصنيف رئيسي</button></div>
            : managerVisiblePaths.length === 0 ? <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">ما لقيت تصنيفاً أو بضاعة بهذا الاسم.</div>
            : <div className="mx-auto max-w-3xl space-y-1.5">
              <div className="mb-2 hidden grid-cols-[1fr_auto] items-center px-3 text-[11px] font-bold text-slate-400 sm:grid"><span>التصنيف والبضائع التابعة له</span><span>الإجراءات</span></div>
              {managerVisiblePaths.map(path => {
                const depth = categoryDepth(path);
                const children = categoryChildrenPaths(path);
                const directGoods = productsAtCategory(path);
                const totalGoods = activeProducts.filter(product => product.category === path || product.category.startsWith(path + " / ")).length;
                const expanded = Boolean(categorySearch.trim()) || expandedCategoryPaths.includes(path);
                const tones = ["border-blue-200 bg-blue-50 text-blue-950", "border-emerald-200 bg-emerald-50 text-emerald-950", "border-orange-200 bg-orange-50 text-orange-950", "border-violet-200 bg-violet-50 text-violet-950"];
                const visibleGoods = categorySearch.trim() && !path.toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase())
                  ? directGoods.filter(product => product.name.toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase()))
                  : directGoods;
                return <React.Fragment key={path}>
                  <div
                    className={"group flex min-h-[58px] items-center gap-2 rounded-xl border px-2 py-2 shadow-sm transition hover:shadow " + tones[(depth - 1) % tones.length]}
                    style={{ marginRight: Math.min(depth - 1, 5) * 15 }}
                    onClick={() => { if (suppressNextClick.current) { suppressNextClick.current = false; return; } toggleCategoryExpanded(path); }}
                    onContextMenu={event => { event.preventDefault(); placeMenuAt(event.clientX, event.clientY, 360); setOpenCategoryMenuPath(path); }}
                    onTouchStart={event => startLongPress(event, 360, "category-manager:" + path, () => setOpenCategoryMenuPath(path))}
                    onTouchEnd={clearLongPress} onTouchMove={clearLongPress} onTouchCancel={clearLongPress}
                    title="اضغط للفتح أو الطي"
                  >
                    <button type="button" onClick={event => { event.stopPropagation(); toggleCategoryExpanded(path); }} aria-label={expanded ? "طي التصنيف" : "فتح التصنيف"} className="grid h-9 w-8 shrink-0 place-items-center rounded-lg bg-white/70 text-current">
                      <ChevronDown className={"h-4 w-4 transition-transform " + (expanded ? "" : "rotate-90")}/>
                    </button>
                    <span className="min-w-[48px] border-l border-current/15 px-2 text-center text-xs font-extrabold" dir="ltr">{categoryNumber(path)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold">{path.split(" / ").slice(-1)[0]}</div>
                      <div className="mt-0.5 truncate text-[10px] font-medium opacity-65">{depth > 1 ? categoryLabel(path) : "تصنيف رئيسي"}</div>
                    </div>
                    <span className="hidden shrink-0 rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-bold sm:inline-flex">{totalGoods} بضاعة</span>
                    <button type="button" aria-label={"إجراءات " + path.split(" / ").slice(-1)[0]} onClick={event => { event.stopPropagation(); setOpenCategoryMenuPath(path); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/75 text-lg font-bold text-slate-600 hover:bg-white">⋮</button>
                  </div>
                  {expanded && visibleGoods.map(product => <button type="button" key={product.id} onClick={() => openDetails(product)} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-right text-sm text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40" style={{ marginRight: Math.min(depth, 5) * 15, width: "calc(100% - " + (Math.min(depth, 5) * 15) + "px)" }}><Package className="h-4 w-4 shrink-0 text-emerald-700"/><span className="min-w-0 flex-1 truncate">{product.name}</span><span className="shrink-0 text-xs text-slate-500">{money(product.quantity)} {product.unitName || "قطعة"}</span></button>)}
                  {expanded && !directGoods.length && !children.length && <div className="rounded-lg px-4 py-2 text-xs text-slate-400" style={{ marginRight: Math.min(depth, 5) * 15 }}>لا توجد بضاعة داخل هذا الفرع بعد.</div>}
                </React.Fragment>;
              })}
            </div>}
          </main>
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] text-center text-[11px] text-slate-500">اضغط على السهم لفتح الفروع والبضائع · استخدم السهم لفتح الفروع والبضائع · ⋮ لإجراءات التصنيف</footer>
        </section>
      </div>}

      {openCategoryMenuPath && <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" onClick={() => setOpenCategoryMenuPath(null)}>
        <section dir="rtl" role="dialog" aria-modal="true" aria-label="إجراءات التصنيف" onClick={event => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden"/>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><div className="text-xs font-semibold text-slate-500">إجراءات التصنيف</div><div className="mt-1 text-base font-extrabold text-slate-900">{categoryLabel(openCategoryMenuPath)}</div></div>
            <button type="button" aria-label="إغلاق" onClick={() => setOpenCategoryMenuPath(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <button type="button" onClick={() => addChildCategory(openCategoryMenuPath)} className="flex min-h-16 items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 text-right text-sm font-bold text-emerald-900"><PlusCircle className="h-5 w-5 shrink-0 text-emerald-700"/>إضافة تصنيف فرعي</button>
            <button type="button" onClick={() => { const path = openCategoryMenuPath; setOpenCategoryMenuPath(null); setShowCategoryManager(false); openAdd(path); }} className="flex min-h-16 items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 text-right text-sm font-bold text-blue-900"><PackagePlus className="h-5 w-5 shrink-0 text-blue-700"/>إضافة بضاعة</button>
            <button type="button" onClick={() => { const path = openCategoryMenuPath; setOpenCategoryMenuPath(null); void renameCategory(path); }} className="flex min-h-14 items-center gap-2 rounded-2xl border border-slate-200 px-3 text-right text-sm font-semibold text-slate-800 hover:bg-slate-50"><SquarePen className="h-4 w-4 shrink-0"/>إعادة تسمية</button>
            <button type="button" onClick={() => { const path = openCategoryMenuPath; setOpenCategoryMenuPath(null); beginCategoryTransfer(path, "move"); }} className="flex min-h-14 items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 text-right text-sm font-semibold text-amber-900"><Layers className="h-4 w-4 shrink-0"/>نقل التصنيف</button>
            <button type="button" onClick={() => { const path = openCategoryMenuPath; setOpenCategoryMenuPath(null); beginCategoryTransfer(path, "copy"); }} className="flex min-h-14 items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 text-right text-sm font-semibold text-violet-900"><ClipboardList className="h-4 w-4 shrink-0"/>نسخ شجرة التصنيف</button>
            <button type="button" onClick={() => { const path = openCategoryMenuPath; setOpenCategoryMenuPath(null); void deleteCategory(path); }} className="flex min-h-14 items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 text-right text-sm font-semibold text-rose-800"><Trash2 className="h-4 w-4 shrink-0"/>حذف التصنيف</button>
          </div>
          <p className="px-4 pb-4 text-center text-[11px] text-slate-400">اختر الإجراء الذي تريده لهذا التصنيف</p>
        </section>
      </div>}

      {showTrash && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3"><section dir="rtl" className="bg-white w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-bold text-lg">مهملات البضائع ({trashedProducts.length})</h3><button type="button" onClick={() => setShowTrash(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div><p className="text-xs text-slate-500">الحذف هنا مؤقت. الاستعادة تعيد الصنف إلى القائمة، والحذف النهائي لا يمسح الفواتير التاريخية.</p>{trashedProducts.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">المهملات فارغة.</p> : <div className="space-y-2">{trashedProducts.map(product => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3"><div className="flex items-center gap-3 min-w-0">{product.imageUrl ? <img src={product.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg" /> : <Package className="w-8 h-8 text-slate-300" />}<div className="min-w-0"><b>{product.name}</b><p className="text-xs text-slate-500">التصنيف: {product.originalCategory || product.category || "بدون تصنيف"} • حذف: {product.deletedAt ? new Date(product.deletedAt).toLocaleString("ar-IQ") : "غير معروف"}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => restoreProduct(product)} className="px-3 py-2 border rounded-lg text-xs">استعادة</button><button type="button" onClick={() => { if (confirm(`حذف "${product.name}" نهائياً من قائمة البضائع؟ ستبقى تفاصيل الفواتير التاريخية كما هي.`)) deleteProduct(product.id); }} className="px-3 py-2 border border-rose-200 text-rose-700 rounded-lg text-xs">حذف نهائي</button></div></div>)}</div>}{trashedProducts.length > 0 && <button type="button" onClick={() => { if (confirm(`حذف ${trashedProducts.length} صنف نهائياً من قائمة البضائع؟ لا يمكن التراجع عن ذلك.`)) trashedProducts.forEach(p => deleteProduct(p.id)); }} className="w-full py-2.5 border border-rose-200 text-rose-700 rounded-lg text-sm">إفراغ المهملات نهائياً</button>}</section></div>}

      {categoryTransfer && <div className="fixed inset-0 z-[70] bg-slate-950/55 flex items-center justify-center p-3"><section dir="rtl" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">{categoryTransfer.mode === "move" ? "نقل التصنيف" : "نسخ شجرة التصنيف"}</h3><p className="mt-1 text-xs text-slate-500">{categoryLabel(categoryTransfer.path)}</p></div><button type="button" onClick={() => setCategoryTransfer(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
        {categoryTransfer.mode === "copy" && <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900">سينسخ التطبيق بنية التصنيف وفروعه إلى الوجهة فقط. البضائع تبقى في مكانها ولا تتكرر كمياتها أو سجلاتها.</div>}
        {categoryTransfer.mode === "move" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">سيُنقل التصنيف وفروعه والبضائع التابعة له معاً إلى الوجهة المحددة.</div>}
        <label className="block text-sm font-bold text-slate-700">المجلد الأب الجديد<select value={categoryTransferTarget} onChange={event => setCategoryTransferTarget(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm"><option value="">تصنيف رئيسي</option>{categories.filter(path => path !== "all" && path !== categoryTransfer.path && !path.startsWith(categoryTransfer.path + " / ")).map(path => <option key={path} value={path}>{categoryLabel(path)}</option>)}</select></label>
        <div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="text-slate-500">المسار الجديد: </span><b>{categoryTransferTarget ? categoryTransferTarget + " / " : ""}{categoryTransfer.mode === "copy" ? categoryTransfer.path.split(" / ").slice(-1)[0] + " - نسخة" : categoryTransfer.path.split(" / ").slice(-1)[0]}</b></div>
        <div className="flex gap-2"><button type="button" onClick={() => setCategoryTransfer(null)} className="flex-1 rounded-lg border py-2.5 text-sm">إلغاء</button><button type="button" onClick={() => void commitCategoryTransfer()} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white">{categoryTransfer.mode === "move" ? "نقل التصنيف" : "نسخ التصنيف"}</button></div>
      </section></div>}

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
                  <select required value={form.category} onChange={e => setField("category", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm bg-white"><option value="">اختر التصنيف</option>{categories.filter(c => c !== "all").map(path => <option key={path} value={path}>{categoryLabel(path)}</option>)}</select>
                  <span className="mt-1 block text-[11px] text-slate-500">لإنشاء تصنيف جديد أو فرعي استخدم «إدارة التصنيفات».</span>
                </label>
                <label className="text-xs font-semibold text-slate-600">رأس المال / سعر الشراء
                  <FormattedNumberInput type="number" min="0" required value={form.purchasePrice} onChange={e => setField("purchasePrice", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">سعر البيع للعميل
                  <FormattedNumberInput type="number" min="0" required value={form.salePrice} onChange={e => setField("salePrice", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">الكمية الحالية
                  <FormattedNumberInput type="number" min="0" required value={form.quantity} onChange={e => setField("quantity", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">وحدة القياس
                  <input value={form.unitName} onInput={e => setField("unitName", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="قطعة، كرتون، متر..." />
                </label>
                <label className="text-xs font-semibold text-slate-600">الحد الأدنى للتنبيه
                  <FormattedNumberInput type="number" min="0" value={form.minStock} onChange={e => setField("minStock", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600">الباركود / رقم الصنف
                  <input value={form.barcode} onInput={e => setField("barcode", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="أدخل الرمز أو امسحه بالقارئ" />
                </label>
                <label className="text-xs font-semibold text-slate-600">موقع البضاعة
                  <input value={form.location} onInput={e => setField("location", e.currentTarget.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="مثلاً: المخزن — الرف 3 — الدرج 2" />
                </label>
                <label className="text-xs font-semibold text-slate-600">اسم المورد
                  <input value={form.supplierName} onInput={e => setField("supplierName", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="المحل أو الشخص الذي اشتريت منه" />
                </label>
                <label className="text-xs font-semibold text-slate-600">هاتف المورد
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
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2"><ImagePlus className="w-4 h-4" /> صور البضاعة ({getFormImages(form).length})</div>
                {getFormImages(form).length > 0 && <div className="flex flex-wrap gap-2">{getFormImages(form).map((url, index) => <div key={url} className="relative"><img src={url} alt={`صورة البضاعة ${index + 1}`} className="w-20 h-20 object-cover rounded-lg border" /><button type="button" onClick={() => { const remaining = getFormImages(form).filter((_, i) => i !== index); setForm(current => ({ ...current, imageUrl: remaining[0] || "", imageUrls: remaining })); }} className="absolute -top-2 -left-2 bg-rose-600 text-white rounded-full p-1" aria-label="حذف الصورة"><X className="w-3 h-3" /></button></div>)}</div>}
                <label className="block text-xs text-slate-600">رابط الصورة الرئيسية (اختياري)
                  <input type="url" value={form.imageUrl} onInput={e => setField("imageUrl", e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="https://..." />
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-slate-50">
                  <Camera className="w-4 h-4" /> {isSavingImage ? "جارٍ رفع الصور..." : "اختيار صورة أو أكثر من الهاتف"}
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={isSavingImage} className="sr-only" />
                </label>
                <p className="text-[11px] text-slate-500">يمكنك اختيار عدة صور دفعة واحدة. تُرفع الصور إلى Firebase Storage وتُحفظ مع بطاقة الصنف لتظهر على أجهزتك الأخرى. الحد الأقصى 8 ميغابايت لكل صورة.</p>
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

      {showAiImport && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 flex items-center justify-center p-3 sm:p-5">
          <section dir="rtl" className="bg-white w-full max-w-4xl max-h-[94dvh] overflow-y-auto rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-600" /> ترتيب البضاعة بالذكاء الاصطناعي</h3><p className="text-sm text-slate-500 mt-1">أرسل النص كما هو، حتى لو كان غير مرتب. سيستخرج الأصناف والأسعار والكميات ويقترح التصنيفات.</p></div><button type="button" onClick={() => setShowAiImport(false)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="إغلاق"><X className="w-5 h-5" /></button></div>
            <label className="block text-sm font-semibold text-slate-700">النص الذي يحتوي على بيانات البضاعة<textarea value={aiImportText} onChange={e => setAiImportText(e.target.value)} rows={6} className="mt-2 w-full p-3 border border-slate-200 rounded-xl text-sm leading-6 focus:outline-blue-500" placeholder={"مثال:\nاشتريت 10 كارتونات ماء، سعر الشراء 5000 للكارتون والبيع 6500\n20 علبة عصير برتقال شراء 750 وبيع 1000\nكلها من مورد أبو علي"} /></label>
            {aiImportError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">{aiImportError}</p>}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={isParsingAi || !aiImportText.trim()} onClick={parseAiImport} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"><Sparkles className="w-4 h-4" /> {isParsingAi ? "جاري تحليل النص..." : "حلّل ورتّب النص"}</button>{aiImportItems.length > 0 && <button type="button" onClick={() => setAiImportItems([])} className="px-4 py-2.5 border rounded-lg text-sm">مسح النتائج</button>}</div>
            {aiImportItems.length > 0 && <>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">راجع البيانات والأسعار والتصنيفات قبل الحفظ. أي معلومة غير مذكورة في النص تُترك بصفر أو فارغة ولا تُخمن.</div>
              <div className="overflow-x-auto border rounded-xl"><table className="w-full min-w-[900px] text-sm text-right">
                <thead className="bg-slate-50 text-slate-600"><tr>{["اسم الصنف","التصنيف","الكمية","الوحدة","سعر الشراء","سعر البيع","المورد"].map(label => <th key={label} className="p-2 border-b">{label}</th>)}<th className="p-2 border-b">حذف</th></tr></thead>
                <tbody>{aiImportItems.map((item, index) => <tr key={index} className="border-b last:border-b-0">
                  <td className="p-2"><input aria-label="اسم الصنف" value={item.name} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,name:e.target.value} : x))} className="w-36 p-2 border rounded-lg" /></td>
                  <td className="p-2"><input aria-label="التصنيف" value={item.category} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,category:e.target.value} : x))} className="w-32 p-2 border rounded-lg" /></td>
                  <td className="p-2"><FormattedNumberInput aria-label="الكمية" type="number" min="0" step="any" value={item.quantity} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,quantity:Math.max(0,Number(e.target.value)||0)} : x))} className="w-24 p-2 border rounded-lg" /></td>
                  <td className="p-2"><input aria-label="الوحدة" value={item.unitName} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,unitName:e.target.value} : x))} className="w-24 p-2 border rounded-lg" /></td>
                  <td className="p-2"><FormattedNumberInput aria-label="سعر الشراء" type="number" min="0" value={item.purchasePrice} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,purchasePrice:Math.max(0,Number(e.target.value)||0)} : x))} className="w-28 p-2 border rounded-lg" /></td>
                  <td className="p-2"><FormattedNumberInput aria-label="سعر البيع" type="number" min="0" value={item.salePrice} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,salePrice:Math.max(0,Number(e.target.value)||0)} : x))} className="w-28 p-2 border rounded-lg" /></td>
                  <td className="p-2"><input aria-label="المورد" value={item.supplierName || ""} onChange={e => setAiImportItems(current => current.map((x,i) => i === index ? {...x,supplierName:e.target.value} : x))} className="w-32 p-2 border rounded-lg" /></td>
                  <td className="p-2"><button type="button" onClick={() => setAiImportItems(current => current.filter((_,i) => i !== index))} className="p-2 text-rose-600 rounded-lg hover:bg-rose-50" aria-label="حذف الصنف"><Trash2 className="w-4 h-4" /></button></td>
                </tr>)}</tbody>
              </table></div><p className="text-xs text-slate-500">عدد الأصناف المستخرجة: {aiImportItems.length}. يمكنك تعديل أي قيمة أو حذف صنف قبل الحفظ.</p>
            </>}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setShowAiImport(false)} className="px-4 py-2.5 border rounded-lg text-sm">إلغاء</button><button type="button" disabled={!aiImportItems.length || isParsingAi} onClick={saveAiImportedProducts} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">حفظ الأصناف في المستودع ({aiImportItems.length})</button></div>
          </section>
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
              <FormattedNumberInput type="number" required step="1" value={movementQty} onChange={e => setMovementQty(e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">ملاحظة / رقم فاتورة المورد
              <textarea value={movementNote} onInput={e => setMovementNote(e.target.value)} className="mt-1 w-full p-3 border rounded-lg text-sm" placeholder="اختياري" />
            </label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setMovementProduct(null)} className="px-4 py-2 border rounded-lg text-sm">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">حفظ الحركة</button></div>
          </form>
        </div>
      )}

      {currentDetailsProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3 sm:p-5">
          <div onClick={() => { if (suppressPriceDeleteDismissClick.current) { suppressPriceDeleteDismissClick.current = false; return; } setPriceDeleteEntryId(null); }} className="bg-white w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-2xl shadow-xl p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-800">{currentDetailsProduct.name}</h3><p className="text-xs text-slate-500 mt-1">{currentDetailsProduct.category} {currentDetailsProduct.barcode ? `• ${currentDetailsProduct.barcode}` : ""}</p></div><button onClick={() => setDetailsProduct(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 space-y-2">
                {getProductImages(currentDetailsProduct).length > 0 ? <>
                  <div className="relative overflow-hidden bg-slate-50 rounded-xl border touch-pan-y" onTouchStart={event => { imageTouchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => { const start = imageTouchStartX.current; const end = event.changedTouches[0]?.clientX; imageTouchStartX.current = null; if (start !== null && end !== undefined && Math.abs(end - start) > 35 && getProductImages(currentDetailsProduct).length > 1) setDetailsImageIndex(current => (current + (end < start ? 1 : -1) + getProductImages(currentDetailsProduct).length) % getProductImages(currentDetailsProduct).length); }}>
                    <img src={getProductImages(currentDetailsProduct)[detailsImageIndex % getProductImages(currentDetailsProduct).length]} alt={`${currentDetailsProduct.name} - الصورة ${detailsImageIndex + 1}`} className="w-full h-56 object-contain" />
                    {getProductImages(currentDetailsProduct).length > 1 && <>
                      <button type="button" onClick={() => setDetailsImageIndex(current => (current - 1 + getProductImages(currentDetailsProduct).length) % getProductImages(currentDetailsProduct).length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border shadow p-2" aria-label="الصورة السابقة"><ChevronLeft className="w-5 h-5" /></button>
                      <button type="button" onClick={() => setDetailsImageIndex(current => (current + 1) % getProductImages(currentDetailsProduct).length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border shadow p-2" aria-label="الصورة التالية"><ChevronRight className="w-5 h-5" /></button>
                    </>}
                  </div>
                  {getProductImages(currentDetailsProduct).length > 1 && <div className="flex items-center justify-center gap-3 text-xs text-slate-600"><button type="button" onClick={() => setDetailsImageIndex(current => (current - 1 + getProductImages(currentDetailsProduct).length) % getProductImages(currentDetailsProduct).length)} className="p-1 rounded hover:bg-slate-100" aria-label="السابق"><ChevronRight className="w-4 h-4" /></button><span>{(detailsImageIndex % getProductImages(currentDetailsProduct).length) + 1} / {getProductImages(currentDetailsProduct).length}</span><button type="button" onClick={() => setDetailsImageIndex(current => (current + 1) % getProductImages(currentDetailsProduct).length)} className="p-1 rounded hover:bg-slate-100" aria-label="التالي"><ChevronLeft className="w-4 h-4" /></button></div>}
                </> : <div className="h-40 bg-slate-50 border rounded-xl flex items-center justify-center"><ImagePlus className="w-10 h-10 text-slate-300" /></div>}
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-3 content-start">
                {[["سعر الشراء", currentDetailsProduct?.purchasePrice], ["سعر البيع", currentDetailsProduct?.salePrice], ["ربح القطعة المتوقع", (currentDetailsProduct?.salePrice || 0) - (currentDetailsProduct?.purchasePrice || 0)], ["الكمية الحالية", currentDetailsProduct.quantity]].map(([label, value]) => <div key={String(label)} className="bg-slate-50 rounded-lg p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="font-bold text-slate-800 mt-1">{money(Number(value))} {label === "الكمية الحالية" ? (currentDetailsProduct.unitName || "قطعة") : settings.currency}</div></div>)}
                <div className="col-span-2 text-sm text-slate-700 space-y-1">
                  {currentDetailsProduct.location && <p className="whitespace-pre-wrap">موقع البضاعة: {currentDetailsProduct.location}</p>}
                  {currentDetailsProduct.supplierName && <p className="flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" /> المورد: {currentDetailsProduct.supplierName}</p>}
                  {currentDetailsProduct.supplierPhone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {currentDetailsProduct.supplierPhone}</p>}
                  {currentDetailsProduct.description && <p className="whitespace-pre-wrap">{currentDetailsProduct.description}</p>}
                  {currentDetailsProduct.notes && <p className="whitespace-pre-wrap text-slate-500">ملاحظات: {currentDetailsProduct.notes}</p>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setDetailsProduct(null); openEdit(currentDetailsProduct); }} className="px-3 py-2 rounded-lg bg-slate-100 text-sm inline-flex items-center gap-1"><SquarePen className="w-4 h-4" /> تعديل البطاقة</button>
              <button onClick={() => { const p = currentDetailsProduct; setDetailsProduct(null); openMovement(p, "restock"); }} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm inline-flex items-center gap-1"><PackagePlus className="w-4 h-4" /> توريد</button>
              <button onClick={() => { const p = currentDetailsProduct; setDetailsProduct(null); openMovement(p, "return"); }} className="px-3 py-2 rounded-lg bg-slate-100 text-sm inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> مرتجع</button>
              <button onClick={() => { const p = currentDetailsProduct; setDetailsProduct(null); openMovement(p, "damaged"); }} className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> تالف</button>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs text-slate-500">السجلات والتفاصيل الإضافية</p>
              <div className="flex flex-wrap items-center gap-2" aria-label="سجلات البضاعة">
                <button type="button" onClick={() => setDetailsTab(current => current === "prices" ? "overview" : "prices")} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${detailsTab === "prices" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} title="سجل الأسعار"><History className="h-4 w-4" /> سجل الأسعار</button>
                <button type="button" onClick={() => setDetailsTab(current => current === "stock" ? "overview" : "stock")} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${detailsTab === "stock" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} title="حركة المخزون"><Clock className="h-4 w-4" /> حركة المخزون</button>
                <button type="button" onClick={() => setDetailsTab(current => current === "invoices" ? "overview" : "invoices")} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${detailsTab === "invoices" ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} title="الفواتير المرتبطة"><FileText className="h-4 w-4" /> الفواتير المرتبطة</button>
              </div>
            </div>
            {detailsTab === "prices" && <section className="space-y-2">
              <h4 className="font-bold text-sm flex items-center gap-2"><History className="w-4 h-4" /> سجل الأسعار</h4>
              <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-400 bg-white">
                <table aria-label="جدول سجل الأسعار" className="w-max min-w-full border-collapse text-xs text-center text-slate-900">
                  <thead className="bg-[#94acd1]"><tr>{["تسلسل", "مبلغ رأس المال", "مبلغ البيع", "مبلغ الربح", "المورد", "الطابع الزمني"].map(label => <th scope="col" key={label} className="border border-slate-400 px-2 py-2 font-bold whitespace-nowrap">{label}</th>)}</tr></thead>
                  <tbody>
                    {priceHistoryRows.length === 0 ? <tr><td colSpan={6} className="border border-slate-300 p-4 text-slate-500">لا توجد أسعار مسجلة بعد. يظهر هنا كل تغيير محفوظ في رأس المال أو سعر البيع.</td></tr> : priceHistoryRows.map((entry, index) => <React.Fragment key={entry.id}>
                      <tr onTouchStart={() => startPriceLongPress(entry.id)} onTouchEnd={cancelPriceLongPress} onTouchMove={cancelPriceLongPress} onTouchCancel={cancelPriceLongPress} onMouseDown={() => startPriceLongPress(entry.id)} onMouseUp={cancelPriceLongPress} onMouseLeave={cancelPriceLongPress} onContextMenu={event => { event.preventDefault(); setPriceDeleteEntryId(entry.id); }} className="select-none hover:bg-blue-50/40" title={entry.note || "اضغط مطولاً لعرض إجراءات السجل"}>
                        <td className="border border-slate-300 px-2 py-2">{index + 1}</td>
                        <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{money(entry.purchasePrice)}</td>
                        <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{money(entry.salePrice)}</td>
                        <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{money((Number(entry.salePrice) || 0) - (Number(entry.purchasePrice) || 0))}</td>
                        <td className="border border-slate-300 px-2 py-2">{productTextLines(entry.supplierName)}</td>
                        <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{formatStockSaleTimestamp(entry.changedAt)}</td>
                      </tr>
                      {priceDeleteEntryId === entry.id && <tr><td colSpan={6} className="border border-slate-300 p-2 text-right">
                        <button type="button" onClick={() => {
                          if (!currentDetailsProduct || !window.confirm("هل تريد حذف سجل السعر هذا؟")) return;
                          const updatedProduct = { ...currentDetailsProduct, priceHistory: (currentDetailsProduct.priceHistory || []).filter(item => item.id !== entry.id) };
                          updateProduct(updatedProduct);
                          setDetailsProduct(updatedProduct);
                          setPriceDeleteEntryId(null);
                        }} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100"><Trash2 className="w-4 h-4" /> حذف السجل</button>
                      </td></tr>}
                    </React.Fragment>)}
                  </tbody>
                </table>
              </div>
            </section>}
            {detailsTab === "stock" && <section className="space-y-3">
              <h4 className="font-bold text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> حركة المخزون</h4>
              <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-400 bg-white">
                <table aria-label="جدول حركة المخزون" className="w-max min-w-full border-collapse text-xs text-center text-slate-900">
                  <thead className="bg-[#94acd1]">
                    <tr>{["ت", "العميل", "عدد البيع", "إجمالي مبلغ رأس المال", "إجمالي مبلغ البيع", "إجمالي مبلغ الربح", "الطابع الزمني"].map(label => <th scope="col" key={label} className="border border-slate-400 px-2 py-2 font-bold whitespace-nowrap">{label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {productSales.length === 0 ? <tr><td colSpan={7} className="border border-slate-300 p-4 text-slate-500">لا توجد عمليات بيع مسجلة لهذه البضاعة في سجل الديون.</td></tr> : productSales.map((row, index) => <tr key={row.id} className="hover:bg-blue-50/40">
                      <td className="border border-slate-300 px-2 py-2">{index + 1}</td>
                      <td className="border border-slate-300 px-2 py-2">{productTextLines(row.customerName)}</td>
                      <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{money(row.quantity)} {row.unit}</td>
                      <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{row.capital === null ? "—" : money(row.capital)}</td>
                      <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{money(row.sales)}</td>
                      <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{row.profit === null ? "—" : money(row.profit)}</td>
                      <td className="border border-slate-300 px-2 py-2 whitespace-nowrap">{formatStockSaleTimestamp(row.timestamp)}</td>
                    </tr>)}
                  </tbody>
                  <tfoot className="bg-[#ffd740] font-bold">
                    <tr><td className="border border-slate-400 px-2 py-2"></td><th scope="row" className="border border-slate-400 px-2 py-2">المجموع</th><td className="border border-slate-400 px-2 py-2 whitespace-nowrap">{money(salesQuantity)} {salesUnits.length === 1 ? salesUnits[0] : salesUnits.length > 1 ? "وحدات متنوعة" : currentDetailsProduct.unitName || "قطعة"}</td><td className="border border-slate-400 px-2 py-2">{salesCapital === null ? "—" : money(salesCapital)}</td><td className="border border-slate-400 px-2 py-2">{money(salesAmount)}</td><td className="border border-slate-400 px-2 py-2">{salesCapital === null ? "—" : money(salesAmount - salesCapital)}</td><td className="border border-slate-400 px-2 py-2"></td></tr>
                  </tfoot>
                </table>
              </div>
              {!salesCostKnown && <p className="text-xs text-slate-500">— تعني أن تكلفة الشراء وقت البيع غير مسجلة؛ لذلك لا يُحسب ربحها من سعر الشراء الحالي.</p>}
              {otherStockMovements.length > 0 && <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold">حركات التوريد والمرتجعات والتسوية والتالف ({otherStockMovements.length})</summary>
                <div className="mt-3 overflow-x-auto"><table aria-label="حركات المخزون الأخرى" className="w-full border-collapse text-xs text-center">
                  <thead className="bg-[#94acd1]"><tr>{["نوع الحركة", "الكمية", "الملاحظات", "الطابع الزمني"].map(label => <th scope="col" key={label} className="border border-slate-400 p-2 whitespace-nowrap">{label}</th>)}</tr></thead>
                  <tbody>{otherStockMovements.map(movement => <tr key={movement.id}><td className="border border-slate-300 p-2 whitespace-nowrap">{movementLabels[movement.type]}</td><td className="border border-slate-300 p-2 whitespace-nowrap" dir="ltr">{movement.quantity > 0 ? "+" : ""}{money(movement.quantity)}</td><td className="border border-slate-300 p-2">{movement.note || "—"}</td><td className="border border-slate-300 p-2 whitespace-nowrap">{formatStockSaleTimestamp(movement.createdAt)}</td></tr>)}</tbody>
                </table></div>
              </details>}
            </section>}
            {detailsTab === "invoices" && <section className="space-y-2">
              <h4 className="font-bold text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> الفواتير المرتبطة</h4>
              {invoices.filter(invoice => (invoice.items || []).some(item => item.productId === currentDetailsProduct.id && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow)).length === 0
                ? <p className="text-xs text-slate-500">لا توجد فواتير مرتبطة بهذه البضاعة بعد.</p>
                : <div className="space-y-2">{invoices.filter(invoice => (invoice.items || []).some(item => item.productId === currentDetailsProduct.id && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow)).map(invoice => {
                  const linkedItems = (invoice.items || []).filter(item => item.productId === currentDetailsProduct.id && !item.isSeparator && !item.isPaymentRow && !item.isRemainingRow);
                  return <div key={invoice.id} className="border rounded-lg p-3 space-y-1 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2"><b>فاتورة {invoice.invoiceNumber || invoice.id}</b><span className="text-slate-500">{invoice.date || invoice.createdAt ? new Date(invoice.date || invoice.createdAt).toLocaleString("ar-IQ") : "التاريخ غير متوفر"}</span></div>
                    {invoice.customerName && <div className="text-slate-600">العميل: {invoice.customerName}</div>}
                    {linkedItems.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 text-slate-600"><span>الكمية: {Number(item.quantity) || 0} • سعر الوحدة: {money(Number(item.unitPrice) || 0)} {settings.currency}</span><b>{money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))} {settings.currency}</b></div>)}
                  </div>;
                })}</div>}
            </section>}
            <div className="flex justify-end border-t pt-3"><button onClick={() => setDetailsProduct(null)} className="px-4 py-2 border rounded-lg text-sm">إغلاق</button></div>
          </div>
        </div>
      )}
      {showPriceLabels && <PriceLabelsModal products={activeProducts} currency={settings.currency} onClose={() => setShowPriceLabels(false)} onUpdateProduct={updateProduct} />}
      {showBarcodeScanner && <BarcodeScannerModal onDetected={handleBarcodeDetected} onClose={() => setShowBarcodeScanner(false)} />}
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