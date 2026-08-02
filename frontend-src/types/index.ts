export interface User { id: string; email: string; full_name?: string; roles: string[]; is_active: boolean; }
export interface Client { id: string; name: string; industry?: string; }
export interface Post { id: string; author?: string; content?: string; language?: string; url?: string; published_at?: string; metrics?: Record<string, number>; }
export interface Comment { id: string; post_id: string; author?: string; content?: string; }
export interface Ticket { id: string; title: string; description?: string; status: string; priority: string; assignee_id?: string; due_date?: string; created_at: string; }
export interface SentimentOverview { counts: Record<string, number>; percentages: Record<string, number>; total: number; }
export interface CrisisScore { crisis_score: number; level: string; negative_ratio: number; }
export interface Paginated<T> { total: number; page: number; page_size: number; items: T[]; }
