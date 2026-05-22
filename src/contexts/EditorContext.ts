import { createContext } from 'react';
import type { Tab, TableSchema } from '../types/editor';

export interface EditorContextType {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;
  addTab: (tab?: Partial<Tab>) => string;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToLeft: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  updateTab: (id: string, partial: Partial<Tab>) => void;
  moveTabToConnection: (
    id: string,
    connectionId: string,
    partial?: Partial<Tab>,
  ) => Promise<boolean>;
  closeTabsForDatabase: (connectionId: string, database: string) => Promise<number>;
  setActiveTabId: (id: string) => void;
  getSchema: (connectionId: string, schemaVersion?: number, schema?: string) => Promise<TableSchema[]>;
}

export const EditorContext = createContext<EditorContextType | undefined>(undefined);
