import React from "react";
import FileManagerView, { FileManagerViewProps } from "./FileManagerView";
import { Customer, CustomerFolder, Invoice, Payment, SystemSettings } from "../types";

export interface HierarchicalFolderNavProps {
  folders: CustomerFolder[];
  customers: Customer[];
  currentFolderId: string | null; // null represents Root ("التخزين الداخلي")
  onNavigate: (folderId: string | null) => void;
  onOpenCreateFolderModal?: (parentFolderId: string | null) => void;
  onOpenCreateCustomerModal?: (folderId: string | null) => void;
  onRenameFolder?: (folder: CustomerFolder) => void;
  onDeleteFolder?: (folderId: string) => void;
  onShareFolder?: (folder: CustomerFolder) => void;
  onCopyText?: (text: string, label: string) => void;
  onSelectCustomer?: (customerId: string) => void;
  invoices?: Invoice[];
  payments?: Payment[];
  settings?: SystemSettings;
  onAddFolder?: (folder: CustomerFolder) => void;
  onUpdateFolder?: (folder: CustomerFolder) => void;
  onAddCustomer?: (customer: Customer) => void;
  onUpdateCustomer?: (customer: Customer) => void;
  onDeleteCustomer?: (customerId: string) => void;
  onMoveItems?: (folderIds: string[], customerIds: string[], targetFolderId: string | null) => void;
  onBulkDelete?: (folderIds: string[], customerIds: string[]) => void;
}

export default function HierarchicalFolderNav({
  folders,
  customers,
  currentFolderId,
  onNavigate,
  onOpenCreateFolderModal,
  onOpenCreateCustomerModal,
  onRenameFolder,
  onDeleteFolder,
  onSelectCustomer,
  invoices = [],
  payments = [],
  settings,
  onAddFolder,
  onUpdateFolder,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onMoveItems,
  onBulkDelete,
}: HierarchicalFolderNavProps) {
  return (
    <FileManagerView
      folders={folders}
      customers={customers}
      invoices={invoices}
      payments={payments}
      settings={settings}
      currentFolderId={currentFolderId}
      onNavigate={onNavigate}
      onSelectCustomer={onSelectCustomer}
      onAddFolder={onAddFolder}
      onUpdateFolder={onUpdateFolder}
      onDeleteFolder={onDeleteFolder}
      onAddCustomer={onAddCustomer}
      onUpdateCustomer={onUpdateCustomer}
      onDeleteCustomer={onDeleteCustomer}
      onMoveItems={onMoveItems}
      onBulkDelete={onBulkDelete}
      isEmbedded={true}
    />
  );
}
