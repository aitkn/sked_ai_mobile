/**
 * Location Module
 * 
 * Exports location-based automation functionality:
 * - Location triggers for auto-actions
 * - Geofence management
 * - Motion detection
 */

export {
  locationTriggerService,
  initializeLocationTriggers,
  loadAutoActionRules,
  cleanupLocationTriggers,
  type TriggerType,
  type AutoActionType,
  type AutoActionRule,
  type LocationState,
} from './location-triggers'

