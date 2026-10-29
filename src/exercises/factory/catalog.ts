// Authoring entry point only. Do not import from app/ExerciseUI/beta/controller.
import { CALCULATION_DRAFTS } from './calculations';
import { PRACTICAL_DRAFTS } from './practical';
import { ROUTING_DRAFTS } from './routing';
import { CIDR_DRAFTS } from './cidrDrafts';
import type { FactoryDraft } from './types';
export const NETWORK_FACTORY_DRAFTS: FactoryDraft[] = [...CALCULATION_DRAFTS, ...PRACTICAL_DRAFTS, ...ROUTING_DRAFTS, ...CIDR_DRAFTS];
