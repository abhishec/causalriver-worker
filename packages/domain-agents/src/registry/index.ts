/**
 * Registry Module Exports
 */

export {
  DEFAULT_MODULES,
  MODULE_IDS,
  financeModule,
  revenueModule,
  csModule,
  amModule,
  servicesModule,
  productModule,
  marketingModule,
  peopleModule,
  executiveModule,
  getModule,
  getAllModules,
  getModulesByCategory,
  getCoreModules,
  getOperationalModules,
  getStrategicModules
} from './default-modules';

export {
  createModuleRegistry,
  extendRegistry,
  mergeRegistries,
  filterRegistry,
  validateModule,
  getAllKeywords,
  searchModules,
  getDependentModules,
  getDependencyTree,
  type CreateRegistryOptions
} from './module-registry';
