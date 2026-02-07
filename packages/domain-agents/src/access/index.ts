/**
 * Access Control Module Exports
 */

export {
  createModuleAccessChecker,
  checkModuleAccessWithCapabilities,
  batchCheckAccess,
  type ModuleAccessChecker
} from './module-access';

export {
  buildDisabledModuleResponse,
  formatDisabledModuleMessage,
  getDisabledModuleOneLiner,
  suggestModulesToEnable,
  canPartiallyAnswer
} from './graceful-degrade';
