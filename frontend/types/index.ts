// types/index.ts
export interface User {
  id: number;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
}

export interface Space {
  id: number;
  name: string;
  description?: string;
}

export interface Document {
  _id: string;
  originalName: string;
  title?: string;
  description?: string;
  tags?: string[];
  mimeType: string;
  spaceId: number;
  uploadedBy: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  chunkCount: number;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  email: string;
  action: string;
  success: boolean;
  ip?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface Stats {
  totalDocuments: number;
  totalQueries: number;
  activeUsers: number;
  documentsByStatus: Record<string, number>;
  documentsBySpace: Array<{ _id: number; count: number }>;
  recentActivity: AuditLog[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// SSE Tool Activity & Chat Stream Types (Strict TypeScript)
export type ToolName = 'searchKnowledgeBase' | 'getDocumentDetails' | string;
export type ToolExecutionStatus = 'running' | 'done' | 'failed';

export interface ToolActivityItem {
  id: string;
  name: ToolName;
  argsSummary?: string;
  status: ToolExecutionStatus;
  durationMs?: number;
  resultCount?: number;
}

export interface ChatSource {
  documentId?: string;
  documentTitle: string;
  originalName?: string;
  pageNumber?: number | null;
  similarity: number;
}

export type MessageStatus = 'waiting' | 'streaming' | 'done' | 'error' | 'stopped';

export interface ChatMessage {
  id: string;
  conversationId?: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
  toolActivities?: ToolActivityItem[];
  timestamp: Date;
  status?: MessageStatus;
  error?: string;
}

export interface Conversation {
  id: string;
  user_id?: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BackendMessageRecord {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'stopped' | 'error';
  sources: ChatSource[];
  toolActivity: ToolActivityItem[];
  errorMessage: string | null;
  createdAt: string;
}

export interface DocumentSummary {
  documentId: string;
  title: string;
  originalName: string;
  spaceId: number;
  spaceName: string;
  mimeType: string;
  status: string;
  chunkCount: number;
  createdAt: string;
  previewSnippet?: string;
}
