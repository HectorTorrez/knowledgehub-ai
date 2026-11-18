export const QUESTION_SUGGESTER = Symbol('QUESTION_SUGGESTER');

export interface SuggestionSource {
  title: string;
  excerpt: string;
}

export interface FollowUpRequest {
  question: string;
  answer: string;
  sources: SuggestionSource[];
}

export interface SuggestionDocument {
  title: string;
  summary: string | null;
  keyTopics: string[];
}

export type SuggestionLocale = 'en' | 'es';

export interface StarterRequest {
  locale: SuggestionLocale;
  documents: SuggestionDocument[];
}

export interface QuestionSuggester {
  followUps(request: FollowUpRequest): Promise<string[]>;
  starters(request: StarterRequest): Promise<string[]>;
}
