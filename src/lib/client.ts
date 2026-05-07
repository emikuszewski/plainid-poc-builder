import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type {
  PocDocument,
  UseCaseLibraryEntry,
  InScopeSystem,
  IdentitySource,
  Sprint,
  Persona,
  TeamMember,
  UseCase,
  TechnicalFoundation,
  TrackerRow,
  ReferenceDoc,
} from '../types';

export const client = generateClient<Schema>();

// ============================================================
// Serializers — convert between strongly-typed PocDocument and
// the JSON-stringified shape stored in DynamoDB
// ============================================================

const parseJson = <T,>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

export function fromRecord(r: any): PocDocument {
  return {
    id: r.id,
    customerName: r.customerName ?? '',
    ownerEmail: r.ownerEmail ?? '',
    status: (r.status ?? 'draft') as PocDocument['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,

    customerOverview: r.customerOverview ?? '',
    customerIndustry: r.customerIndustry ?? '',
    customerHQ: r.customerHQ ?? '',

    compellingEvent: r.compellingEvent ?? '',
    authorizationContext: r.authorizationContext ?? '',

    objectives: r.objectives ?? '',
    whatToValidate: r.whatToValidate ?? '',
    postPocDeliverables: r.postPocDeliverables ?? '',

    tenantStrategyChoice: (r.tenantStrategyChoice ?? '') as PocDocument['tenantStrategyChoice'],
    tenantStrategy: r.tenantStrategy ?? '',
    inScopeSystems: parseJson<InScopeSystem[]>(r.inScopeSystems, []).map((s) => ({
      ...s,
      // Backfill authorizerId on rows saved before the field existed.
      authorizerId: s.authorizerId ?? null,
    })),
    identitySources: parseJson<IdentitySource[]>(r.identitySources, []),
    architectureConstraints: r.architectureConstraints ?? '',
    outOfScope: r.outOfScope ?? '',

    timelineSummary: r.timelineSummary ?? '',
    sprints: parseJson<Sprint[]>(r.sprints, []),

    cadence: r.cadence ?? '',
    personas: parseJson<Persona[]>(r.personas, []),
    teamMembers: parseJson<TeamMember[]>(r.teamMembers, []),

    useCases: parseJson<UseCase[]>(r.useCases, []),
    technicalFoundation: r.technicalFoundation
      ? parseJson<TechnicalFoundation>(r.technicalFoundation, undefined as any)
      : undefined,

    customerResponsibilities: r.customerResponsibilities ?? '',
    plainidResponsibilities: r.plainidResponsibilities ?? '',
    openItems: r.openItems ?? '',

    tracker: parseJson<TrackerRow[]>(r.tracker, []),
    referenceDocs: parseJson<ReferenceDoc[]>(r.referenceDocs, []),
  };
}

export function toRecord(p: PocDocument) {
  return {
    customerName: p.customerName,
    ownerEmail: p.ownerEmail,
    status: p.status,

    customerOverview: p.customerOverview,
    customerIndustry: p.customerIndustry,
    customerHQ: p.customerHQ,

    compellingEvent: p.compellingEvent,
    authorizationContext: p.authorizationContext,

    objectives: p.objectives,
    whatToValidate: p.whatToValidate,
    postPocDeliverables: p.postPocDeliverables,

    tenantStrategyChoice: p.tenantStrategyChoice,
    tenantStrategy: p.tenantStrategy,
    inScopeSystems: JSON.stringify(p.inScopeSystems),
    identitySources: JSON.stringify(p.identitySources),
    architectureConstraints: p.architectureConstraints,
    outOfScope: p.outOfScope,

    timelineSummary: p.timelineSummary,
    sprints: JSON.stringify(p.sprints),

    cadence: p.cadence,
    personas: JSON.stringify(p.personas),
    teamMembers: JSON.stringify(p.teamMembers),

    useCases: JSON.stringify(p.useCases),
    technicalFoundation: p.technicalFoundation
      ? JSON.stringify(p.technicalFoundation)
      : null,

    customerResponsibilities: p.customerResponsibilities,
    plainidResponsibilities: p.plainidResponsibilities,
    openItems: p.openItems,

    tracker: JSON.stringify(p.tracker),
    referenceDocs: JSON.stringify(p.referenceDocs),
  };
}

export function libFromRecord(r: any): UseCaseLibraryEntry {
  return {
    id: r.id,
    title: r.title ?? '',
    category: (r.category ?? 'Other') as UseCaseLibraryEntry['category'],
    persona: r.persona ?? '',
    description: r.description ?? '',
    objectives: r.objectives ?? '',
    successCriteria: r.successCriteria ?? '',
    isSystem: !!r.isSystem,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ============================================================
// API helpers
// ============================================================

export async function listPocs(): Promise<PocDocument[]> {
  const { data, errors } = await client.models.Poc.list();
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return (data ?? []).map(fromRecord);
}

export async function getPoc(id: string): Promise<PocDocument | null> {
  const { data, errors } = await client.models.Poc.get({ id });
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return data ? fromRecord(data) : null;
}

export async function createPoc(p: PocDocument): Promise<PocDocument> {
  const { data, errors } = await client.models.Poc.create(toRecord(p) as any);
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return fromRecord(data);
}

export async function updatePoc(id: string, p: PocDocument): Promise<PocDocument> {
  const { data, errors } = await client.models.Poc.update({ id, ...toRecord(p) } as any);
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return fromRecord(data);
}

export async function deletePoc(id: string): Promise<void> {
  const { errors } = await client.models.Poc.delete({ id });
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
}

export async function listLibrary(): Promise<UseCaseLibraryEntry[]> {
  const { data, errors } = await client.models.UseCaseLibraryEntry.list();
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  return (data ?? []).map(libFromRecord);
}

export async function createLibraryEntry(e: UseCaseLibraryEntry): Promise<UseCaseLibraryEntry> {
  const { data, errors } = await client.models.UseCaseLibraryEntry.create({
    title: e.title,
    category: e.category,
    persona: e.persona,
    description: e.description,
    objectives: e.objectives,
    successCriteria: e.successCriteria,
    isSystem: !!e.isSystem,
  } as any);
  if (errors) throw new Error(errors.map((er) => er.message).join('; '));
  return libFromRecord(data);
}

export async function updateLibraryEntry(
  id: string,
  e: UseCaseLibraryEntry,
): Promise<UseCaseLibraryEntry> {
  const { data, errors } = await client.models.UseCaseLibraryEntry.update({
    id,
    title: e.title,
    category: e.category,
    persona: e.persona,
    description: e.description,
    objectives: e.objectives,
    successCriteria: e.successCriteria,
    isSystem: !!e.isSystem,
  } as any);
  if (errors) throw new Error(errors.map((er) => er.message).join('; '));
  return libFromRecord(data);
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const { errors } = await client.models.UseCaseLibraryEntry.delete({ id });
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
}
