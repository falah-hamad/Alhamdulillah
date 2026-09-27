import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ArrowRight,
  Search,
  LayoutGrid,
  List,
  MoreVertical,
  CheckSquare,
  Square,
  RefreshCw,
  ArrowUpDown,
  FolderPlus,
  UserPlus,
  Star,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  BookOpen,
  ChevronLeft,
  X,
  Trash2,
  Pencil,
  Move,
  Check,
  User,
  Phone,
  DollarSign,
  AlertCircle,
  FolderInput,
  Share2,
  Copy,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Customer, CustomerFolder, Invoice, Payment, SystemSettings } from "../types";
import DeleteConfirmModal, { DeleteConfirmType } from "./DeleteConfirmModal";
import TrashManagerView from "./TrashManagerView";

export interface FileManagerViewProps {
  rootName?: string;
  folders: CustomerFolder[];
  customers: Customer[];
  invoices?: Invoice[];
  payments?: Payment[];
  settings?: SystemSettings;
  currentFolderId?: string | null; // null represents Root ("سجل الديون")
  onNavigate?: (folderId: string | null) => void;
  onSelectCustomer?: (customerId: string) => void;
  onAddFolder?: (folder: Omit<CustomerFolder, "id" | "createdAt"> | CustomerFolder) => CustomerFolder | void;
  onUpdateFolder?: (folder: CustomerFolder) => void;
  onDeleteFolder?: (folderId: string) => void;
  onRestoreFolder?: (folderId: string) => void;
  onPermanentDeleteFolder?: (folderId: string) => void;
  onAddCustomer?: (customer: Omit<Customer, "id" | "createdAt">) => Customer | void;
  onUpdateCustomer?: (customer: Customer) => void;
  onDeleteCustomer?: (customerId: string) => void;
  onRestoreCustomer?: (customerId: string) => void;
  onPermanentDeleteCustomer?: (customerId: string) => void;
  onMoveItems?: (folderIds: string[], customerIds: string[], targetFolderId: string | null) => void;
  onBulkDelete?: (folderIds: string[], customerIds: string[]) => void;
  onBulkRestore?: (folderIds: string[], customerIds: string[]) => void;
  onBulkPermanentDelete?: (folderIds: string[], customerIds: string[]) => void;
  onEmptyTrash?: () => void;
  onRestoreAllTrash?: () => void;
  onOpenCustomerModal?: () => void;
  onOpenFolderModal?: () => void;
  // Compact mode when rendered inside LedgerView
  isEmbedded?: boolean;
}

const colorThemes: Record<
  string,
  { bg: string; border: string; text: string; icon: string; badge: string; accent: string }
> = {
  amber: {
    bg: "bg-amber-50/70 hover:bg-amber-100/70",
    border: "border-amber-200/80",
    text: "text-amber-900",
    icon: "text-amber-500",
    badge: "bg-amber-100 text-amber-800",
    accent: "bg-amber-500",
  },
  blue: {
    bg: "bg-blue-50/70 hover:bg-blue-100/70",
    border: "border-blue-200/80",
    text: "text-blue-900",
    icon: "text-blue-500",
    badge: "bg-blue-100 text-blue-800",
    accent: "bg-blue-500",
  },
  emerald: {
    bg: "bg-emerald-50/70 hover:bg-emerald-100/70",
    border: "border-emerald-200/80",
    text: "text-emerald-900",
    icon: "text-emerald-500",
    badge: "bg-emerald-100 text-emerald-800",
    accent: "bg-emerald-500",
  },
  purple: {
    bg: "bg-purple-50/70 hover:bg-purple-100/70",
    border: "border-purple-200/80",
    text: "text-purple-900",
    icon: "text-purple-500",
    badge: "bg-purple-100 text-purple-800",
    accent: "bg-purple-500",
  },
  rose: {
    bg: "bg-rose-50/70 hover:bg-rose-100/70",
    border: "border-rose-200/80",
    text: "text-rose-900",
    icon: "text-rose-500",
    badge: "bg-rose-100 text-rose-800",
    accent: "bg-rose-500",
  },
  slate: {
    bg: "bg-slate-50/70 hover:bg-slate-100/70",
    border: "border-slate-200/80",
    text: "text-slate-900",
    icon: "text-slate-500",
    badge: "bg-slate-100 text-slate-800",
    accent: "bg-slate-500",
  },
};

export default function FileManagerView({
  rootName = "سجل الديون",
  folders,
  customers,
  invoices = [],
  payments = [],
  settings,
  currentFolderId = null,
  onNavigate,
  onSelectCustomer,
  onAddFolder,
  onUpdateFolder,
  onDeleteFolder,
  onRestoreFolder,
  onPermanentDeleteFolder,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onRestoreCustomer,
  onPermanentDeleteCustomer,
  onMoveItems,
  onBulkDelete,
  onBulkRestore,
  onBulkPermanentDelete,
  onEmptyTrash,
  onRestoreAllTrash,
  onOpenCustomerModal,
  onOpenFolderModal,
  isEmbedded = false,
}: FileManagerViewProps) {
  // Navigation state: null represents Root (rootName, default "سجل الديون")
  const [internalFolderId, setInternalFolderId] = useState<string | null>(currentFolderId ?? null);

  // Trash view modal state
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Delete confirmation modal state
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    type: DeleteConfirmType;
    id?: string;
    name?: string;
    warningMessage?: string;
    itemDetails?: string;
    isPermanent?: boolean;
    onConfirmAction?: () => void;
  }>({
    isOpen: false,
    type: "folder",
  });

  // Filter active (non-deleted) items for standard Debt Register view
  const activeFolders = useMemo(() => folders.filter((f) => !f.isDeleted), [folders]);
  const activeCustomers = useMemo(() => customers.filter((c) => !c.isDeleted), [customers]);
  const deletedFolders = useMemo(() => folders.filter((f) => !!f.isDeleted), [folders]);
  const deletedCustomers = useMemo(() => customers.filter((c) => !!c.isDeleted), [customers]);
  const totalDeletedCount = deletedFolders.length + deletedCustomers.length;

  useEffect(() => {
    if (currentFolderId !== undefined) {
      setInternalFolderId(currentFolderId);
    }
  }, [currentFolderId]);

  const activeFolderId = internalFolderId;

  // Auto fallback if active folder was deleted or moved to trash
  useEffect(() => {
    if (activeFolderId && !activeFolders.some((f) => f.id === activeFolderId)) {
      setInternalFolderId(null);
      if (onNavigate) onNavigate(null);
    }
  }, [activeFolderId, activeFolders, onNavigate]);

  const navigateTo = (fId: string | null) => {
    setInternalFolderId(fId);
    if (onNavigate) {
      onNavigate(fId);
    }
    // Clear selection on navigate
    setIsSelectionMode(false);
    setSelectedFolderIds(new Set());
    setSelectedCustomerIds(new Set());
  };

  // View Mode: Grid (default) vs List
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("acc_filemanager_view_mode") as "grid" | "list") || "grid";
    } catch {
      return "grid";
    }
  });

  const toggleViewMode = () => {
    const nextMode = viewMode === "grid" ? "list" : "grid";
    setViewMode(nextMode);
    try {
      localStorage.setItem("acc_filemanager_view_mode", nextMode);
    } catch {}
    showToast(nextMode === "grid" ? "تم التبديل إلى عرض الشبكة" : "تم التبديل إلى عرض القائمة");
  };

  // Search State
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Popup Menu State (the ⋮ 7-item menu)
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());

  // Sorting State
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "date" | "balance" | "count">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Create Folder Modal State
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("amber");

  // Create Customer Modal State
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustOpeningDebt, setNewCustOpeningDebt] = useState("");

  // Move Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemsToMove, setItemsToMove] = useState<{ folderIds: string[]; customerIds: string[] } | null>(null);
  const [targetMoveFolderId, setTargetMoveFolderId] = useState<string | null>(null);

  // Rename Folder Modal State
  const [renameModalFolder, setRenameModalFolder] = useState<CustomerFolder | null>(null);
  const [renameFolderInput, setRenameFolderInput] = useState("");

  // Single Item Action Menu State
  const [itemActionMenu, setItemActionMenu] = useState<{
    type: "folder" | "customer";
    id: string;
    name: string;
  } | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Current folder object
  const currentFolder = useMemo(() => {
    if (!activeFolderId) return null;
    return activeFolders.find((f) => f.id === activeFolderId) || null;
  }, [activeFolders, activeFolderId]);

  // Parent folder of current folder (for back navigation)
  const parentFolder = useMemo(() => {
    if (!currentFolder || !currentFolder.parentId) return null;
    return activeFolders.find((f) => f.id === currentFolder.parentId) || null;
  }, [activeFolders, currentFolder]);

  // Breadcrumbs: from root (rootName) down to activeFolderId
  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: rootName }];
    if (!activeFolderId) return crumbs;

    const trail: CustomerFolder[] = [];
    const visited = new Set<string>();
    let curr: CustomerFolder | undefined = activeFolders.find((f) => f.id === activeFolderId);

    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      trail.unshift(curr);
      if (curr.parentId) {
        curr = activeFolders.find((f) => f.id === curr!.parentId);
      } else {
        break;
      }
    }

    trail.forEach((folder) => {
      crumbs.push({ id: folder.id, name: folder.name });
    });

    return crumbs;
  }, [activeFolders, activeFolderId, rootName]);

  // Customer debt calculation helper
  const customerDebtMap = useMemo(() => {
    const map = new Map<string, number>();
    activeCustomers.forEach((c) => {
      const custInvoices = invoices.filter((inv) => inv.customerId === c.id);
      const custPayments = payments.filter((p) => p.customerId === c.id);
      const totalInv = custInvoices.reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);
      const totalPay = custPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const net = Math.max(0, totalInv - totalPay);
      map.set(c.id, net);
    });
    return map;
  }, [activeCustomers, invoices, payments]);

  // Contents of current folder:
  // 1. Direct Subfolders
  const rawSubfolders = useMemo(() => {
    if (activeFolderId === null) {
      // Root level: folders where parentId is null, empty or undefined
      return activeFolders.filter((f) => !f.parentId || f.parentId === "root");
    }
    return activeFolders.filter((f) => f.parentId === activeFolderId);
  }, [activeFolders, activeFolderId]);

  // 2. Direct Customers
  const rawCustomers = useMemo(() => {
    if (activeFolderId === null) {
      // Root level: customers with no folderId or folderId === "all" or folderId not in known folders
      return activeCustomers.filter((c) => !c.folderId || c.folderId === "all");
    }
    return activeCustomers.filter((c) => c.folderId === activeFolderId);
  }, [activeCustomers, activeFolderId]);

  // Subfolder items count helper (subfolders + customers inside it)
  const getFolderItemCounts = (folderId: string) => {
    const subCount = activeFolders.filter((f) => f.parentId === folderId).length;
    const custCount = activeCustomers.filter((c) => c.folderId === folderId).length;
    return { subCount, custCount, total: subCount + custCount };
  };

  // Filter by search query
  const filteredSubfolders = useMemo(() => {
    if (!searchQuery.trim()) return rawSubfolders;
    const q = searchQuery.toLowerCase().trim();
    return rawSubfolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [rawSubfolders, searchQuery]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return rawCustomers;
    const q = searchQuery.toLowerCase().trim();
    return rawCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }, [rawCustomers, searchQuery]);

  // Sorted Subfolders
  const sortedSubfolders = useMemo(() => {
    return [...filteredSubfolders].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, "ar");
      } else if (sortBy === "date") {
        comparison = (a.createdAt || "").localeCompare(b.createdAt || "");
      } else if (sortBy === "count") {
        const countA = getFolderItemCounts(a.id).total;
        const countB = getFolderItemCounts(b.id).total;
        comparison = countA - countB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredSubfolders, sortBy, sortOrder, activeFolders, activeCustomers]);

  // Sorted Customers
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, "ar");
      } else if (sortBy === "date") {
        comparison = (a.createdAt || "").localeCompare(b.createdAt || "");
      } else if (sortBy === "balance") {
        const balA = customerDebtMap.get(a.id) || 0;
        const balB = customerDebtMap.get(b.id) || 0;
        comparison = balA - balB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredCustomers, sortBy, sortOrder, customerDebtMap]);

  // Total selected count
  const selectedCount = selectedFolderIds.size + selectedCustomerIds.size;
  const allCurrentItemsCount = sortedSubfolders.length + sortedCustomers.length;
  const isAllSelected =
    allCurrentItemsCount > 0 &&
    selectedFolderIds.size === sortedSubfolders.length &&
    selectedCustomerIds.size === sortedCustomers.length;

  // Toggle selection for folder
  const toggleFolderSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedFolderIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedFolderIds(next);
  };

  // Toggle selection for customer
  const toggleCustomerSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedCustomerIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedCustomerIds(next);
  };

  // Select all or deselect all
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedFolderIds(new Set());
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedFolderIds(new Set(sortedSubfolders.map((f) => f.id)));
      setSelectedCustomerIds(new Set(sortedCustomers.map((c) => c.id)));
    }
  };

  // Exit selection mode
  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedFolderIds(new Set());
    setSelectedCustomerIds(new Set());
  };

  // Favorites logic
  const favoriteFolders = useMemo(() => {
    return activeFolders.filter((f) => f.isFavorite);
  }, [activeFolders]);

  const toggleFavoriteCurrentFolder = () => {
    if (!currentFolder) {
      showToast("المجلد الرئيسي (التخزين الداخلي) مثبت دائماً");
      return;
    }
    const updated = { ...currentFolder, isFavorite: !currentFolder.isFavorite };
    if (onUpdateFolder) {
      onUpdateFolder(updated);
    }
    showToast(
      updated.isFavorite
        ? `تمت إضافة "${currentFolder.name}" إلى المفضلة ⭐`
        : `تمت إزالة "${currentFolder.name}" من المفضلة`
    );
  };

  const toggleFolderFavoriteById = (folder: CustomerFolder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = { ...folder, isFavorite: !folder.isFavorite };
    if (onUpdateFolder) {
      onUpdateFolder(updated);
    }
    showToast(
      updated.isFavorite
        ? `تمت إضافة "${folder.name}" إلى المفضلة ⭐`
        : `تمت إزالة "${folder.name}" من المفضلة`
    );
  };

  // Refresh handler (Item 3 in Popup Menu)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast("تم تحديث محتويات المجلد بنجاح");
    }, 450);
  };

  // Create Subfolder handler (Item 5 in Popup Menu)
  const handleCreateSubfolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const newFolderData: CustomerFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      color: newFolderColor || "amber",
      createdAt: new Date().toISOString(),
      parentId: activeFolderId, // Hierarchically placed inside the current folder!
      isFavorite: false,
    };

    if (onAddFolder) {
      onAddFolder(newFolderData);
    }
    setNewFolderName("");
    setIsCreateFolderModalOpen(false);
    showToast(`تم إنشاء المجلد "${newFolderData.name}" بنجاح!`);
  };

  // Create Customer handler (Item 6 in Popup Menu)
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const openingDebtNum = parseFloat(newCustOpeningDebt) || 0;
    const newCustomerData: Customer = {
      id: `cust-${Date.now()}`,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
      createdAt: new Date().toISOString(),
      folderId: activeFolderId || undefined, // Linked directly to the current folder!
    };

    if (onAddCustomer) {
      onAddCustomer(newCustomerData);
    }

    setNewCustName("");
    setNewCustPhone("");
    setNewCustAddress("");
    setNewCustOpeningDebt("");
    setIsCreateCustomerModalOpen(false);
    showToast(`تمت إضافة العميل "${newCustomerData.name}" بنجاح!`);
  };

  // Move items handler
  const handleExecuteMove = () => {
    if (!itemsToMove) return;
    const { folderIds, customerIds } = itemsToMove;

    if (onMoveItems) {
      onMoveItems(folderIds, customerIds, targetMoveFolderId);
    } else {
      // Fallback updates
      if (onUpdateFolder) {
        folderIds.forEach((fId) => {
          const f = folders.find((x) => x.id === fId);
          if (f) {
            onUpdateFolder({ ...f, parentId: targetMoveFolderId });
          }
        });
      }
      if (onUpdateCustomer) {
        customerIds.forEach((cId) => {
          const c = customers.find((x) => x.id === cId);
          if (c) {
            onUpdateCustomer({ ...c, folderId: targetMoveFolderId || undefined });
          }
        });
      }
    }

    const targetName =
      targetMoveFolderId === null
        ? "التخزين الداخلي"
        : folders.find((f) => f.id === targetMoveFolderId)?.name || "المجلد المحدد";

    showToast(`تم نقل ${folderIds.length + customerIds.length} عنصر إلى "${targetName}" بنجاح!`);
    setIsMoveModalOpen(false);
    setItemsToMove(null);
    exitSelectionMode();
  };

  // Bulk Delete
  const handleExecuteBulkDelete = () => {
    const fIds: string[] = Array.from(selectedFolderIds);
    const cIds: string[] = Array.from(selectedCustomerIds);
    if (fIds.length === 0 && cIds.length === 0) return;

    const parts: string[] = [];
    if (fIds.length > 0) parts.push(`${fIds.length} مجلد`);
    if (cIds.length > 0) parts.push(`${cIds.length} عميل`);
    const countText = parts.join(" و ");
    const totalCount = fIds.length + cIds.length;

    setDeleteConfirmState({
      isOpen: true,
      type: "bulk",
      warningMessage: `هل أنت متأكد من حذف ${countText}؟`,
      itemDetails:
        "سيتم نقل العناصر المحددة ومحتوياتها بالكامل إلى سلة المهملات بأمان، مع الاحتفاظ بجميع بيانات الحسابات والديون، ويمكنك استعادتها في أي وقت.",
      onConfirmAction: () => {
        if (onBulkDelete) {
          onBulkDelete(fIds, cIds);
        } else {
          if (onDeleteFolder) {
            fIds.forEach((fId: string) => onDeleteFolder(fId));
          }
          if (onDeleteCustomer) {
            cIds.forEach((cId: string) => onDeleteCustomer(cId));
          }
        }
        showToast(`تم نقل ${totalCount} عنصر إلى سلة المهملات بنجاح.`);
        exitSelectionMode();
      },
    });
  };

  // Rename folder execute
  const handleExecuteRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModalFolder || !renameFolderInput.trim()) return;
    const updated = { ...renameModalFolder, name: renameFolderInput.trim() };
    if (onUpdateFolder) {
      onUpdateFolder(updated);
    }
    showToast(`تمت إعادة تسمية المجلد إلى "${updated.name}"`);
    setRenameModalFolder(null);
  };

  // Dedicated single folder delete trigger with safety confirmation modal
  const triggerDeleteFolder = (folder: CustomerFolder) => {
    const counts = getFolderItemCounts(folder.id);
    const details =
      counts.subCount > 0 || counts.custCount > 0
        ? `يحتوي هذا المجلد على ${counts.custCount} زبون و ${counts.subCount} مجلد فرعي. سيتم نقل المجلد وكافة محتوياته بأمان إلى سلة المهملات، مع إمكانية استعادتها في أي وقت.`
        : "سيتم نقل المجلد بأمان إلى سلة المهملات، ويمكنك استعادته في أي وقت.";

    setDeleteConfirmState({
      isOpen: true,
      type: "folder",
      id: folder.id,
      name: folder.name,
      warningMessage: "هل أنت متأكد من حذف هذا المجلد؟",
      itemDetails: details,
      isPermanent: false,
      onConfirmAction: () => {
        if (onDeleteFolder) {
          onDeleteFolder(folder.id);
        }
        showToast(`تم نقل المجلد "${folder.name}" إلى سلة المهملات بنجاح.`);
        if (activeFolderId === folder.id) {
          navigateTo(folder.parentId || null);
        }
      },
    });
  };

  // Dedicated single customer delete trigger with safety confirmation modal
  const triggerDeleteCustomer = (cust: Customer) => {
    setDeleteConfirmState({
      isOpen: true,
      type: "customer",
      id: cust.id,
      name: cust.name,
      warningMessage: "هل أنت متأكد من حذف هذا الزبون؟",
      itemDetails: `سيتم نقل الزبون "${cust.name}" وسجل ديونه وقوائم حساباته بالكامل إلى سلة المهملات بأمان، مع إمكانية استعادته في أي وقت دون فقدان أي بيانات.`,
      isPermanent: false,
      onConfirmAction: () => {
        if (onDeleteCustomer) {
          onDeleteCustomer(cust.id);
        }
        showToast(`تم نقل الزبون "${cust.name}" إلى سلة المهملات بنجاح.`);
      },
    });
  };

  const currency = settings?.currency || "د.ع";

  // If Trash Manager is opened, render TrashManagerView
  if (isTrashOpen) {
    return (
      <TrashManagerView
        folders={folders}
        customers={customers}
        invoices={invoices}
        payments={payments}
        settings={settings}
        rootName={rootName}
        onClose={() => setIsTrashOpen(false)}
        onRestoreFolder={(fId) => {
          if (onRestoreFolder) onRestoreFolder(fId);
        }}
        onPermanentDeleteFolder={(fId) => {
          if (onPermanentDeleteFolder) onPermanentDeleteFolder(fId);
        }}
        onRestoreCustomer={(cId) => {
          if (onRestoreCustomer) onRestoreCustomer(cId);
        }}
        onPermanentDeleteCustomer={(cId) => {
          if (onPermanentDeleteCustomer) onPermanentDeleteCustomer(cId);
        }}
        onBulkRestore={(fIds, cIds) => {
          if (onBulkRestore) onBulkRestore(fIds, cIds);
        }}
        onBulkPermanentDelete={(fIds, cIds) => {
          if (onBulkPermanentDelete) onBulkPermanentDelete(fIds, cIds);
        }}
        onEmptyTrash={() => {
          if (onEmptyTrash) onEmptyTrash();
        }}
        onRestoreAllTrash={() => {
          if (onRestoreAllTrash) onRestoreAllTrash();
        }}
        showToast={showToast}
      />
    );
  }

  return (
    <div
      dir="rtl"
      className={`flex flex-col w-full bg-slate-50/60 text-slate-800 rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden select-none transition-all ${
        isEmbedded ? "my-2" : "min-h-[680px]"
      }`}
    >
      {/* ========================================================
          1. الشريط العلوي (Top App Bar) - مطابق تماماً للمواصفات
          ======================================================== */}
      <header
        className={`sticky top-0 z-30 flex items-center justify-between px-3 sm:px-4 py-3 border-b transition-colors shadow-2xs ${
          isSelectionMode ? "bg-amber-600 text-white border-amber-700" : "bg-white border-slate-200"
        }`}
      >
        {/* Right side in RTL (الجهة اليمنى: زر الرجوع ←) */}
        <div className="flex items-center gap-2">
          {isSelectionMode ? (
            <button
              type="button"
              onClick={exitSelectionMode}
              className="p-2 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="إلغاء وضع التحديد"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={activeFolderId === null}
              onClick={() => {
                if (activeFolderId !== null) {
                  navigateTo(parentFolder ? parentFolder.id : null);
                }
              }}
              className={`p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                activeFolderId === null
                  ? "text-slate-300 bg-slate-100/60 cursor-not-allowed"
                  : "text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200/80 active:scale-95 shadow-2xs"
              }`}
              title={
                activeFolderId === null
                  ? `أنت في المستوى الرئيسي (${rootName})`
                  : `الرجوع إلى: ${parentFolder ? parentFolder.name : rootName}`
              }
            >
              {activeFolderId === null ? (
                <BookOpen className="w-5 h-5 text-amber-600/70" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </button>
          )}

          {/* اسم المجلد الحالي في المنتصف / شريط التحديد */}
          <div className="flex flex-col text-right pr-1">
            {isSelectionMode ? (
              <>
                <span className="text-sm sm:text-base font-black leading-tight">
                  تم تحديد {selectedCount} عنصر
                </span>
                <span className="text-[11px] text-amber-100 font-medium">
                  {selectedFolderIds.size} مجلد • {selectedCustomerIds.size} عميل
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none truncate max-w-[200px] sm:max-w-[340px]">
                    {currentFolder ? currentFolder.name : rootName}
                  </h2>
                  {currentFolder?.isFavorite && (
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                  )}
                  {currentFolder && (
                    <button
                      type="button"
                      onClick={() => triggerDeleteFolder(currentFolder)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                      title={`حذف مجلد "${currentFolder.name}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 font-medium">
                  <span>{sortedSubfolders.length} مجلد</span>
                  <span>•</span>
                  <span>{sortedCustomers.length} عميل</span>
                  {activeFolderId !== null && (
                    <>
                      <span>•</span>
                      <span className="text-slate-400 text-[10px]">
                        {breadcrumbs.length > 2 ? `${breadcrumbs.length - 1} مستويات عمق` : "مستوى أول"}
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Left side in RTL (الجهة اليسرى: أيقونات البحث، العرض، وقائمة ⋮) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {isSelectionMode ? (
            /* أزرار أوامر وضع التحديد */
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors cursor-pointer"
                title={isAllSelected ? "إلغاء تحديد الكل" : "تحديد كافة عناصر المجلد"}
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span className="hidden sm:inline">{isAllSelected ? "إلغاء الكل" : "تحديد الكل"}</span>
              </button>

              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={() => {
                  setItemsToMove({
                    folderIds: Array.from(selectedFolderIds) as string[],
                    customerIds: Array.from(selectedCustomerIds) as string[],
                  });
                  setTargetMoveFolderId(null);
                  setIsMoveModalOpen(true);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedCount === 0
                    ? "opacity-50 cursor-not-allowed bg-white/10 text-white"
                    : "bg-white text-amber-900 hover:bg-amber-50 shadow-2xs"
                }`}
                title="نقل العناصر المحددة إلى مجلد آخر"
              >
                <Move className="w-4 h-4" />
                <span className="hidden sm:inline">نقل ({selectedCount})</span>
              </button>

              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={handleExecuteBulkDelete}
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedCount === 0
                    ? "opacity-50 cursor-not-allowed bg-white/10 text-white"
                    : "bg-rose-500 hover:bg-rose-600 text-white shadow-2xs"
                }`}
                title="حذف العناصر المحددة"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* الأزرار العادية: المهملات، بحث، نمط العرض، والقائمة ⋮ */
            <>
              {/* زر سلة المهملات 🗑️ */}
              <button
                type="button"
                onClick={() => setIsTrashOpen(true)}
                className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  totalDeletedCount > 0
                    ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="سلة المهملات (استعراض واستعادة المحذوفات)"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span className="hidden sm:inline font-sans">المهملات</span>
                {totalDeletedCount > 0 && (
                  <span className="bg-rose-600 text-white font-mono text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-black">
                    {totalDeletedCount}
                  </span>
                )}
              </button>

              {/* أيقونة البحث 🔍 */}
              <button
                type="button"
                onClick={() => {
                  setIsSearchActive(!isSearchActive);
                  if (isSearchActive) setSearchQuery("");
                }}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  isSearchActive || searchQuery
                    ? "bg-amber-500 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                title="بحث داخل محتويات المجلد"
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* أيقونة Grid / Layout للتبديل المباشر بين Grid View و List View */}
              <button
                type="button"
                onClick={toggleViewMode}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
                title={
                  viewMode === "grid"
                    ? "التبديل إلى عرض القائمة (List View)"
                    : "التبديل إلى عرض الشبكة (Grid View)"
                }
              >
                {viewMode === "grid" ? (
                  <List className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
                ) : (
                  <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
                )}
              </button>

              {/* أيقونة القائمة ⋮ لفتح قائمة الخيارات */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    isMenuOpen
                      ? "bg-slate-200 text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                  title="خيارات إضافية"
                >
                  <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* ========================================================
                    4. قائمة الخيارات ⋮ (Popup Menu) بالترتيب الصارم والمحدد:
                    1. تحديد
                    2. تغيير الوضع
                    3. تحديث
                    4. فرز حسب
                    5. إضافة مجلد
                    6. إضافة زبون
                    7. إضافة إلى المفضلة
                    ======================================================== */}
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 overflow-hidden text-right font-sans"
                    >
                      {/* 1. تحديد */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsSelectionMode(true);
                          showToast("تم تفعيل وضع التحديد. اضغط على العناصر لتحديدها.");
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <CheckSquare className="w-4 h-4 text-slate-500 group-hover:text-amber-600 transition-colors" />
                          <span>تحديد</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">وضع الاختيار</span>
                      </button>

                      {/* 2. تغيير الوضع */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          toggleViewMode();
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          {viewMode === "grid" ? (
                            <List className="w-4 h-4 text-slate-500 group-hover:text-amber-600 transition-colors" />
                          ) : (
                            <LayoutGrid className="w-4 h-4 text-slate-500 group-hover:text-amber-600 transition-colors" />
                          )}
                          <span>تغيير الوضع</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {viewMode === "grid" ? "إلى قائمة" : "إلى شبكة"}
                        </span>
                      </button>

                      {/* 3. تحديث */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          handleRefresh();
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <RefreshCw
                            className={`w-4 h-4 text-slate-500 group-hover:text-amber-600 transition-all ${
                              isRefreshing ? "animate-spin text-amber-600" : ""
                            }`}
                          />
                          <span>تحديث</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">إعادة التحميل</span>
                      </button>

                      {/* 4. فرز حسب */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsSortModalOpen(true);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <ArrowUpDown className="w-4 h-4 text-slate-500 group-hover:text-amber-600 transition-colors" />
                          <span>فرز حسب</span>
                        </span>
                        <span className="text-[10px] text-amber-600 font-bold">
                          {sortBy === "name"
                            ? "الاسم"
                            : sortBy === "date"
                            ? "التاريخ"
                            : sortBy === "balance"
                            ? "الرصيد"
                            : "العناصر"}
                        </span>
                      </button>

                      <div className="my-1 border-t border-slate-100" />

                      {/* 5. إضافة مجلد */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsCreateFolderModalOpen(true);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <FolderPlus className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                          <span>إضافة مجلد</span>
                        </span>
                        <span className="text-[10px] text-amber-700 font-normal">داخل الحالي</span>
                      </button>

                      {/* 6. إضافة زبون */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsCreateCustomerModalOpen(true);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-900 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <UserPlus className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                          <span>إضافة زبون</span>
                        </span>
                        <span className="text-[10px] text-blue-700 font-normal">لهذا المجلد</span>
                      </button>

                      <div className="my-1 border-t border-slate-100" />

                      {/* 7. إضافة إلى المفضلة */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          toggleFavoriteCurrentFolder();
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <Star
                            className={`w-4 h-4 ${
                              currentFolder?.isFavorite
                                ? "text-amber-500 fill-amber-400"
                                : "text-slate-400 group-hover:text-amber-500"
                            } transition-colors`}
                          />
                          <span>
                            {currentFolder?.isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {currentFolder?.isFavorite ? "مفضل ⭐" : "وصول سريع"}
                        </span>
                      </button>

                      <div className="my-1 border-t border-slate-100" />

                      {/* زر حذف المجلد الحالي (إذا كنا داخل مجلد) */}
                      {currentFolder && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              triggerDeleteFolder(currentFolder);
                            }}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer group"
                          >
                            <span className="flex items-center gap-2.5">
                              <Trash2 className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
                              <span>حذف هذا المجلد</span>
                            </span>
                            <span className="text-[10px] text-rose-500 font-normal">نقل للمهملات</span>
                          </button>
                          <div className="my-1 border-t border-slate-100" />
                        </>
                      )}

                      {/* 8. سلة المهملات */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsTrashOpen(true);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer group"
                      >
                        <span className="flex items-center gap-2.5">
                          <Trash2 className="w-4 h-4 text-rose-600 group-hover:scale-110 transition-transform" />
                          <span>سلة المهملات</span>
                        </span>
                        {totalDeletedCount > 0 ? (
                          <span className="bg-rose-100 text-rose-800 text-[10px] font-mono px-2 py-0.5 rounded-full font-black">
                            {totalDeletedCount}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">فارغة</span>
                        )}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ========================================================
          شريط البحث التفاعلي (عند تفعيل البحث)
          ======================================================== */}
      <AnimatePresence>
        {isSearchActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white border-b border-slate-200 px-3 py-2 overflow-hidden shadow-2xs"
          >
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن مجلدات أو عملاء بالاسم أو الهاتف داخل هذا المجلد..."
                className="w-full pr-9 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-700 p-0.5 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================
          مسار التنقل الكامل (Breadcrumbs Path Bar)
          ======================================================== */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-100/70 border-b border-slate-200/80 text-xs overflow-x-auto select-none no-scrollbar">
        <div className="flex items-center gap-1 shrink-0">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id || "root"}>
                <button
                  type="button"
                  onClick={() => navigateTo(crumb.id)}
                  disabled={isLast}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    isLast
                      ? "font-black text-amber-900 bg-white shadow-2xs cursor-default"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 font-medium"
                  }`}
                  title={`الانتقال إلى: ${crumb.name}`}
                >
                  {crumb.id === null ? (
                    <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>{crumb.name}</span>
                </button>
                {!isLast && <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0 mx-0.5" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* زر إضافة سريع في شريط المسار */}
        <div className="flex items-center gap-1.5 shrink-0 pr-2">
          <button
            type="button"
            onClick={() => setIsCreateFolderModalOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md text-[11px] font-bold border border-amber-300/70 transition-colors cursor-pointer"
            title="إنشاء مجلد فرعي داخل المجلد الحالي"
          >
            <FolderPlus className="w-3 h-3" />
            <span className="hidden sm:inline">مجلد فرعي</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreateCustomerModalOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-md text-[11px] font-bold border border-blue-300/70 transition-colors cursor-pointer"
            title="إضافة عميل جديد داخل هذا المجلد"
          >
            <UserPlus className="w-3 h-3" />
            <span className="hidden sm:inline">زبون</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          شريط الوصول السريع للمفضلة (Favorites Bar)
          ======================================================== */}
      {favoriteFolders.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 bg-amber-50/50 border-b border-amber-200/50 text-xs overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 shrink-0 pl-1">
            <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
            <span>المفضلة:</span>
          </span>
          {favoriteFolders.map((fav) => (
            <button
              key={fav.id}
              type="button"
              onClick={() => navigateTo(fav.id)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer whitespace-nowrap ${
                activeFolderId === fav.id
                  ? "bg-amber-600 text-white border-amber-700 shadow-2xs font-bold"
                  : "bg-white text-slate-700 border-amber-200 hover:bg-amber-100/60"
              }`}
            >
              <Folder className="w-3 h-3 text-amber-500" />
              <span>{fav.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ========================================================
          محتويات المجلد (المجلدات والعملاء معاً)
          ======================================================== */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto min-h-[380px] space-y-5">
        {/* حالة إذا كان المجلد فارغاً تماماً */}
        {sortedSubfolders.length === 0 && sortedCustomers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-100/60 flex items-center justify-center text-amber-600 mb-3 shadow-2xs">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              {searchQuery ? "لا توجد نتائج مطابقة لبحثك" : "هذا المجلد فارغ حالياً"}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mb-4">
              {searchQuery
                ? `لم نجد أي مجلد أو عميل يطابق "${searchQuery}" داخل هذا المجلد.`
                : "يمكنك البدء بإنشاء مجلدات فرعية لتنظيم الديون، أو إضافة عملاء مباشرة داخل هذا المجلد."}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreateFolderModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>+ إنشاء مجلد هنا</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCreateCustomerModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>+ إضافة عميل هنا</span>
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------
            قسم المجلدات (Folders Section)
            ---------------------------------------------------- */}
        {sortedSubfolders.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <Folder className="w-4 h-4 text-amber-500" />
                <span>المجلدات ({sortedSubfolders.length})</span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">
                اضغط للدخول إلى المجلد
              </span>
            </div>

            {/* نمط العرض 1: GRID VIEW (شبكة بطاقات المجلدات) */}
            {viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {sortedSubfolders.map((folder) => {
                  const theme = colorThemes[folder.color || "amber"] || colorThemes.amber;
                  const counts = getFolderItemCounts(folder.id);
                  const isSelected = selectedFolderIds.has(folder.id);

                  return (
                    <div
                      key={folder.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          toggleFolderSelection(folder.id);
                        } else {
                          navigateTo(folder.id);
                        }
                      }}
                      className={`group relative flex flex-col justify-between p-3 rounded-2xl border transition-all cursor-pointer min-h-[105px] select-none ${
                        isSelected
                          ? "ring-2 ring-amber-500 bg-amber-100/80 border-amber-300 shadow-sm"
                          : `${theme.bg} ${theme.border} hover:shadow-md hover:border-slate-300`
                      }`}
                      title={`فتح المجلد: ${folder.name} (${counts.subCount} مجلد، ${counts.custCount} عميل)`}
                    >
                      {/* رأس البطاقة: أيقونة المجلد، أزرار المفضلة أو التحديد */}
                      <div className="flex items-start justify-between w-full">
                        <div
                          className={`p-2 rounded-xl bg-white/90 shadow-2xs transition-transform group-hover:scale-105 ${
                            isSelected ? "ring-2 ring-amber-500" : ""
                          }`}
                        >
                          <Folder className={`w-5 h-5 ${theme.icon}`} />
                        </div>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {/* Checkbox التحديد */}
                          {isSelectionMode ? (
                            <button
                              type="button"
                              onClick={(e) => toggleFolderSelection(folder.id, e)}
                              className={`p-1 rounded-lg transition-colors ${
                                isSelected ? "text-amber-600" : "text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 fill-amber-100" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <>
                              {/* زر المفضلة ⭐ */}
                              <button
                                type="button"
                                onClick={(e) => toggleFolderFavoriteById(folder, e)}
                                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                  folder.isFavorite
                                    ? "text-amber-500 opacity-100"
                                    : "text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100"
                                }`}
                                title={folder.isFavorite ? "مفضل ⭐" : "إضافة للمفضلة"}
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    folder.isFavorite ? "fill-amber-400" : ""
                                  }`}
                                />
                              </button>

                              {/* زر حذف المجلد السريع */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerDeleteFolder(folder);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                                title="حذف هذا المجلد ونقله لسلة المهملات"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* قائمة خيارات المجلد المفرد */}
                              <button
                                type="button"
                                onClick={() => {
                                  setItemActionMenu({
                                    type: "folder",
                                    id: folder.id,
                                    name: folder.name,
                                  });
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                                title="خيارات المجلد"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* اسم المجلد وتفاصيله */}
                      <div className="mt-2 text-right">
                        <div className="font-bold text-xs text-slate-800 line-clamp-1 leading-tight mb-1">
                          {folder.name}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-mono">
                            {counts.subCount > 0 ? `${counts.subCount} مجلد • ` : ""}
                            {counts.custCount} عميل
                          </span>
                          <span className="text-slate-400 text-[9px]">
                            {folder.createdAt ? new Date(folder.createdAt).toLocaleDateString("ar-EG") : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* نمط العرض 2: LIST VIEW (قائمة رأسية للمجلدات) */
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
                {sortedSubfolders.map((folder) => {
                  const theme = colorThemes[folder.color || "amber"] || colorThemes.amber;
                  const counts = getFolderItemCounts(folder.id);
                  const isSelected = selectedFolderIds.has(folder.id);

                  return (
                    <div
                      key={folder.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          toggleFolderSelection(folder.id);
                        } else {
                          navigateTo(folder.id);
                        }
                      }}
                      className={`flex items-center justify-between px-3 sm:px-4 py-2.5 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-amber-50/90 text-amber-950 font-medium"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isSelectionMode ? (
                          <button
                            type="button"
                            onClick={(e) => toggleFolderSelection(folder.id, e)}
                            className="text-amber-600 p-0.5"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 fill-amber-100" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        ) : (
                          <div className={`p-1.5 rounded-xl bg-slate-100 ${theme.bg}`}>
                            <Folder className={`w-4 h-4 ${theme.icon}`} />
                          </div>
                        )}

                        <div className="text-right">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">{folder.name}</span>
                            {folder.isFavorite && (
                              <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {counts.subCount} مجلد فرعي • {counts.custCount} عميل مباشر
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-slate-400 hidden sm:inline font-mono">
                          {folder.createdAt ? new Date(folder.createdAt).toLocaleDateString("ar-EG") : ""}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => toggleFolderFavoriteById(folder, e)}
                          className={`p-1 rounded-lg text-slate-400 hover:text-amber-500 transition-colors ${
                            folder.isFavorite ? "text-amber-500" : ""
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${folder.isFavorite ? "fill-amber-400" : ""}`} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDeleteFolder(folder);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="حذف هذا المجلد ونقله لسلة المهملات"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setItemActionMenu({
                              type: "folder",
                              id: folder.id,
                              name: folder.name,
                            });
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        <ChevronLeft className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ----------------------------------------------------
            قسم العملاء (Customers Section)
            ---------------------------------------------------- */}
        {sortedCustomers.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <User className="w-4 h-4 text-blue-500" />
                <span>العملاء في هذا المجلد ({sortedCustomers.length})</span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">
                اضغط على العميل لفتح كشف حسابه في دفتر الديون
              </span>
            </div>

            {/* نمط العرض 1: GRID VIEW (شبكة بطاقات العملاء) */}
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {sortedCustomers.map((cust) => {
                  const debt = customerDebtMap.get(cust.id) || 0;
                  const isSelected = selectedCustomerIds.has(cust.id);

                  return (
                    <div
                      key={cust.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          toggleCustomerSelection(cust.id);
                        } else if (onSelectCustomer) {
                          onSelectCustomer(cust.id);
                        }
                      }}
                      className={`group relative flex flex-col justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? "ring-2 ring-amber-500 bg-amber-50/90 border-amber-300 shadow-sm"
                          : "bg-white border-slate-200/90 hover:border-blue-300 hover:shadow-md"
                      }`}
                      title={`فتح حساب: ${cust.name}`}
                    >
                      {/* رأس بطاقة العميل */}
                      <div className="flex items-start justify-between w-full">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center font-bold text-xs shadow-2xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            {cust.name.slice(0, 1)}
                          </div>
                          <div className="text-right">
                            <h4 className="text-xs font-bold text-slate-800 line-clamp-1 leading-tight">
                              {cust.name}
                            </h4>
                            {cust.phone ? (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                                <Phone className="w-2.5 h-2.5" />
                                {cust.phone}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">بدون هاتف</span>
                            )}
                          </div>
                        </div>

                        {/* خيار التحديد أو خيارات الزبون */}
                        <div onClick={(e) => e.stopPropagation()}>
                          {isSelectionMode ? (
                            <button
                              type="button"
                              onClick={(e) => toggleCustomerSelection(cust.id, e)}
                              className="text-amber-600 p-1"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 fill-amber-100" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerDeleteCustomer(cust);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                                title="حذف هذا الزبون ونقله لسلة المهملات"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setItemActionMenu({
                                    type: "customer",
                                    id: cust.id,
                                    name: cust.name,
                                  });
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* رصيد الدين المتبقي للعميل */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 text-[10px]">الرصيد المتبقي:</span>
                        <span
                          className={`font-black font-mono px-2 py-0.5 rounded-full text-[11px] ${
                            debt > 0
                              ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                          }`}
                        >
                          {debt > 0 ? `${debt.toLocaleString()} ${currency}` : "خالص"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* نمط العرض 2: LIST VIEW (قائمة رأسية للعملاء) */
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
                {sortedCustomers.map((cust) => {
                  const debt = customerDebtMap.get(cust.id) || 0;
                  const isSelected = selectedCustomerIds.has(cust.id);

                  return (
                    <div
                      key={cust.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          toggleCustomerSelection(cust.id);
                        } else if (onSelectCustomer) {
                          onSelectCustomer(cust.id);
                        }
                      }}
                      className={`flex items-center justify-between px-3 sm:px-4 py-2.5 transition-colors cursor-pointer ${
                        isSelected ? "bg-amber-50/90 font-medium" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isSelectionMode ? (
                          <button
                            type="button"
                            onClick={(e) => toggleCustomerSelection(cust.id, e)}
                            className="text-amber-600 p-0.5"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 fill-amber-100" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {cust.name.slice(0, 1)}
                          </div>
                        )}

                        <div className="text-right">
                          <h4 className="text-xs font-bold text-slate-800">{cust.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                            {cust.phone || cust.address || "بدون تفاصيل إضافية"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg ${
                            debt > 0 ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50"
                          }`}
                        >
                          {debt > 0 ? `${debt.toLocaleString()} ${currency}` : "خالص"}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDeleteCustomer(cust);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="حذف هذا الزبون ونقله لسلة المهملات"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setItemActionMenu({
                              type: "customer",
                              id: cust.id,
                              name: cust.name,
                            });
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        <ChevronLeft className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ========================================================
          نافذة الفرز (Sort Dialog / Modal)
          ======================================================== */}
      <AnimatePresence>
        {isSortModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl text-right font-sans"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-800">فرز محتويات المجلد</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSortModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                {[
                  { id: "name-asc", label: "الاسم (أ - ي)", by: "name", order: "asc" },
                  { id: "name-desc", label: "الاسم (ي - أ)", by: "name", order: "desc" },
                  { id: "date-desc", label: "التاريخ (الأحدث أولاً)", by: "date", order: "desc" },
                  { id: "date-asc", label: "التاريخ (الأقدم أولاً)", by: "date", order: "asc" },
                  { id: "balance-desc", label: "الرصيد المتبقي (الأعلى أولاً)", by: "balance", order: "desc" },
                  { id: "balance-asc", label: "الرصيد المتبقي (الأقل أولاً)", by: "balance", order: "asc" },
                  { id: "count-desc", label: "عدد العناصر (الأكثر محتويات)", by: "count", order: "desc" },
                ].map((opt) => {
                  const isCurrent = sortBy === opt.by && sortOrder === opt.order;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSortBy(opt.by as any);
                        setSortOrder(opt.order as any);
                        setIsSortModalOpen(false);
                        showToast(`تم تطبيق الفرز: ${opt.label}`);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? "bg-amber-500 text-white shadow-2xs"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isCurrent && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          نافذة إنشاء مجلد جديد (Add Folder Modal)
          - يوضع المجلد الجديد مباشرة داخل المجلد الحالي!
          ======================================================== */}
      <AnimatePresence>
        {isCreateFolderModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl text-right font-sans"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                    <FolderPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">إنشاء مجلد جديد</h3>
                    <p className="text-[10px] text-amber-800">
                      سيتم إنشاؤه داخل: {currentFolder ? currentFolder.name : "التخزين الداخلي"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateFolderModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSubfolder} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المجلد *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: الشتوية، تجار الجملة، أقساط شهرية..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-sans"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">لون المجلد</label>
                  <div className="flex items-center gap-2">
                    {[
                      { id: "amber", name: "عنبري", bg: "bg-amber-500" },
                      { id: "blue", name: "أزرق", bg: "bg-blue-500" },
                      { id: "emerald", name: "أخضر", bg: "bg-emerald-500" },
                      { id: "purple", name: "بنفسجي", bg: "bg-purple-500" },
                      { id: "rose", name: "وردي", bg: "bg-rose-500" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setNewFolderColor(c.id)}
                        className={`w-7 h-7 rounded-full ${c.bg} flex items-center justify-center transition-transform cursor-pointer ${
                          newFolderColor === c.id
                            ? "ring-2 ring-offset-2 ring-slate-800 scale-110"
                            : "opacity-75 hover:opacity-100"
                        }`}
                        title={c.name}
                      >
                        {newFolderColor === c.id && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateFolderModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    إنشاء المجلد
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          نافذة إضافة زبون جديد (Add Customer Modal)
          - يربط الزبون تلقائياً بالمجلد الحالي!
          ======================================================== */}
      <AnimatePresence>
        {isCreateCustomerModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl text-right font-sans"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">إضافة عميل جديد</h3>
                    <p className="text-[10px] text-blue-800">
                      سيتم ربطه بالمجلد: {currentFolder ? currentFolder.name : rootName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateCustomerModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateCustomer} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: علي الكرخي، شركة النور..."
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-sans"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    placeholder="0770XXXXXXX"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-sans"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / المنطقة</label>
                  <input
                    type="text"
                    placeholder="بغداد - المنصور"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-sans"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateCustomerModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    إضافة العميل
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          نافذة نقل العناصر (Move Items Modal)
          ======================================================== */}
      <AnimatePresence>
        {isMoveModalOpen && itemsToMove && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl text-right font-sans"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <FolderInput className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-800">
                    نقل {itemsToMove.folderIds.length + itemsToMove.customerIds.length} عنصر
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                اختر المجلد الهدف الذي ترغب في نقل العناصر إليه:
              </p>

              <div className="max-h-60 overflow-y-auto space-y-1 pr-1 mb-4">
                {/* خيار التخزين الداخلي (المستوى الجذري) */}
                <button
                  type="button"
                  onClick={() => setTargetMoveFolderId(null)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    targetMoveFolderId === null
                      ? "bg-amber-500 text-white shadow-2xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    <span>{rootName} (المستوى الرئيسي)</span>
                  </span>
                  {targetMoveFolderId === null && <Check className="w-4 h-4" />}
                </button>

                {/* بقية المجلدات المتاحة للنقل إليها */}
                {activeFolders
                  .filter((f) => !itemsToMove.folderIds.includes(f.id))
                  .map((f) => {
                    const isSelected = targetMoveFolderId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTargetMoveFolderId(f.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-amber-500 text-white shadow-2xs"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-amber-600" />
                          <span>{f.name}</span>
                        </span>
                        {isSelected && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleExecuteMove}
                  className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs"
                >
                  تنفيذ النقل
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          نافذة إعادة تسمية المجلد (Rename Modal)
          ======================================================== */}
      <AnimatePresence>
        {renameModalFolder && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl text-right font-sans"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <h3 className="font-bold text-sm text-slate-800">إعادة تسمية المجلد</h3>
                <button
                  type="button"
                  onClick={() => setRenameModalFolder(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleExecuteRename} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الجديد</label>
                  <input
                    type="text"
                    required
                    value={renameFolderInput}
                    onChange={(e) => setRenameFolderInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white font-sans"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRenameModalFolder(null)}
                    className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs"
                  >
                    حفظ التعديل
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          قائمة الإجراءات لعنصر مفرد (Single Item Action Menu)
          ======================================================== */}
      <AnimatePresence>
        {itemActionMenu && (
          <div
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-2xs flex items-center justify-center p-4 z-50"
            onClick={() => setItemActionMenu(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-3 w-full max-w-xs border border-slate-200 shadow-2xl text-right font-sans"
            >
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <span className="text-[10px] text-slate-400 font-bold">
                  {itemActionMenu.type === "folder" ? "خيارات المجلد" : "خيارات العميل"}
                </span>
                <h4 className="text-xs font-black text-slate-800 truncate">{itemActionMenu.name}</h4>
              </div>

              {itemActionMenu.type === "folder" ? (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigateTo(itemActionMenu.id);
                      setItemActionMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl"
                  >
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <span>فتح المجلد</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const f = folders.find((x) => x.id === itemActionMenu.id);
                      if (f) {
                        setRenameModalFolder(f);
                        setRenameFolderInput(f.name);
                      }
                      setItemActionMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl"
                  >
                    <Pencil className="w-4 h-4 text-slate-500" />
                    <span>إعادة تسمية</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const f = folders.find((x) => x.id === itemActionMenu.id);
                      if (f) toggleFolderFavoriteById(f);
                      setItemActionMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl"
                  >
                    <Star className="w-4 h-4 text-amber-500" />
                    <span>تبديل المفضلة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setItemsToMove({ folderIds: [itemActionMenu.id], customerIds: [] });
                      setTargetMoveFolderId(null);
                      setIsMoveModalOpen(true);
                      setItemActionMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl"
                  >
                    <Move className="w-4 h-4 text-blue-500" />
                    <span>نقل إلى مجلد آخر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const menuId = itemActionMenu.id;
                      const menuName = itemActionMenu.name;
                      setItemActionMenu(null);
                      const targetF = activeFolders.find((x) => x.id === menuId) || { id: menuId, name: menuName, color: "amber" };
                      triggerDeleteFolder(targetF);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف المجلد</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectCustomer) onSelectCustomer(itemActionMenu.id);
                      setItemActionMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-xl"
                  >
                    <User className="w-4 h-4" />
                    <span>فتح كشف الحساب في الدفتر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setItemsToMove({ folderIds: [], customerIds: [itemActionMenu.id] });
                      setTargetMoveFolderId(null);
                      setIsMoveModalOpen(true);
                      setItemActionMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl"
                  >
                    <Move className="w-4 h-4 text-blue-500" />
                    <span>نقل العميل إلى مجلد آخر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const menuId = itemActionMenu.id;
                      const menuName = itemActionMenu.name;
                      setItemActionMenu(null);
                      const targetC = activeCustomers.find((x) => x.id === menuId) || { id: menuId, name: menuName };
                      triggerDeleteCustomer(targetC);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف العميل</span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          نافذة تأكيد الحذف الآمن (Delete Confirm Modal)
          ======================================================== */}
      <DeleteConfirmModal
        isOpen={deleteConfirmState.isOpen}
        type={deleteConfirmState.type}
        itemName={deleteConfirmState.name}
        warningMessage={deleteConfirmState.warningMessage}
        itemDetails={deleteConfirmState.itemDetails}
        isPermanent={!!deleteConfirmState.isPermanent}
        onConfirm={() => {
          if (deleteConfirmState.onConfirmAction) {
            deleteConfirmState.onConfirmAction();
          }
          setDeleteConfirmState((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => {
          setDeleteConfirmState((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      {/* ========================================================
          إشعار التوست العائم (Toast Notification)
          ======================================================== */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-2xl z-50 flex items-center gap-2 border border-slate-700"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
