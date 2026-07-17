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
