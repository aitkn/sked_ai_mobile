import { TaskLocationAssignmentService } from './assignment_service.js';
import { AssignmentOptions, UserPlaceLocation } from './types.js';

/**
 * Demo showcasing the task-location assignment logic
 * Demonstrates both direct assignment and group assignment scenarios
 */

// Mock database service
class MockDatabase {
  private taskLocationAssignments: any[] = [];
  private locationGroups: any[] = [];
  private locationGroupMembers: any[] = [];

  async createTaskLocationAssignment(assignment: any) {
    console.log('💾 Saving task location assignment:', assignment);
    this.taskLocationAssignments.push(assignment);
  }

  async createLocationGroup(group: any) {
    console.log('💾 Saving location group:', group);
    this.locationGroups.push(group);
    return group;
  }

  async createLocationGroupMember(member: any) {
    console.log('💾 Saving location group member:', member);
    this.locationGroupMembers.push(member);
  }

  getAssignments() { return this.taskLocationAssignments; }
  getGroups() { return this.locationGroups; }
  getMembers() { return this.locationGroupMembers; }
}

// Mock user locations
const mockUserLocations: { [taskType: string]: UserPlaceLocation[] } = {
  grocery: [
    {
      id: 'user_loc_1',
      user_id: 'user_123',
      place_id: 'vons_downtown',
      custom_name: 'My usual Vons',
      user_rating: 4.5,
      notes: 'Good produce section',
      visit_count: 15,
      last_visited: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      is_favorite: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  pharmacy: [
    {
      id: 'user_loc_2',
      user_id: 'user_123',
      place_id: 'cvs_main',
      custom_name: 'CVS on Main',
      user_rating: 4.0,
      visit_count: 8,
      last_visited: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      is_favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'user_loc_3',
      user_id: 'user_123',
      place_id: 'walgreens_oak',
      custom_name: 'Walgreens Oak Ave',
      user_rating: 3.5,
      visit_count: 3,
      is_favorite: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  restaurant: [] // No existing locations
};

// Mock the database methods in the service
class MockTaskLocationAssignmentService extends TaskLocationAssignmentService {
  constructor(database: MockDatabase) {
    super(database);
  }

  // Override to return mock data
  protected async getUserLocationsByType(user_id: string, task_type: string): Promise<UserPlaceLocation[]> {
    console.log(`🔍 [MOCK] Getting user locations for ${task_type}`);
    return mockUserLocations[task_type] || [];
  }

  protected async findLocationGroupByTaskType(task_type: string) {
    console.log(`🔍 [MOCK] Finding location group for ${task_type}`);
    
    // Simulate finding existing pharmacy group
    if (task_type === 'pharmacy') {
      return {
        id: 'pharmacy_group_1',
        name: 'Pharmacy Locations',
        description: 'Locations for pharmacy tasks',
        task_type: 'pharmacy',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    
    return null;
  }

  protected async ensureLocationGroupMember(group_id: string, location_id: string): Promise<void> {
    console.log(`👥 [MOCK] Ensuring location ${location_id} is in group ${group_id}`);
    // Mock implementation - would check and add if needed
  }

  protected async updateLocationUsage(location_id: string): Promise<void> {
    console.log(`📈 [MOCK] Updated usage stats for location ${location_id}`);
  }
}

async function runAssignmentDemo() {
  console.log('🎯 Task Location Assignment Demo Starting...\n');

  const mockDB = new MockDatabase();
  const assignmentService = new MockTaskLocationAssignmentService(mockDB);

  // Scenario 1: Direct Assignment - Single high-confidence location
  console.log('📍 Scenario 1: Direct Assignment (Single obvious choice)');
  console.log('Task: "Buy milk and bread" - User has one frequently visited grocery store');
  
  const groceryAssignment: AssignmentOptions = {
    task_id: 'task_001',
    task_type: 'grocery',
    user_id: 'user_123',
    auto_assign_threshold: 0.8
  };

  try {
    const result1 = await assignmentService.assignLocationToTask(groceryAssignment);
    console.log('✅ Result:', result1);
    console.log('');
  } catch (error) {
    console.log('❌ Failed:', error);
  }

  // Scenario 2: Group Assignment - Multiple options available
  console.log('💊 Scenario 2: Group Assignment (Multiple options)');
  console.log('Task: "Pick up prescription" - User has multiple pharmacy options');

  const pharmacyAssignment: AssignmentOptions = {
    task_id: 'task_002',
    task_type: 'pharmacy',
    user_id: 'user_123',
    auto_assign_threshold: 0.9 // Higher threshold to force group assignment
  };

  try {
    const result2 = await assignmentService.assignLocationToTask(pharmacyAssignment);
    console.log('✅ Result:', result2);
    console.log('');
  } catch (error) {
    console.log('❌ Failed:', error);
  }

  // Scenario 3: User Selection - Explicit choice
  console.log('👤 Scenario 3: User Selection (Explicit choice)');
  console.log('Task: "Pick up medicine" - User explicitly selects CVS');

  const explicitAssignment: AssignmentOptions = {
    task_id: 'task_003',
    task_type: 'pharmacy',
    user_id: 'user_123',
    selected_places: ['cvs_main'] // User selected this specific location
  };

  try {
    const result3 = await assignmentService.assignLocationToTask(explicitAssignment);
    console.log('✅ Result:', result3);
    console.log('');
  } catch (error) {
    console.log('❌ Failed:', error);
  }

  // Scenario 4: New Group Creation - No existing locations
  console.log('🍽️ Scenario 4: New Group Creation (No existing locations)');
  console.log('Task: "Grab dinner" - User has no saved restaurant locations');

  const restaurantAssignment: AssignmentOptions = {
    task_id: 'task_004',
    task_type: 'restaurant',
    user_id: 'user_123',
    create_group_if_missing: true
  };

  try {
    const result4 = await assignmentService.assignLocationToTask(restaurantAssignment);
    console.log('✅ Result:', result4);
    console.log('');
  } catch (error) {
    console.log('❌ Failed:', error);
  }

  // Scenario 5: Multiple User Selections
  console.log('🛍️ Scenario 5: Multiple User Selections');
  console.log('Task: "Pick up prescription" - User selects both pharmacy locations');

  const multiSelectAssignment: AssignmentOptions = {
    task_id: 'task_005',
    task_type: 'pharmacy',
    user_id: 'user_123',
    selected_places: ['cvs_main', 'walgreens_oak'] // User selected both
  };

  try {
    const result5 = await assignmentService.assignLocationToTask(multiSelectAssignment);
    console.log('✅ Result:', result5);
    console.log('');
  } catch (error) {
    console.log('❌ Failed:', error);
  }

  // Show final database state
  console.log('📊 Final Database State:');
  console.log('Task Location Assignments:', mockDB.getAssignments().length);
  console.log('Location Groups:', mockDB.getGroups().length);
  console.log('Group Members:', mockDB.getMembers().length);
  
  console.log('\n✅ Task Location Assignment Demo Complete!');
  console.log('\n📋 Summary of Scenarios Demonstrated:');
  console.log('1. ✅ Direct Assignment - Single high-confidence location');
  console.log('2. ✅ Group Assignment - Multiple options with existing group');
  console.log('3. ✅ User Selection - Explicit single choice');
  console.log('4. ✅ New Group Creation - No existing locations');
  console.log('5. ✅ Multiple User Selections - Group assignment');
  console.log('\n🚀 Ready for integration with constraint solver and database!');
}

// Helper function to demonstrate confidence calculation
function demonstrateConfidenceCalculation() {
  console.log('\n🧮 Confidence Calculation Examples:');
  
  const locations = [
    {
      name: 'Frequently visited favorite',
      visit_count: 10,
      user_rating: 5,
      is_favorite: true,
      last_visited: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      name: 'Occasional visit',
      visit_count: 3,
      user_rating: 3.5,
      is_favorite: false,
      last_visited: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      name: 'New location',
      visit_count: 1,
      is_favorite: false
    }
  ];

  locations.forEach(loc => {
    let confidence = 0.5;
    const reasons = [];

    if (loc.visit_count > 5) { confidence += 0.2; reasons.push('frequently visited'); }
    else if (loc.visit_count > 2) { confidence += 0.1; reasons.push('occasionally visited'); }

    if (loc.user_rating && loc.user_rating >= 4) { confidence += 0.2; reasons.push('highly rated'); }
    else if (loc.user_rating && loc.user_rating >= 3) { confidence += 0.1; reasons.push('decent rating'); }

    if (loc.is_favorite) { confidence += 0.2; reasons.push('marked as favorite'); }

    if (loc.last_visited) {
      const daysSinceVisit = (Date.now() - new Date(loc.last_visited).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit <= 7) { confidence += 0.1; reasons.push('recently visited'); }
    }

    confidence = Math.min(confidence, 1.0);
    
    console.log(`${loc.name}: ${(confidence * 100).toFixed(0)}% confidence`);
    console.log(`  Reasons: ${reasons.join(', ')}`);
  });
}

// Export for testing
export {
  runAssignmentDemo,
  demonstrateConfidenceCalculation,
  MockTaskLocationAssignmentService
};

// Run demo if file is executed directly
if (require.main === module) {
  runAssignmentDemo()
    .then(() => demonstrateConfidenceCalculation())
    .catch(console.error);
}