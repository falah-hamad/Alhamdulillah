import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  ChatConversation,
  ChatMessage,
  AISettings,
  DEFAULT_AI_SETTINGS,
} from "../types/aiChat";

const LOCAL_STORAGE_KEY_PREFIX = "alhamd_ai_conversations_";
const LOCAL_STORAGE_SETTINGS_KEY = "alhamd_ai_settings_";

function getLocalConversationsKey(userId?: string): string {
  return `${LOCAL_STORAGE_KEY_PREFIX}${userId || "guest"}`;
}

function getLocalSettingsKey(userId?: string): string {
  return `${LOCAL_STORAGE_SETTINGS_KEY}${userId || "guest"}`;
}

export function loadLocalAISettings(userId?: string): AISettings {
  try {
    const raw = localStorage.getItem(getLocalSettingsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_AI_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn("Failed to read local AI settings:", err);
  }
  return DEFAULT_AI_SETTINGS;
}

export function saveLocalAISettings(settings: AISettings, userId?: string): void {
  try {
    localStorage.setItem(getLocalSettingsKey(userId), JSON.stringify(settings));
  } catch (err) {
    console.warn("Failed to save local AI settings:", err);
  }
}

export function loadLocalConversations(userId?: string): ChatConversation[] {
  try {
    const raw = localStorage.getItem(getLocalConversationsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to read local conversations:", err);
  }
  return [];
}

export function saveLocalConversations(conversations: ChatConversation[], userId?: string): void {
  try {
    localStorage.setItem(getLocalConversationsKey(userId), JSON.stringify(conversations));
  } catch (err) {
    console.warn("Failed to save local conversations:", err);
  }
}

/**
 * Load conversations from Firestore if user is logged in, with localStorage instant fallback
 */
export async function fetchUserConversations(userId?: string): Promise<ChatConversation[]> {
  const localList = loadLocalConversations(userId);

  if (!userId || userId === "guest") {
    return localList;
  }

  try {
    const colRef = collection(db, "users", userId, "conversations");
    const q = query(colRef, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const remoteList: ChatConversation[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId,
          title: data.title || "محادثة بدون عنوان",
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          isPinned: !!data.isPinned,
          isArchived: !!data.isArchived,
          messages: Array.isArray(data.messages) ? data.messages : [],
          modelId: data.modelId || "gemini-3.8-flash",
        };
      });

      // Update local storage cache
      saveLocalConversations(remoteList, userId);
      return remoteList;
    }
  } catch (err) {
    console.warn("Firestore fetchUserConversations notice, using local cache:", err);
  }

  return localList;
}

/**
 * Save or update a conversation in Firestore and LocalStorage
 */
export async function persistConversation(
  conversation: ChatConversation,
  userId?: string
): Promise<void> {
  const currentLocal = loadLocalConversations(userId);
  const existingIdx = currentLocal.findIndex((c) => c.id === conversation.id);
  let updatedList: ChatConversation[];

  if (existingIdx >= 0) {
    updatedList = [...currentLocal];
    updatedList[existingIdx] = conversation;
  } else {
    updatedList = [conversation, ...currentLocal];
  }

  saveLocalConversations(updatedList, userId);

  if (userId && userId !== "guest") {
    try {
      const docRef = doc(db, "users", userId, "conversations", conversation.id);
      await setDoc(
        docRef,
        {
          id: conversation.id,
          userId,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: new Date().toISOString(),
          isPinned: conversation.isPinned || false,
          isArchived: conversation.isArchived || false,
          messages: conversation.messages,
          modelId: conversation.modelId || "gemini-3.8-flash",
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("Firestore persistConversation notice:", err);
    }
  }
}

/**
 * Delete a conversation
 */
export async function removeConversation(
  conversationId: string,
  userId?: string
): Promise<void> {
  const currentLocal = loadLocalConversations(userId);
  const filtered = currentLocal.filter((c) => c.id !== conversationId);
  saveLocalConversations(filtered, userId);

  if (userId && userId !== "guest") {
    try {
      const docRef = doc(db, "users", userId, "conversations", conversationId);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn("Firestore removeConversation notice:", err);
    }
  }
}

/**
 * Fetch and synchronize AI Settings
 */
export async function fetchUserAISettings(userId?: string): Promise<AISettings> {
  const localSettings = loadLocalAISettings(userId);

  if (!userId || userId === "guest") {
    return localSettings;
  }

  try {
    const docRef = doc(db, "users", userId, "settings", "ai_assistant");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const remote = snap.data() as Partial<AISettings>;
      const merged: AISettings = { ...DEFAULT_AI_SETTINGS, ...localSettings, ...remote };
      saveLocalAISettings(merged, userId);
      return merged;
    }
  } catch (err) {
    console.warn("Firestore fetchUserAISettings notice:", err);
  }

  return localSettings;
}

/**
 * Persist AI Settings
 */
export async function persistAISettings(settings: AISettings, userId?: string): Promise<void> {
  saveLocalAISettings(settings, userId);

  if (userId && userId !== "guest") {
    try {
      const docRef = doc(db, "users", userId, "settings", "ai_assistant");
      await setDoc(docRef, settings, { merge: true });
    } catch (err) {
      console.warn("Firestore persistAISettings notice:", err);
    }
  }
}
