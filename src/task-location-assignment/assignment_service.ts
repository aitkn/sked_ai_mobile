import { 
  TaskLocationAssignment, 
  LocationGroup, 
  LocationGroupMember,
  UserPlaceLocation,
  AssignmentResult,
  AssignmentOptions,
  LocationConfidence,
  AssignmentStrategy
} from './types.js';

export class TaskLocationAssignmentService {
  private database: any; // Database service - will be injected
  
  constructor(database: any) {
    this.database = database;
  }

  /**
   * Main method to assign locations to tasks based on user selection and confidence
   */
  async assignLocationToTask(options: AssignmentOptions): Promise<AssignmentResult> {
    const { task_id, task_type, user_id, selected_places, auto_assign_threshold = 0.8 } = options;

    console.log(`🎯 Assigning location for task ${task_id} of type ${task_type}`);

    try {
      // Get existing user locations for this task type
      const existingLocations = await this.getUserLocationsByType(user_id, task_type);
      
      // Determine assignment strategy
      const strategy = await this.determineAssignmentStrategy(
        existingLocations,
        selected_places,
        auto_assign_threshold
      );

      console.log(`📋 Assignment strategy: ${strategy.strategy_type} (confidence: ${strategy.confidence})`);

      // Execute assignment based on strategy
      switch (strategy.strategy_type) {
        case 'single_best':
          return await this.createDirectAssignment(task_id, strategy.locations[0].location);
          
        case 'multiple_options':
          return await this.createGroupAssignment(task_id, task_type, strategy.locations.map(lc => lc.location));
          
        case 'create_group':
          return await this.createNewGroupAssignment(task_id, task_type, strategy.locations.map(lc => lc.location));
          
        default:
          throw new Error(`Unknown assignment strategy: ${strategy.strategy_type}`);
      }
      
    } catch (error) {
      console.error('❌ Error assigning location to task:', error);
      return {
        success: false,
        assignment_type: 'direct',
        task_id,
        message: `Failed to assign location: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a direct assignment to a single location (Phase 4.1)
   */
  private async createDirectAssignment(
    task_id: string, 
    location: UserPlaceLocation
  ): Promise<AssignmentResult> {
    console.log(`🎯 Creating direct assignment to ${location.custom_name || location.place_id}`);

    const assignment: TaskLocationAssignment = {
      task_id,
      location_id: location.id,
      assignment_type: 'direct',
      priority: 1,
      transition_end: true, // Direct assignments typically end transitions
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.database.createTaskLocationAssignment(assignment);

    // Update usage tracking
    await this.updateLocationUsage(location.id);

    return {
      success: true,
      assignment_type: 'direct',
      task_id,
      location_id: location.id,
      message: `Task assigned directly to ${location.custom_name || location.place_id}`
    };
  }

  /**
   * Create assignment to location group (Phase 4.2)
   */
  private async createGroupAssignment(
    task_id: string,
    task_type: string,
    locations: UserPlaceLocation[]
  ): Promise<AssignmentResult> {
    console.log(`👥 Creating group assignment for ${locations.length} locations`);

    // Find or create location group for this task type
    let locationGroup = await this.findLocationGroupByTaskType(task_type);
    
    if (!locationGroup) {
      locationGroup = await this.createLocationGroup(task_type);
    }

    // Add locations to group if not already members
    for (const location of locations) {
      await this.ensureLocationGroupMember(locationGroup.id, location.id);
    }

    // Create task assignment to group
    const assignment: TaskLocationAssignment = {
      task_id,
      location_group_id: locationGroup.id,
      assignment_type: 'group',
      priority: 1,
      transition_end: false, // Let constraint solver decide
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.database.createTaskLocationAssignment(assignment);

    return {
      success: true,
      assignment_type: 'group',
      task_id,
      location_group_id: locationGroup.id,
      message: `Task assigned to ${task_type} location group with ${locations.length} options`,
      suggested_locations: locations
    };
  }

  /**
   * Create new location group and assignment
   */
  private async createNewGroupAssignment(
    task_id: string,
    task_type: string,
    locations: UserPlaceLocation[]
  ): Promise<AssignmentResult> {
    console.log(`🆕 Creating new group assignment for ${task_type}`);

    const locationGroup = await this.createLocationGroup(task_type);

    // Add all locations to the new group
    for (let i = 0; i < locations.length; i++) {
      const member: LocationGroupMember = {
        location_group_id: locationGroup.id,
        user_place_location_id: locations[i].id,
        priority: i + 1,
        is_active: true,
        created_at: new Date().toISOString()
      };
      
      await this.database.createLocationGroupMember(member);
    }

    // Create task assignment
    const assignment: TaskLocationAssignment = {
      task_id,
      location_group_id: locationGroup.id,
      assignment_type: 'group',
      priority: 1,
      transition_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.database.createTaskLocationAssignment(assignment);

    return {
      success: true,
      assignment_type: 'group',
      task_id,
      location_group_id: locationGroup.id,
      message: `Created new ${task_type} group with ${locations.length} locations`,
      suggested_locations: locations
    };
  }

  /**
   * Determine the best assignment strategy based on available locations
   */
  private async determineAssignmentStrategy(
    existingLocations: UserPlaceLocation[],
    selectedPlaces?: string[],
    autoAssignThreshold: number = 0.8
  ): Promise<AssignmentStrategy> {
    
    // If user explicitly selected places, use those
    if (selectedPlaces && selectedPlaces.length > 0) {
      const selectedLocations = existingLocations.filter(loc => 
        selectedPlaces.includes(loc.place_id)
      );

      if (selectedLocations.length === 1) {
        return {
          strategy_type: 'single_best',
          confidence: 1.0, // User explicitly selected
          locations: [{ 
            location: selectedLocations[0], 
            confidence_score: 1.0,
            reasons: ['User explicitly selected this location']
          }],
          reasoning: 'User selected single location'
        };
      } else if (selectedLocations.length > 1) {
        return {
          strategy_type: 'multiple_options',
          confidence: 1.0,
          locations: selectedLocations.map(loc => ({
            location: loc,
            confidence_score: 1.0,
            reasons: ['User explicitly selected this location']
          })),
          reasoning: 'User selected multiple locations'
        };
      }
    }

    // No existing locations - would need to create group from discovered places
    if (existingLocations.length === 0) {
      return {
        strategy_type: 'create_group',
        confidence: 0.5,
        locations: [],
        reasoning: 'No existing locations found, need to create new group'
      };
    }

    // Single high-confidence location
    if (existingLocations.length === 1) {
      const location = existingLocations[0];
      const confidence = this.calculateLocationConfidence(location);
      
      if (confidence >= autoAssignThreshold) {
        return {
          strategy_type: 'single_best',
          confidence,
          locations: [{
            location,
            confidence_score: confidence,
            reasons: this.getConfidenceReasons(location)
          }],
          reasoning: 'Single high-confidence location available'
        };
      }
    }

    // Multiple locations - create/use group
    const locationConfidences = existingLocations.map(loc => ({
      location: loc,
      confidence_score: this.calculateLocationConfidence(loc),
      reasons: this.getConfidenceReasons(loc)
    }));

    // Sort by confidence
    locationConfidences.sort((a, b) => b.confidence_score - a.confidence_score);

    return {
      strategy_type: 'multiple_options',
      confidence: Math.max(...locationConfidences.map(lc => lc.confidence_score)),
      locations: locationConfidences,
      reasoning: `Multiple locations available with varying confidence levels`
    };
  }

  /**
   * Calculate confidence score for a location based on usage patterns
   */
  private calculateLocationConfidence(location: UserPlaceLocation): number {
    let confidence = 0.5; // Base confidence

    // Boost for visit frequency
    if (location.visit_count > 5) confidence += 0.2;
    else if (location.visit_count > 2) confidence += 0.1;

    // Boost for user rating
    if (location.user_rating && location.user_rating >= 4) confidence += 0.2;
    else if (location.user_rating && location.user_rating >= 3) confidence += 0.1;

    // Boost for being favorite
    if (location.is_favorite) confidence += 0.2;

    // Boost for recent visits
    if (location.last_visited) {
      const daysSinceVisit = (Date.now() - new Date(location.last_visited).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit <= 7) confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get reasons for confidence score
   */
  private getConfidenceReasons(location: UserPlaceLocation): string[] {
    const reasons: string[] = [];

    if (location.visit_count > 5) reasons.push(`Frequently visited (${location.visit_count} times)`);
    if (location.user_rating && location.user_rating >= 4) reasons.push(`Highly rated (${location.user_rating}/5)`);
    if (location.is_favorite) reasons.push('Marked as favorite');
    if (location.custom_name) reasons.push('Personalized with custom name');
    
    if (location.last_visited) {
      const daysSinceVisit = (Date.now() - new Date(location.last_visited).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit <= 7) reasons.push('Recently visited');
    }

    return reasons;
  }

  // Database helper methods (would be implemented based on actual database)
  
  protected async getUserLocationsByType(user_id: string, task_type: string): Promise<UserPlaceLocation[]> {
    // Implementation would query database for user's locations matching task type
    console.log(`🔍 Getting user locations for ${task_type}`);
    return []; // Mock implementation
  }

  protected async findLocationGroupByTaskType(task_type: string): Promise<LocationGroup | null> {
    console.log(`🔍 Finding location group for ${task_type}`);
    return null; // Mock implementation
  }

  protected async createLocationGroup(task_type: string): Promise<LocationGroup> {
    console.log(`🆕 Creating location group for ${task_type}`);
    
    const group: LocationGroup = {
      id: `group_${Date.now()}`,
      name: `${task_type.charAt(0).toUpperCase() + task_type.slice(1)} Locations`,
      description: `Locations for ${task_type} tasks`,
      task_type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Mock database save
    return group;
  }

  protected async ensureLocationGroupMember(group_id: string, location_id: string): Promise<void> {
    console.log(`👥 Adding location ${location_id} to group ${group_id}`);
    // Implementation would check if member exists, create if not
  }

  protected async updateLocationUsage(location_id: string): Promise<void> {
    console.log(`📈 Updating usage stats for location ${location_id}`);
    // Implementation would increment visit_count, update last_visited
  }
}