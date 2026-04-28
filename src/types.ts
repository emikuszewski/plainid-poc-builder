// Core POC document schema - drives form, HTML, and DOCX generation

export interface InScopeSystem {
  id: string;
  name: string;
  focus: string;
  priority: 'P1' | 'P2' | 'P3';
}

export interface IdentitySource {
  id: string;
  name: string;
  type: string; // e.g. "Primary IdP", "IGA", "Directory"
  notes: string;
}

export interface Sprint {
  id: string;
  phase: string;
  weeks: string;
  focus: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
}

export interface TeamMember {
  id: string;
  org: string; // 'Customer' | 'PlainID' or actual org name
  name: string;
  role: string;
  email: string;
}

export interface UseCase {
  id: string;
  // libraryId is set when picked from library; null when authored ad-hoc
  // (snapshot at insertion - subsequent library edits do NOT propagate)
  libraryId: string | null;
  title: string;
  category: UseCaseCategory;
  persona: string;
  objectives: string; // multiline
  successCriteria: string; // multiline
}

export type UseCaseCategory =
  | 'Data'
  | 'API Gateway'
  | 'AI Authorization'
  | 'Identity'
  | 'Compliance'
  | 'Application'
  | 'Other';

export interface TrackerRow {
  id: string;
  phase: string;
  task: string;
  responsible: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  dueDate: string;
}

export interface ReferenceDoc {
  id: string;
  title: string;
  url: string;
  description: string;
}

export interface PocDocument {
  id?: string;
  // Metadata
  customerName: string;
  ownerEmail: string;
  status: 'draft' | 'active' | 'completed';
  createdAt?: string;
  updatedAt?: string;

  // Section 1: Customer
  customerOverview: string;
  customerIndustry: string;
  customerHQ: string;

  // Section 2: Authorization Context & Compelling Event
  compellingEvent: string;
  authorizationContext: string;

  // Section 3: Objectives & Outcomes
  objectives: string;
  whatToValidate: string; // multiline list
  postPocDeliverables: string; // multiline list

  // Section 4: Discovery Summary
  inScopeSystems: InScopeSystem[];
  identitySources: IdentitySource[];
  architectureConstraints: string;

  // Section 5: Timeline
  timelineSummary: string;
  sprints: Sprint[];

  // Section 6: Framework
  cadence: string;
  personas: Persona[];
  teamMembers: TeamMember[];

  // Section 7: Use Cases
  useCases: UseCase[];

  // Section 8: Dependencies & Pre-reqs
  customerResponsibilities: string; // multiline
  plainidResponsibilities: string; // multiline
  openItems: string; // multiline

  // Section 9: Tracker
  tracker: TrackerRow[];

  // Section 10: Reference Documentation
  referenceDocs: ReferenceDoc[];
}

export interface UseCaseLibraryEntry {
  id?: string;
  title: string;
  category: UseCaseCategory;
  persona: string;
  objectives: string;
  successCriteria: string;
  description: string; // short description for library card
  isSystem?: boolean; // seeded entries from TI doc
  createdAt?: string;
  updatedAt?: string;
}

export interface SectionMeta {
  id: string;
  label: string;
  shortLabel: string;
}

export const SECTIONS: SectionMeta[] = [
  { id: 'customer', label: 'Customer', shortLabel: '01' },
  { id: 'context', label: 'Compelling Event', shortLabel: '02' },
  { id: 'objectives', label: 'Objectives', shortLabel: '03' },
  { id: 'discovery', label: 'Discovery', shortLabel: '04' },
  { id: 'timeline', label: 'Timeline', shortLabel: '05' },
  { id: 'framework', label: 'Framework', shortLabel: '06' },
  { id: 'usecases', label: 'Use Cases', shortLabel: '07' },
  { id: 'dependencies', label: 'Dependencies', shortLabel: '08' },
  { id: 'tracker', label: 'Tracker', shortLabel: '09' },
  { id: 'docs', label: 'Reference Docs', shortLabel: '10' },
];
