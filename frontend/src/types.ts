export type Options = { cities: string[]; categories: string[]; event_formats: string[]; languages: string[]; date_min: string; date_max: string; dataset_count: number };
export type Request = { city: string; date: string; event_format: string; category: string; budget_kzt: number; language: string | null; duration_hours: number | null };
export type Reason = 'busy' | 'format' | 'budget' | 'language' | 'duration';
export type Card = { id: string; name: string; category: string; city: string; price_from_kzt: number; languages: string[]; max_hours: number | null; explanation: string; explanation_mode: 'ai' | 'local'; evidence: { field: string; value: string }[]; flags: { synthetic: boolean; city_imputed: boolean; price_imputed: boolean } };
export type Match = { status: 'matches_found' | 'category_missing' | 'no_matches'; message: string; total_in_category: number; eligible_count: number; returned_count: number; rejections: { code: Reason; count: number }[]; cards: Card[] };
export type RecoverySuggestion = { request: Request; changed_fields: ('date' | 'budget_kzt')[]; eligible_count: number };
export type Recovery = { suggestions: RecoverySuggestion[] };
