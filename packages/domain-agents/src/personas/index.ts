/**
 * Personas Module Exports
 */

export {
  DEFAULT_PERSONAS,
  cfoPersona,
  vpFinancePersona,
  croPersona,
  vpSalesPersona,
  vpCSPersona,
  csmPersona,
  vpAMPersona,
  vpServicesPersona,
  vpProductPersona,
  vpMarketingPersona,
  vpPeoplePersona,
  ctoPersona,
  vpEngineeringPersona,
  engineeringManagerPersona,
  techLeadPersona,
  sreLeadPersona,
  vpEngineeringOpsPersona,
  ceoPersona,
  cooPersona,
  nexusAIPersona,
  getPrimaryPersonaForDomain,
  getPersonasForDomain,
  getPersona,
  getAllPersonas
} from './default-personas';

export {
  buildPersonaSystemPrompt,
  buildContextBlock,
  buildCompletePrompt,
  buildFollowUpPrompt,
  buildDisabledModulePrompt,
  getSampleQuestions,
  getSuggestedFollowUps,
  type PromptContext
} from './prompt-builder';
