import { useState, useEffect, useRef } from "react";
import {
  Customer,
  CustomerFolder,
  Product,
  Invoice,
  Payment,
  SystemSettings,
  CustomerChangeLogItem,
  CloudBackupItem,
} from "../types";
import { formatChangeLogDateTime } from "../utils/changeLogUtils";
import {
  sampleCustomerFolders,
  sampleCustomers,
  sampleProducts,
  sampleInvoices,
  samplePayments,
  defaultSettings,
} from "../sampleData";
import { useAuth } from "../contexts/AuthContext";
import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from "../lib/firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { dispatchAccountingNotification } from "../lib/notifications";

// Helper to remove undefined properties which Firestore rejects
function cleanForFirestore<T>(data: T): any {
  return JSON.parse(
    JSON.stringify(data, (key, value) => (value === undefined ? null : value))
  );
}

export function useAccountingData() {
  const { currentUser } = useAuth();

  const [folders, setFolders] = useState<CustomerFolder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [changeLogs, setChangeLogs] = useState<CustomerChangeLogItem[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupItem[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Keep references to latest states to avoid stale closures in listeners
  const latestState = useRef({
    folders,
    customers,
    products,
    invoices,
    payments,
    changeLogs,
    settings,
  });

  useEffect(() => {
    latestState.current = {
      folders,
      customers,
      products,
      invoices,
      payments,
      changeLogs,
      settings,
    };
  });

  // Track active user ID to avoid race conditions on rapid user switching
  const activeUserIdRef = useRef<string | null>(currentUser?.uid || null);

  // Helper to scope storage keys per authenticated user or guest
  const getScopedKey = (entity: string, uid?: string | null) => {
    if (uid) {
      return `acc_u_${uid}_${entity}`;
    }
    return `acc_guest_${entity}`;
  };

  const saveScopedStorage = (entity: string, data: any) => {
    try {
      const key = getScopedKey(entity, currentUser?.uid);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("Scoped storage error:", e);
    }
  };

  // Load from Firestore when currentUser is available, or fallback to LocalStorage
  useEffect(() => {
    const currentUid = currentUser?.uid || null;
    activeUserIdRef.current = currentUid;

    // 1. Immediately wipe in-memory state on user switch to ensure zero data leakage between accounts
    setFolders([]);
    setCustomers([]);
    setProducts([]);
    setInvoices([]);
    setPayments([]);
    setChangeLogs([]);
    setCloudBackups([]);
    setSettings(defaultSettings);
    setLoading(true);

    if (!currentUser) {
      // LocalStorage mode for guest / before login (strictly scoped to guest keys)
      try {
        const guestFolders = localStorage.getItem(getScopedKey("folders", null));
        const guestCustomers = localStorage.getItem(getScopedKey("customers", null));
        const guestProducts = localStorage.getItem(getScopedKey("products", null));
        const guestInvoices = localStorage.getItem(getScopedKey("invoices", null));
        const guestPayments = localStorage.getItem(getScopedKey("payments", null));
        const guestChangeLogs = localStorage.getItem(getScopedKey("change_logs", null));
        const guestSettings = localStorage.getItem(getScopedKey("settings", null));

        if (guestCustomers && guestProducts && guestInvoices) {
          setFolders(guestFolders ? JSON.parse(guestFolders) : []);
          setCustomers(JSON.parse(guestCustomers));
          setProducts(JSON.parse(guestProducts));
          setInvoices(JSON.parse(guestInvoices));
          setPayments(guestPayments ? JSON.parse(guestPayments) : []);
          setChangeLogs(guestChangeLogs ? JSON.parse(guestChangeLogs) : []);
          setSettings(guestSettings ? JSON.parse(guestSettings) : defaultSettings);
        } else {
          setFolders([]);
          setCustomers([]);
          setProducts([]);
          setInvoices([]);
          setPayments([]);
          setChangeLogs([]);
          setSettings(defaultSettings);
        }
      } catch (e) {
        console.error("Error loading guest accounting data:", e);
      } finally {
        setLoading(false);
        setIsCloudSyncing(false);
      }
      return;
    }

    // Authenticated Mode: Real-time Cloud Firestore synchronization scoped to this user
    const userId = currentUser.uid;
    setIsCloudSyncing(true);

    // 2. Pre-hydrate from THIS user's scoped local cache for instantaneous rendering without cross-user leakage
    try {
      const cachedFolders = localStorage.getItem(getScopedKey("folders", userId));
      const cachedCustomers = localStorage.getItem(getScopedKey("customers", userId));
      const cachedProducts = localStorage.getItem(getScopedKey("products", userId));
      const cachedInvoices = localStorage.getItem(getScopedKey("invoices", userId));
      const cachedPayments = localStorage.getItem(getScopedKey("payments", userId));
      const cachedChangeLogs = localStorage.getItem(getScopedKey("change_logs", userId));
      const cachedSettings = localStorage.getItem(getScopedKey("settings", userId));

      if (cachedFolders) setFolders(JSON.parse(cachedFolders));
      if (cachedCustomers) setCustomers(JSON.parse(cachedCustomers));
      if (cachedProducts) setProducts(JSON.parse(cachedProducts));
      if (cachedInvoices) setInvoices(JSON.parse(cachedInvoices));
      if (cachedPayments) setPayments(JSON.parse(cachedPayments));
      if (cachedChangeLogs) setChangeLogs(JSON.parse(cachedChangeLogs));
      if (cachedSettings) setSettings(JSON.parse(cachedSettings));
    } catch (e) {
      console.warn("Could not read cached user data:", e);
    }

    const unsubscribers: (() => void)[] = [];

    // Background check for default settings (runs non-blocking to avoid stalling offline startup)
    const initializeCloudData = async () => {
      try {
        if (activeUserIdRef.current !== userId || !navigator.onLine) return;
        const settingsRef = doc(db, "users", userId, "settings", "general");
        const settingsSnap = await getDocs(collection(db, "users", userId, "settings"));
        if (settingsSnap.empty && activeUserIdRef.current === userId) {
          await setDoc(settingsRef, cleanForFirestore({ ...defaultSettings, userId }));
        }
      } catch (err) {
        console.info("Notice: Background settings initialization check:", err);
      }
    };
    initializeCloudData();

    // Attach real-time Firestore listeners immediately.
    // Thanks to Firestore Offline Persistence, listeners emit cached IndexedDB data in milliseconds.
    if (activeUserIdRef.current !== userId) return;

    // Helper to monitor pending write mutations across snapshots
    const checkSyncStatus = (snapshot: { metadata?: { hasPendingWrites?: boolean } }) => {
      if (snapshot.metadata?.hasPendingWrites) {
        setIsCloudSyncing(true);
      } else {
        setIsCloudSyncing(false);
      }
    };

    // 1. Folders Listener
    const unsubFolders = onSnapshot(
      collection(db, "users", userId, "folders"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: CustomerFolder[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as CustomerFolder;
          items.push({ ...d, userId });
        });
        const sorted = items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        setFolders(sorted);
        try {
          localStorage.setItem(getScopedKey("folders", userId), JSON.stringify(sorted));
        } catch {}
      },
      (err) => console.warn("Folders snapshot notice:", err)
    );
    unsubscribers.push(unsubFolders);

    // 2. Customers Listener
    const unsubCustomers = onSnapshot(
      collection(db, "users", userId, "customers"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: Customer[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as Customer;
          items.push({ ...d, userId });
        });
        const sorted = items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setCustomers(sorted);
        try {
          localStorage.setItem(getScopedKey("customers", userId), JSON.stringify(sorted));
        } catch {}
      },
      (err) => console.warn("Customers snapshot notice:", err)
    );
    unsubscribers.push(unsubCustomers);

    // 3. Products Listener
    const unsubProducts = onSnapshot(
      collection(db, "users", userId, "products"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: Product[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as Product;
          items.push({ ...d, userId });
        });
        setProducts(items);
        try {
          localStorage.setItem(getScopedKey("products", userId), JSON.stringify(items));
        } catch {}
      },
      (err) => console.warn("Products snapshot notice:", err)
    );
    unsubscribers.push(unsubProducts);

    // 4. Invoices Listener
    const unsubInvoices = onSnapshot(
      collection(db, "users", userId, "invoices"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: Invoice[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as Invoice;
          items.push({ ...d, userId });
        });
        const sorted = items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setInvoices(sorted);
        try {
          localStorage.setItem(getScopedKey("invoices", userId), JSON.stringify(sorted));
        } catch {}
      },
      (err) => console.warn("Invoices snapshot notice:", err)
    );
    unsubscribers.push(unsubInvoices);

    // 5. Payments Listener
    const unsubPayments = onSnapshot(
      collection(db, "users", userId, "payments"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: Payment[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as Payment;
          items.push({ ...d, userId });
        });
        const sorted = items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setPayments(sorted);
        try {
          localStorage.setItem(getScopedKey("payments", userId), JSON.stringify(sorted));
        } catch {}
      },
      (err) => console.warn("Payments snapshot notice:", err)
    );
    unsubscribers.push(unsubPayments);

    // 6. Settings Listener
    const unsubSettings = onSnapshot(
      doc(db, "users", userId, "settings", "general"),
      (docSnap) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(docSnap);
        if (docSnap.exists()) {
          const d = docSnap.data() as SystemSettings;
          setSettings({ ...d, userId });
          try {
            localStorage.setItem(getScopedKey("settings", userId), JSON.stringify({ ...d, userId }));
          } catch {}
        } else {
          setSettings({ ...defaultSettings, userId });
        }
      },
      (err) => console.warn("Settings snapshot notice:", err)
    );
    unsubscribers.push(unsubSettings);

    // 7. Customer ChangeLogs Listener
    const unsubChangeLogs = onSnapshot(
      collection(db, "users", userId, "changeLogs"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: CustomerChangeLogItem[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as CustomerChangeLogItem;
          items.push({ ...d, userId });
        });
        const sorted = items.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setChangeLogs(sorted);
        try {
          localStorage.setItem(getScopedKey("change_logs", userId), JSON.stringify(sorted));
        } catch {}
      },
      (err) => console.warn("ChangeLogs snapshot notice:", err)
    );
    unsubscribers.push(unsubChangeLogs);

    // 8. Cloud Backups Listener
    const unsubBackups = onSnapshot(
      collection(db, "users", userId, "backups"),
      (snapshot) => {
        if (activeUserIdRef.current !== userId) return;
        checkSyncStatus(snapshot);
        const items: CloudBackupItem[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as CloudBackupItem;
          items.push({ ...d, userId });
        });
        const sorted = items.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCloudBackups(sorted);
      },
      (err) => console.warn("Backups snapshot notice:", err)
    );
    unsubscribers.push(unsubBackups);

    // Finish initial loading state immediately since cache hydration is active
    setLoading(false);
    setIsCloudSyncing(false);

    return () => {
      activeUserIdRef.current = null;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [currentUser]);

  // Firestore & local saving helpers
  const saveToFirestoreDoc = async (subcollection: string, docId: string, data: any) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/${subcollection}/${docId}`;
    try {
      await setDoc(doc(db, "users", currentUser.uid, subcollection, docId), cleanForFirestore({
        ...data,
        userId: currentUser.uid,
      }));
    } catch (err) {
      console.warn("Firestore save warning at path:", path, err);
    }
  };

  const deleteFromFirestoreDoc = async (subcollection: string, docId: string) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/${subcollection}/${docId}`;
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, subcollection, docId));
    } catch (err) {
      console.warn("Firestore delete warning at path:", path, err);
    }
  };

  // Folders actions
  const addFolder = (folder: CustomerFolder | Omit<CustomerFolder, "id" | "createdAt">): CustomerFolder => {
    const newFolder: CustomerFolder = {
      ...folder,
      id: "id" in folder && folder.id ? folder.id : `folder-${Date.now()}`,
      createdAt: "createdAt" in folder && folder.createdAt ? folder.createdAt : new Date().toISOString(),
      parentId: folder.parentId || null,
      userId: currentUser?.uid,
    };

    setFolders((prev) => {
      const next = [...prev, newFolder];
      saveScopedStorage("folders", next);
      return next;
    });

    if (currentUser) {
      saveToFirestoreDoc("folders", newFolder.id, newFolder).catch((e) => console.error(e));
    }
    return newFolder;
  };

  const updateFolder = async (updated: CustomerFolder) => {
    const folderWithUser = { ...updated, userId: currentUser?.uid };
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === updated.id ? folderWithUser : f));
      saveScopedStorage("folders", next);
      return next;
    });

    if (currentUser) {
      await saveToFirestoreDoc("folders", updated.id, folderWithUser);
    }
  };

  // Folders & Customers Trash / Soft Delete System
  const moveToTrashFolder = async (folderId: string) => {
    const now = new Date().toISOString();
    const idsToTrash = new Set<string>();

    let updatedFoldersSnapshot: CustomerFolder[] = [];
    setFolders((prevFolders) => {
      const gatherChildren = (id: string) => {
        idsToTrash.add(id);
        prevFolders
          .filter((f) => f.parentId === id || f.originalParentId === id)
          .forEach((child) => gatherChildren(child.id));
      };
      gatherChildren(folderId);

      const next = prevFolders.map((f) => {
        if (idsToTrash.has(f.id)) {
          return {
            ...f,
            isDeleted: true,
            deletedAt: now,
            originalParentId: f.originalParentId !== undefined ? f.originalParentId : (f.parentId || null),
            userId: currentUser?.uid,
          };
        }
        return f;
      });
      updatedFoldersSnapshot = next;
      saveScopedStorage("folders", next);
      return next;
    });

    let updatedCustomersSnapshot: Customer[] = [];
    setCustomers((prevCustomers) => {
      const next = prevCustomers.map((c) => {
        if (c.folderId && idsToTrash.has(c.folderId)) {
          return {
            ...c,
            isDeleted: true,
            deletedAt: now,
            originalFolderId: c.originalFolderId !== undefined ? c.originalFolderId : (c.folderId || null),
            userId: currentUser?.uid,
          };
        }
        return c;
      });
      updatedCustomersSnapshot = next;
      saveScopedStorage("customers", next);
      return next;
    });

    if (currentUser) {
      try {
        for (const f of updatedFoldersSnapshot.filter((x) => idsToTrash.has(x.id))) {
          await saveToFirestoreDoc("folders", f.id, f);
        }
        for (const c of updatedCustomersSnapshot.filter((x) => x.folderId && idsToTrash.has(x.folderId))) {
          await saveToFirestoreDoc("customers", c.id, c);
        }
      } catch (err) {
        console.warn("Firestore sync warning during moveToTrashFolder:", err);
      }
    }
  };

  const deleteFolder = moveToTrashFolder;

  const restoreFolder = async (folderId: string) => {
    let idsToRestore = new Set<string>();
    let allFolderIdsToRestore = new Set<string>();
    let updatedFoldersSnapshot: CustomerFolder[] = [];

    setFolders((prevFolders) => {
      const targetF = prevFolders.find((f) => f.id === folderId);
      if (!targetF) return prevFolders;

      const gatherChildren = (id: string) => {
        idsToRestore.add(id);
        prevFolders
          .filter((f) => f.parentId === id || f.originalParentId === id)
          .forEach((child) => gatherChildren(child.id));
      };
      gatherChildren(folderId);

      // Also restore parent chain if parent folder was also in trash
      let currentParentId = targetF.originalParentId || targetF.parentId || null;
      const parentFoldersToRestore = new Set<string>();
      while (currentParentId) {
        const pFolder = prevFolders.find((f) => f.id === currentParentId);
        if (pFolder && pFolder.isDeleted) {
          parentFoldersToRestore.add(pFolder.id);
          currentParentId = pFolder.originalParentId || pFolder.parentId || null;
        } else {
          break;
        }
      }

      allFolderIdsToRestore = new Set([...idsToRestore, ...parentFoldersToRestore]);

      const next = prevFolders.map((f) => {
        if (allFolderIdsToRestore.has(f.id)) {
          return {
            ...f,
            isDeleted: false,
            deletedAt: undefined,
            parentId: f.originalParentId !== undefined ? f.originalParentId : f.parentId,
            userId: currentUser?.uid,
          };
        }
        return f;
      });
      updatedFoldersSnapshot = next;
      saveScopedStorage("folders", next);
      return next;
    });

    let updatedCustomersSnapshot: Customer[] = [];
    setCustomers((prevCustomers) => {
      const next = prevCustomers.map((c) => {
        if (c.isDeleted && ((c.folderId && allFolderIdsToRestore.has(c.folderId)) || (c.originalFolderId && allFolderIdsToRestore.has(c.originalFolderId)))) {
          return {
            ...c,
            isDeleted: false,
            deletedAt: undefined,
            folderId: c.originalFolderId || c.folderId,
            userId: currentUser?.uid,
          };
        }
        return c;
      });
      updatedCustomersSnapshot = next;
      saveScopedStorage("customers", next);
      return next;
    });

    if (currentUser) {
      try {
        for (const f of updatedFoldersSnapshot.filter((x) => allFolderIdsToRestore.has(x.id))) {
          await saveToFirestoreDoc("folders", f.id, f);
        }
        for (const c of updatedCustomersSnapshot.filter((x) => x.folderId && allFolderIdsToRestore.has(x.folderId))) {
          await saveToFirestoreDoc("customers", c.id, c);
        }
      } catch (err) {
        console.warn("Firestore sync warning during restoreFolder:", err);
      }
    }
  };

  const permanentDeleteFolder = async (folderId: string) => {
    const idsToDelete = new Set<string>();

    setFolders((prevFolders) => {
      const gatherChildren = (id: string) => {
        idsToDelete.add(id);
        prevFolders
          .filter((f) => f.parentId === id || f.originalParentId === id)
          .forEach((child) => gatherChildren(child.id));
      };
      gatherChildren(folderId);

      const next = prevFolders.filter((f) => !idsToDelete.has(f.id));
      saveScopedStorage("folders", next);
      return next;
    });

    let remainingCustomersSnapshot: Customer[] = [];
    setCustomers((prevCustomers) => {
      const next = prevCustomers.filter((c) => {
        const isInside = (c.folderId && idsToDelete.has(c.folderId)) || (c.originalFolderId && idsToDelete.has(c.originalFolderId));
        return !(isInside && c.isDeleted);
      }).map((c) => {
        if ((c.folderId && idsToDelete.has(c.folderId)) || (c.originalFolderId && idsToDelete.has(c.originalFolderId))) {
          return { ...c, folderId: undefined, originalFolderId: null };
        }
        return c;
      });
      remainingCustomersSnapshot = next;
      saveScopedStorage("customers", next);
      return next;
    });

    if (currentUser) {
      try {
        for (const id of Array.from(idsToDelete)) {
          await deleteFromFirestoreDoc("folders", id);
        }
        for (const c of remainingCustomersSnapshot) {
          if (!c.folderId) {
            await saveToFirestoreDoc("customers", c.id, c);
          }
        }
      } catch (err) {
        console.warn("Firestore sync warning during permanentDeleteFolder:", err);
      }
    }
  };

  const reorderFolders = async (newFolders: CustomerFolder[]) => {
    setFolders(newFolders);
    saveScopedStorage("folders", newFolders);
    if (currentUser) {
      for (const f of newFolders) {
        await saveToFirestoreDoc("folders", f.id, f);
      }
    }
  };

  // Customers actions
  const addCustomer = (customer: Omit<Customer, "id" | "createdAt">): Customer => {
    const newCustomer: Customer = {
      ...customer,
      id: `cust-${Date.now()}`,
      createdAt: new Date().toISOString(),
      userId: currentUser?.uid,
    };
    setCustomers((prev) => {
      const next = [newCustomer, ...prev];
      saveScopedStorage("customers", next);
      return next;
    });

    if (currentUser) {
      saveToFirestoreDoc("customers", newCustomer.id, newCustomer).catch((e) => console.error(e));
    }
    return newCustomer;
  };

  const updateCustomer = async (updated: Customer) => {
    const custWithUser = { ...updated, userId: currentUser?.uid };
    setCustomers((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? custWithUser : c));
      saveScopedStorage("customers", next);
      return next;
    });

    if (currentUser) {
      await saveToFirestoreDoc("customers", updated.id, custWithUser);
    }
  };

  const moveToTrashCustomer = async (id: string) => {
    const now = new Date().toISOString();
    let targetCustomerSnapshot: Customer | undefined;

    setCustomers((prevCustomers) => {
      const next = prevCustomers.map((c) => {
        if (c.id === id) {
          const updated = {
            ...c,
            isDeleted: true,
            deletedAt: now,
            originalFolderId: c.originalFolderId !== undefined ? c.originalFolderId : (c.folderId || null),
            userId: currentUser?.uid,
          };
          targetCustomerSnapshot = updated;
          return updated;
        }
        return c;
      });
      saveScopedStorage("customers", next);
      return next;
    });

    if (currentUser) {
      try {
        const target = targetCustomerSnapshot || customers.find((c) => c.id === id);
        if (target) {
          await saveToFirestoreDoc("customers", target.id, target);
        }
      } catch (err) {
        console.warn("Firestore sync warning during moveToTrashCustomer:", err);
      }
    }
  };

  const deleteCustomer = moveToTrashCustomer;

  const restoreCustomer = async (id: string) => {
    let foldersToRestore = new Set<string>();
    let updatedFoldersSnapshot: CustomerFolder[] = [];

    setCustomers((prevCustomers) => {
      const targetC = prevCustomers.find((c) => c.id === id);
      if (!targetC) return prevCustomers;

      const origFolderId = targetC.originalFolderId || targetC.folderId;
      if (origFolderId) {
        let curr: string | null = origFolderId;
        while (curr) {
          const f = folders.find((x) => x.id === curr);
          if (f && f.isDeleted) {
            foldersToRestore.add(f.id);
            curr = f.originalParentId || f.parentId || null;
          } else {
            break;
          }
        }
      }

      const next = prevCustomers.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            isDeleted: false,
            deletedAt: undefined,
            folderId: c.originalFolderId !== undefined ? (c.originalFolderId || undefined) : c.folderId,
            userId: currentUser?.uid,
          };
        }
        return c;
      });
      saveScopedStorage("customers", next);
      return next;
    });

    if (foldersToRestore.size > 0) {
      setFolders((prevFolders) => {
        const next = prevFolders.map((f) => {
          if (foldersToRestore.has(f.id)) {
            return {
              ...f,
              isDeleted: false,
              deletedAt: undefined,
              parentId: f.originalParentId !== undefined ? f.originalParentId : f.parentId,
              userId: currentUser?.uid,
            };
          }
          return f;
        });
        updatedFoldersSnapshot = next;
        saveScopedStorage("folders", next);
        return next;
      });
    }

    if (currentUser) {
      try {
        for (const f of updatedFoldersSnapshot.filter((x) => foldersToRestore.has(x.id))) {
          await saveToFirestoreDoc("folders", f.id, f);
        }
        const updatedTarget = customers.find((c) => c.id === id);
        if (updatedTarget) {
          await saveToFirestoreDoc("customers", updatedTarget.id, {
            ...updatedTarget,
            isDeleted: false,
            deletedAt: undefined,
            folderId: updatedTarget.originalFolderId !== undefined ? (updatedTarget.originalFolderId || undefined) : updatedTarget.folderId,
            userId: currentUser.uid,
          });
        }
      } catch (err) {
        console.warn("Firestore sync warning during restoreCustomer:", err);
      }
    }
  };

  const permanentDeleteCustomer = async (id: string) => {
    setCustomers((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveScopedStorage("customers", next);
      return next;
    });

    setInvoices((prev) => {
      const next = prev.filter((inv) => inv.customerId !== id);
      saveScopedStorage("invoices", next);
      return next;
    });

    setPayments((prev) => {
      const next = prev.filter((p) => p.customerId !== id);
      saveScopedStorage("payments", next);
      return next;
    });

    if (currentUser) {
      try {
        await deleteFromFirestoreDoc("customers", id);
        const invoicesToDelete = invoices.filter((inv) => inv.customerId === id);
        for (const inv of invoicesToDelete) {
          await deleteFromFirestoreDoc("invoices", inv.id);
        }
        const paymentsToDelete = payments.filter((p) => p.customerId === id);
        for (const p of paymentsToDelete) {
          await deleteFromFirestoreDoc("payments", p.id);
        }
      } catch (err) {
        console.warn("Firestore sync warning during permanentDeleteCustomer:", err);
      }
    }
  };

  // Batch operations for Trash
  const batchMoveToTrash = async (folderIds: string[], customerIds: string[]) => {
    for (const fId of folderIds) {
      await moveToTrashFolder(fId);
    }
    for (const cId of customerIds) {
      await moveToTrashCustomer(cId);
    }
  };

  const batchRestore = async (folderIds: string[], customerIds: string[]) => {
    for (const fId of folderIds) {
      await restoreFolder(fId);
    }
    for (const cId of customerIds) {
      await restoreCustomer(cId);
    }
  };

  const batchPermanentDelete = async (folderIds: string[], customerIds: string[]) => {
    for (const fId of folderIds) {
      await permanentDeleteFolder(fId);
    }
    for (const cId of customerIds) {
      await permanentDeleteCustomer(cId);
    }
  };

  const emptyTrash = async () => {
    const deletedFolderIds = folders.filter((f) => f.isDeleted).map((f) => f.id);
    const deletedCustomerIds = customers.filter((c) => c.isDeleted).map((c) => c.id);
    await batchPermanentDelete(deletedFolderIds, deletedCustomerIds);
  };

  const restoreAllTrash = async () => {
    const deletedFolderIds = folders.filter((f) => f.isDeleted).map((f) => f.id);
    const deletedCustomerIds = customers.filter((c) => c.isDeleted).map((c) => c.id);
    await batchRestore(deletedFolderIds, deletedCustomerIds);
  };

  // Products actions
  const addProduct = (product: Omit<Product, "id">): Product => {
    const newProduct: Product = {
      ...product,
      id: `prod-${Date.now()}`,
      userId: currentUser?.uid,
    };
    setProducts((prev) => {
      const next = [newProduct, ...prev];
      saveScopedStorage("products", next);
      return next;
    });

    if (currentUser) {
      saveToFirestoreDoc("products", newProduct.id, newProduct).catch((e) => console.error(e));
    }
    return newProduct;
  };

  const updateProduct = async (updated: Product) => {
    const prodWithUser = { ...updated, userId: currentUser?.uid };
    setProducts((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? prodWithUser : p));
      saveScopedStorage("products", next);
      return next;
    });

    if (currentUser) {
      await saveToFirestoreDoc("products", updated.id, prodWithUser);
    }
  };

  const deleteProduct = async (id: string) => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveScopedStorage("products", next);
      return next;
    });

    if (currentUser) {
      await deleteFromFirestoreDoc("products", id);
    }
  };

  // Invoices actions
  const addInvoice = (invoice: Omit<Invoice, "id" | "createdAt">): Invoice => {
    const newInvoice: Invoice = {
      ...invoice,
      id: `inv-${Date.now()}`,
      createdAt: new Date().toISOString(),
      userId: currentUser?.uid,
    };

    setInvoices((prev) => {
      const next = [newInvoice, ...prev];
      saveScopedStorage("invoices", next);
      return next;
    });

    if (currentUser) {
      saveToFirestoreDoc("invoices", newInvoice.id, newInvoice).catch((e) => console.error(e));
    }

    // Update quantities of products if linked
    const updatedProducts = [...products];
    let productsChanged = false;
    newInvoice.items.forEach((item) => {
      if (item.productId) {
        const prodIndex = updatedProducts.findIndex((p) => p.id === item.productId);
        if (prodIndex > -1) {
          updatedProducts[prodIndex] = {
            ...updatedProducts[prodIndex],
            quantity: Math.max(0, updatedProducts[prodIndex].quantity - item.quantity),
          };
          productsChanged = true;
        }
      }
    });

    if (productsChanged) {
      setProducts(updatedProducts);
      saveScopedStorage("products", updatedProducts);
      if (currentUser) {
        for (const p of updatedProducts) {
          saveToFirestoreDoc("products", p.id, p).catch((e) => console.error(e));
        }
      }
    }

    // If there is an initial payment, record it
    if (newInvoice.paidAmount > 0) {
      const newPayment: Payment = {
        id: `pay-${Date.now()}`,
        customerId: newInvoice.customerId,
        customerName: newInvoice.customerName,
        amount: newInvoice.paidAmount,
        date: newInvoice.date,
        method: "نقدي",
        notes: `دفعة مقدمة مع الفاتورة ${newInvoice.invoiceNumber}`,
        invoiceId: newInvoice.id,
        createdAt: new Date().toISOString(),
        userId: currentUser?.uid,
      };

      setPayments((prev) => {
        const next = [newPayment, ...prev];
        saveScopedStorage("payments", next);
        return next;
      });

      if (currentUser) {
        saveToFirestoreDoc("payments", newPayment.id, newPayment).catch((e) => console.error(e));
      }
    }

    // 🔔 Trigger Notification for Event 1: إضافة دين أو قيد جديد
    if (currentUser) {
      const custName = newInvoice.customerName || "عميل";
      const grandAmt = Number(newInvoice.grandTotal || 0).toLocaleString();
      const curr = settings?.currency || "د.ع";
      const itemsCount = (newInvoice.items || []).filter((it) => !it.isSeparator && !it.isPaymentRow && !it.isRemainingRow).length;
      const itemsDesc = itemsCount > 0 ? ` (${itemsCount} مادة)` : "";

      dispatchAccountingNotification(currentUser.uid, {
        id: `notif_debt_${newInvoice.id}`,
        title: `قيد دين جديد: ${custName}`,
        body: `تم تسجيل دين جديد بقيمة ${grandAmt} ${curr}${itemsDesc} في القائمة رقم ${newInvoice.invoiceNumber || ""}`.trim(),
        category: "debts",
        data: {
          invoiceId: newInvoice.id,
          customerId: newInvoice.customerId,
          customerName: custName,
          amount: newInvoice.grandTotal,
          type: "new_debt",
        },
      }).catch((e) => console.warn("Failed to dispatch invoice notification:", e));
    }

    return newInvoice;
  };

  const updateInvoice = async (updated: Invoice) => {
    const oldInvoice = invoices.find((inv) => inv.id === updated.id);
    if (!oldInvoice) return;

    // Adjust product stocks
    const updatedProducts = [...products];
    let productsChanged = false;

    oldInvoice.items.forEach((item) => {
      if (item.productId) {
        const prodIndex = updatedProducts.findIndex((p) => p.id === item.productId);
        if (prodIndex > -1) {
          updatedProducts[prodIndex] = {
            ...updatedProducts[prodIndex],
            quantity: updatedProducts[prodIndex].quantity + item.quantity,
          };
          productsChanged = true;
        }
      }
    });

    updated.items.forEach((item) => {
      if (item.productId) {
        const prodIndex = updatedProducts.findIndex((p) => p.id === item.productId);
        if (prodIndex > -1) {
          updatedProducts[prodIndex] = {
            ...updatedProducts[prodIndex],
            quantity: Math.max(0, updatedProducts[prodIndex].quantity - item.quantity),
          };
          productsChanged = true;
        }
      }
    });

    if (productsChanged) {
      setProducts(updatedProducts);
      saveScopedStorage("products", updatedProducts);
      if (currentUser) {
        for (const p of updatedProducts) {
          await saveToFirestoreDoc("products", p.id, p);
        }
      }
    }

    // Adjust associated payment
    const linkedPayment = payments.find((p) => p.invoiceId === updated.id);
    if (linkedPayment) {
      if (updated.paidAmount > 0) {
        const updatedPayment = { ...linkedPayment, amount: updated.paidAmount, date: updated.date, userId: currentUser?.uid };
        setPayments((prev) => {
          const next = prev.map((p) => (p.id === linkedPayment.id ? updatedPayment : p));
          saveScopedStorage("payments", next);
          return next;
        });
        if (currentUser) {
          await saveToFirestoreDoc("payments", updatedPayment.id, updatedPayment);
        }
      } else {
        setPayments((prev) => {
          const next = prev.filter((p) => p.id !== linkedPayment.id);
          saveScopedStorage("payments", next);
          return next;
        });
        if (currentUser) {
          await deleteFromFirestoreDoc("payments", linkedPayment.id);
        }
      }
    } else if (updated.paidAmount > 0) {
      const newPayment: Payment = {
        id: `pay-${Date.now()}`,
        customerId: updated.customerId,
        customerName: updated.customerName,
        amount: updated.paidAmount,
        date: updated.date,
        method: "نقدي",
        notes: `دفعة مقدمة مع الفاتورة ${updated.invoiceNumber} (معدلة)`,
        invoiceId: updated.id,
        createdAt: new Date().toISOString(),
        userId: currentUser?.uid,
      };
      setPayments((prev) => {
        const next = [newPayment, ...prev];
        saveScopedStorage("payments", next);
        return next;
      });
      if (currentUser) {
        await saveToFirestoreDoc("payments", newPayment.id, newPayment);
      }
    }

    const invWithUser = { ...updated, userId: currentUser?.uid };
    setInvoices((prev) => {
      const next = prev.map((inv) => (inv.id === updated.id ? invWithUser : inv));
      saveScopedStorage("invoices", next);
      return next;
    });

    if (currentUser) {
      await saveToFirestoreDoc("invoices", updated.id, invWithUser);
    }
  };

  const deleteInvoice = async (id: string) => {
    const invoice = invoices.find((inv) => inv.id === id);
    if (invoice) {
      const updatedProducts = [...products];
      let productsChanged = false;
      invoice.items.forEach((item) => {
        if (item.productId) {
          const prodIndex = updatedProducts.findIndex((p) => p.id === item.productId);
          if (prodIndex > -1) {
            updatedProducts[prodIndex] = {
              ...updatedProducts[prodIndex],
              quantity: updatedProducts[prodIndex].quantity + item.quantity,
            };
            productsChanged = true;
          }
        }
      });
      if (productsChanged) {
        setProducts(updatedProducts);
        saveScopedStorage("products", updatedProducts);
        if (currentUser) {
          for (const p of updatedProducts) {
            await saveToFirestoreDoc("products", p.id, p);
          }
        }
      }
    }

    setInvoices((prev) => {
      const next = prev.filter((inv) => inv.id !== id);
      saveScopedStorage("invoices", next);
      return next;
    });

    const linkedPayments = payments.filter((p) => p.invoiceId === id);
    setPayments((prev) => {
      const next = prev.filter((p) => p.invoiceId !== id);
      saveScopedStorage("payments", next);
      return next;
    });

    if (currentUser) {
      await deleteFromFirestoreDoc("invoices", id);
      for (const p of linkedPayments) {
        await deleteFromFirestoreDoc("payments", p.id);
      }
    }
  };

  // Payments actions
  const addPayment = (payment: Omit<Payment, "id" | "createdAt">): Payment => {
    const newPayment: Payment = {
      ...payment,
      id: `pay-${Date.now()}`,
      createdAt: new Date().toISOString(),
      userId: currentUser?.uid,
    };

    setPayments((prev) => {
      const next = [newPayment, ...prev];
      saveScopedStorage("payments", next);
      return next;
    });

    if (currentUser) {
      saveToFirestoreDoc("payments", newPayment.id, newPayment).catch((e) => console.error(e));
    }

    // Update invoice remaining amounts
    let updatedInvoices = [...invoices];
    if (newPayment.invoiceId) {
      updatedInvoices = updatedInvoices.map((inv) => {
        if (inv.id === newPayment.invoiceId) {
          const newPaid = inv.paidAmount + newPayment.amount;
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: Math.max(0, inv.grandTotal - newPaid),
          };
        }
        return inv;
      });
    } else {
      let remainingPayment = newPayment.amount;
      updatedInvoices = updatedInvoices.map((inv) => {
        if (inv.customerId === newPayment.customerId && inv.remainingAmount > 0 && remainingPayment > 0) {
          const toPay = Math.min(inv.remainingAmount, remainingPayment);
          remainingPayment -= toPay;
          const newPaid = inv.paidAmount + toPay;
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: inv.grandTotal - newPaid,
          };
        }
        return inv;
      });
    }

    setInvoices(updatedInvoices);
    saveScopedStorage("invoices", updatedInvoices);
    if (currentUser) {
      for (const inv of updatedInvoices) {
        saveToFirestoreDoc("invoices", inv.id, inv).catch((e) => console.error(e));
      }

      // 🔔 Trigger Notification for Event 2: تسجيل دفعة أو سند قبض
      const custName = newPayment.customerName || "العميل";
      const payAmt = Number(newPayment.amount || 0).toLocaleString();
      const curr = settings?.currency || "د.ع";
      const methodText = newPayment.method ? ` (${newPayment.method})` : "";
      const notesDesc = newPayment.notes ? ` — ${newPayment.notes}` : "";

      dispatchAccountingNotification(currentUser.uid, {
        id: `notif_payment_${newPayment.id}`,
        title: `سند قبض / دفعة مسجلة: ${custName}`,
        body: `تم استلام دفعة نقدية بقيمة ${payAmt} ${curr}${methodText}${notesDesc}`.trim(),
        category: "payments",
        data: {
          paymentId: newPayment.id,
          customerId: newPayment.customerId,
          customerName: custName,
          amount: newPayment.amount,
          method: newPayment.method,
          type: "payment_receipt",
        },
      }).catch((e) => console.warn("Failed to dispatch payment notification:", e));
    }

    return newPayment;
  };

  const deletePayment = async (id: string) => {
    const payment = payments.find((p) => p.id === id);
    if (payment) {
      let updatedInvoices = [...invoices];
      if (payment.invoiceId) {
        updatedInvoices = updatedInvoices.map((inv) => {
          if (inv.id === payment.invoiceId) {
            const newPaid = Math.max(0, inv.paidAmount - payment.amount);
            return {
              ...inv,
              paidAmount: newPaid,
              remainingAmount: inv.grandTotal - newPaid,
            };
          }
          return inv;
        });
      } else {
        let remainingRevert = payment.amount;
        updatedInvoices = [...invoices].reverse().map((inv) => {
          if (inv.customerId === payment.customerId && inv.paidAmount > 0 && remainingRevert > 0) {
            const toRevert = Math.min(inv.paidAmount, remainingRevert);
            remainingRevert -= toRevert;
            const newPaid = inv.paidAmount - toRevert;
            return {
              ...inv,
              paidAmount: newPaid,
              remainingAmount: inv.grandTotal - newPaid,
            };
          }
          return inv;
        });
        updatedInvoices.reverse();
      }

      setInvoices(updatedInvoices);
      saveScopedStorage("invoices", updatedInvoices);
      if (currentUser) {
        for (const inv of updatedInvoices) {
          await saveToFirestoreDoc("invoices", inv.id, inv);
        }
      }
    }

    setPayments((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveScopedStorage("payments", next);
      return next;
    });

    if (currentUser) {
      await deleteFromFirestoreDoc("payments", id);
    }
  };

  const updateSettings = async (newSettings: SystemSettings) => {
    const settingsWithUser = { ...newSettings, userId: currentUser?.uid };
    setSettings(settingsWithUser);
    saveScopedStorage("settings", settingsWithUser);
    if (currentUser) {
      const path = `users/${currentUser.uid}/settings/general`;
      try {
        await setDoc(doc(db, "users", currentUser.uid, "settings", "general"), cleanForFirestore(settingsWithUser));
      } catch (err) {
        console.warn("Firestore settings save warning at path:", path, err);
      }
    }
  };

  const importData = (jsonData: string): { success: boolean; counts?: any; error?: string } => {
    try {
      const data = JSON.parse(jsonData);
      const payload = data.data || data;

      if (
        payload &&
        Array.isArray(payload.customers) &&
        Array.isArray(payload.products) &&
        Array.isArray(payload.invoices) &&
        Array.isArray(payload.payments)
      ) {
        const uid = currentUser?.uid;
        const newSettings = { ...(payload.settings || settings || defaultSettings), userId: uid };
        const newFolders = (Array.isArray(payload.folders) ? payload.folders : folders).map((f: CustomerFolder) => ({ ...f, userId: uid }));
        const newCustomers = payload.customers.map((c: Customer) => ({ ...c, userId: uid }));
        const newProducts = payload.products.map((p: Product) => ({ ...p, userId: uid }));
        const newInvoices = payload.invoices.map((inv: Invoice) => ({ ...inv, userId: uid }));
        const newPayments = payload.payments.map((pay: Payment) => ({ ...pay, userId: uid }));

        setFolders(newFolders);
        setCustomers(newCustomers);
        setProducts(newProducts);
        setInvoices(newInvoices);
        setPayments(newPayments);
        setSettings(newSettings);

        saveScopedStorage("folders", newFolders);
        saveScopedStorage("customers", newCustomers);
        saveScopedStorage("products", newProducts);
        saveScopedStorage("invoices", newInvoices);
        saveScopedStorage("payments", newPayments);
        saveScopedStorage("settings", newSettings);

        if (currentUser) {
          const batch = writeBatch(db);
          newFolders.forEach((f: CustomerFolder) => {
            const ref = doc(db, "users", currentUser.uid, "folders", f.id);
            batch.set(ref, cleanForFirestore({ ...f, userId: currentUser.uid }));
          });
          newCustomers.forEach((c: Customer) => {
            const ref = doc(db, "users", currentUser.uid, "customers", c.id);
            batch.set(ref, cleanForFirestore({ ...c, userId: currentUser.uid }));
          });
          newProducts.forEach((p: Product) => {
            const ref = doc(db, "users", currentUser.uid, "products", p.id);
            batch.set(ref, cleanForFirestore({ ...p, userId: currentUser.uid }));
          });
          newInvoices.forEach((inv: Invoice) => {
            const ref = doc(db, "users", currentUser.uid, "invoices", inv.id);
            batch.set(ref, cleanForFirestore({ ...inv, userId: currentUser.uid }));
          });
          newPayments.forEach((pay: Payment) => {
            const ref = doc(db, "users", currentUser.uid, "payments", pay.id);
            batch.set(ref, cleanForFirestore({ ...pay, userId: currentUser.uid }));
          });
          const settingsRef = doc(db, "users", currentUser.uid, "settings", "general");
          batch.set(settingsRef, cleanForFirestore({ ...newSettings, userId: currentUser.uid }));

          batch.commit().catch((err) => console.error("Error committing import to Firestore:", err));
        }

        return {
          success: true,
          counts: {
            folders: newFolders.length,
            customers: newCustomers.length,
            products: newProducts.length,
            invoices: newInvoices.length,
            payments: newPayments.length,
          },
        };
      }
      return {
        success: false,
        error: "بنية ملف النسخة الاحتياطية غير مطابقة. تأكد أن الملف يحتوي على جداول العملاء والفواتير والمنتجات والدفعات.",
      };
    } catch (e: any) {
      return { success: false, error: "الملف ليس بصيغة JSON صالحة أو تالف: " + (e?.message || "") };
    }
  };

  const resetToDefault = async () => {
    const uid = currentUser?.uid;
    const taggedFolders = sampleCustomerFolders.map((f) => ({ ...f, userId: uid }));
    const taggedCustomers = sampleCustomers.map((c) => ({ ...c, userId: uid }));
    const taggedProducts = sampleProducts.map((p) => ({ ...p, userId: uid }));
    const taggedInvoices = sampleInvoices.map((inv) => ({ ...inv, userId: uid }));
    const taggedPayments = samplePayments.map((p) => ({ ...p, userId: uid }));
    const taggedSettings = { ...defaultSettings, userId: uid };

    setFolders(taggedFolders);
    setCustomers(taggedCustomers);
    setProducts(taggedProducts);
    setInvoices(taggedInvoices);
    setPayments(taggedPayments);
    setSettings(taggedSettings);

    saveScopedStorage("folders", taggedFolders);
    saveScopedStorage("customers", taggedCustomers);
    saveScopedStorage("products", taggedProducts);
    saveScopedStorage("invoices", taggedInvoices);
    saveScopedStorage("payments", taggedPayments);
    saveScopedStorage("settings", taggedSettings);

    if (currentUser) {
      const batch = writeBatch(db);
      taggedFolders.forEach((f) => {
        batch.set(doc(db, "users", currentUser.uid, "folders", f.id), cleanForFirestore({ ...f, userId: currentUser.uid }));
      });
      taggedCustomers.forEach((c) => {
        batch.set(doc(db, "users", currentUser.uid, "customers", c.id), cleanForFirestore({ ...c, userId: currentUser.uid }));
      });
      taggedProducts.forEach((p) => {
        batch.set(doc(db, "users", currentUser.uid, "products", p.id), cleanForFirestore({ ...p, userId: currentUser.uid }));
      });
      taggedInvoices.forEach((inv) => {
        batch.set(doc(db, "users", currentUser.uid, "invoices", inv.id), cleanForFirestore({ ...inv, userId: currentUser.uid }));
      });
      taggedPayments.forEach((p) => {
        batch.set(doc(db, "users", currentUser.uid, "payments", p.id), cleanForFirestore({ ...p, userId: currentUser.uid }));
      });
      batch.set(doc(db, "users", currentUser.uid, "settings", "general"), cleanForFirestore({ ...taggedSettings, userId: currentUser.uid }));
      try {
        await batch.commit();
      } catch (err) {
        console.warn("Firestore batchImportData commit notice:", err);
      }
    }
  };

  const clearAllData = async () => {
    if (currentUser) {
      for (const f of folders) await deleteFromFirestoreDoc("folders", f.id);
      for (const c of customers) await deleteFromFirestoreDoc("customers", c.id);
      for (const p of products) await deleteFromFirestoreDoc("products", p.id);
      for (const inv of invoices) await deleteFromFirestoreDoc("invoices", inv.id);
      for (const pay of payments) await deleteFromFirestoreDoc("payments", pay.id);
      for (const log of changeLogs) await deleteFromFirestoreDoc("changeLogs", log.id);
    }
    setFolders([]);
    setCustomers([]);
    setProducts([]);
    setInvoices([]);
    setPayments([]);
    setChangeLogs([]);

    saveScopedStorage("folders", []);
    saveScopedStorage("customers", []);
    saveScopedStorage("products", []);
    saveScopedStorage("invoices", []);
    saveScopedStorage("payments", []);
    saveScopedStorage("change_logs", []);
  };

  // Change Log actions (سجل التغييرات)
  const addChangeLog = async (
    item: Omit<CustomerChangeLogItem, "id" | "timestamp" | "formattedDateTime"> & {
      id?: string;
      timestamp?: string;
      formattedDateTime?: string;
    }
  ): Promise<CustomerChangeLogItem> => {
    const now = new Date();
    const newLog: CustomerChangeLogItem = {
      id: item.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: currentUser?.uid,
      customerId: item.customerId,
      invoiceId: item.invoiceId,
      actionType: item.actionType,
      details: item.details,
      rawAmount: item.rawAmount,
      itemName: item.itemName,
      timestamp: item.timestamp || now.toISOString(),
      formattedDateTime: item.formattedDateTime || formatChangeLogDateTime(now),
      targetItemId: item.targetItemId,
      previousState: item.previousState,
    };

    setChangeLogs((prev) => {
      const next = [newLog, ...prev];
      saveScopedStorage("change_logs", next);
      return next;
    });

    if (currentUser) {
      saveToFirestoreDoc("changeLogs", newLog.id, newLog).catch((e) =>
        console.error("Error persisting change log to Firestore:", e)
      );
    }
    return newLog;
  };

  const deleteChangeLog = async (id: string) => {
    setChangeLogs((prev) => {
      const next = prev.filter((l) => l.id !== id);
      saveScopedStorage("change_logs", next);
      return next;
    });
    if (currentUser) {
      await deleteFromFirestoreDoc("changeLogs", id);
    }
  };

  const clearCustomerChangeLogs = async (customerId: string) => {
    const toDelete = changeLogs.filter((l) => l.customerId === customerId);
    setChangeLogs((prev) => {
      const next = prev.filter((l) => l.customerId !== customerId);
      saveScopedStorage("change_logs", next);
      return next;
    });
    if (currentUser) {
      for (const log of toDelete) {
        deleteFromFirestoreDoc("changeLogs", log.id).catch((e) => console.error(e));
      }
    }
  };

  const revertChangeLogAction = async (logItem: CustomerChangeLogItem) => {
    const targetInvoice = invoices.find((inv) => inv.customerId === logItem.customerId);
    if (!targetInvoice) return;

    const currentItems = [...(targetInvoice.items || [])];

    if (logItem.actionType === "حذف دين") {
      const restoredRow = {
        id: logItem.targetItemId || `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        details: logItem.itemName || logItem.details.split(" — ")[0] || "دين مسترجع",
        quantity: 1,
        unitPrice: logItem.rawAmount || 0,
        total: logItem.rawAmount || 0,
        pageNumber: 1,
        isLoggedDebt: true,
      };
      const updatedItems = [...currentItems, restoredRow];
      const newGrandTotal = updatedItems.reduce(
        (sum, it) => sum + (!it.isSeparator && !it.isPaymentRow ? Number(it.total || 0) : 0),
        0
      );
      const updatedInvoice: Invoice = {
        ...targetInvoice,
        items: updatedItems,
        grandTotal: newGrandTotal,
        remainingAmount: Math.max(0, newGrandTotal - targetInvoice.paidAmount),
      };
      await updateInvoice(updatedInvoice);

      await addChangeLog({
        customerId: logItem.customerId,
        invoiceId: targetInvoice.id,
        actionType: "استرجاع عملية",
        details: `استرجاع دين: ${logItem.details}`,
        rawAmount: logItem.rawAmount,
        itemName: logItem.itemName,
      });
    } else if (logItem.actionType === "إضافة دين") {
      if (logItem.targetItemId) {
        const updatedItems = currentItems.filter((it) => it.id !== logItem.targetItemId);
        const newGrandTotal = updatedItems.reduce(
          (sum, it) => sum + (!it.isSeparator && !it.isPaymentRow ? Number(it.total || 0) : 0),
          0
        );
        const updatedInvoice: Invoice = {
          ...targetInvoice,
          items: updatedItems,
          grandTotal: newGrandTotal,
          remainingAmount: Math.max(0, newGrandTotal - targetInvoice.paidAmount),
        };
        await updateInvoice(updatedInvoice);

        await addChangeLog({
          customerId: logItem.customerId,
          invoiceId: targetInvoice.id,
          actionType: "استرجاع عملية",
          details: `إلغاء إضافة دين: ${logItem.details}`,
          rawAmount: logItem.rawAmount,
          itemName: logItem.itemName,
        });
      }
    } else if (logItem.actionType === "حذف واصل") {
      const restoredSep = {
        id: logItem.targetItemId || `sep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        details: "واصل مسدد",
        quantity: 1,
        unitPrice: 0,
        total: 0,
        isSeparator: true,
        paidAmount: logItem.rawAmount || 0,
        pageNumber: 1,
        isLoggedPaid: true,
      };
      const updatedItems = [...currentItems, restoredSep];
      const newPaid = updatedItems.reduce(
        (sum, it) => sum + (it.isSeparator ? Number(it.paidAmount || 0) : 0),
        0
      );
      const updatedInvoice: Invoice = {
        ...targetInvoice,
        items: updatedItems,
        paidAmount: newPaid,
        remainingAmount: Math.max(0, targetInvoice.grandTotal - newPaid),
      };
      await updateInvoice(updatedInvoice);

      await addChangeLog({
        customerId: logItem.customerId,
        invoiceId: targetInvoice.id,
        actionType: "استرجاع عملية",
        details: `استرجاع واصل: ${logItem.details}`,
        rawAmount: logItem.rawAmount,
      });
    } else if (logItem.actionType === "إضافة واصل") {
      if (logItem.targetItemId) {
        const updatedItems = currentItems.filter((it) => it.id !== logItem.targetItemId);
        const newPaid = updatedItems.reduce(
          (sum, it) => sum + (it.isSeparator ? Number(it.paidAmount || 0) : 0),
          0
        );
        const updatedInvoice: Invoice = {
          ...targetInvoice,
          items: updatedItems,
          paidAmount: newPaid,
          remainingAmount: Math.max(0, targetInvoice.grandTotal - newPaid),
        };
        await updateInvoice(updatedInvoice);

        await addChangeLog({
          customerId: logItem.customerId,
          invoiceId: targetInvoice.id,
          actionType: "استرجاع عملية",
          details: `إلغاء واصل: ${logItem.details}`,
          rawAmount: logItem.rawAmount,
        });
      }
    }
  };

  const createCloudBackup = async (name?: string) => {
    if (!currentUser) return null;
    const backupId = `cloud_backup_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const backupName = name || `نسخة سحابية ${new Date().toLocaleDateString("ar-SA")}`;
    const payload = {
      meta: {
        appName: "دفتر الديون المحاسبي",
        exportDate: timestamp,
        userId: currentUser.uid,
        userEmail: currentUser.email,
      },
      folders: latestState.current.folders,
      customers: latestState.current.customers,
      products: latestState.current.products,
      invoices: latestState.current.invoices,
      payments: latestState.current.payments,
      changeLogs: latestState.current.changeLogs,
      settings: latestState.current.settings,
    };
    const backupDoc: CloudBackupItem = {
      id: backupId,
      userId: currentUser.uid,
      name: backupName,
      createdAt: timestamp,
      stats: `العملاء: ${latestState.current.customers.length} | الفواتير: ${latestState.current.invoices.length} | البضائع: ${latestState.current.products.length}`,
      payloadJson: JSON.stringify(payload),
    };
    await saveToFirestoreDoc("backups", backupId, backupDoc);
    return backupDoc;
  };

  const restoreCloudBackup = async (backupId: string) => {
    if (!currentUser) return { success: false, error: "غير مسجل الدخول" };
    const targetBackup = cloudBackups.find((b) => b.id === backupId);
    if (!targetBackup) return { success: false, error: "النسخة الاحتياطية غير موجودة" };
    return importData(targetBackup.payloadJson);
  };

  const deleteCloudBackup = async (backupId: string) => {
    if (!currentUser) return;
    await deleteFromFirestoreDoc("backups", backupId);
  };

  return {
    folders,
    customers,
    products,
    invoices,
    payments,
    changeLogs,
    cloudBackups,
    settings,
    loading,
    isCloudSyncing,
    addFolder,
    updateFolder,
    deleteFolder,
    moveToTrashFolder,
    restoreFolder,
    permanentDeleteFolder,
    reorderFolders,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    moveToTrashCustomer,
    restoreCustomer,
    permanentDeleteCustomer,
    batchMoveToTrash,
    batchRestore,
    batchPermanentDelete,
    emptyTrash,
    restoreAllTrash,
    addProduct,
    updateProduct,
    deleteProduct,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    addPayment,
    deletePayment,
    updateSettings,
    addChangeLog,
    deleteChangeLog,
    clearCustomerChangeLogs,
    revertChangeLogAction,
    createCloudBackup,
    restoreCloudBackup,
    deleteCloudBackup,
    importData,
    resetToDefault,
    clearAllData,
  };
}
