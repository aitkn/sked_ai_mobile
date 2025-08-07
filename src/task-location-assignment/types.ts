// Types for task-location assignment system (matching actual Supabase schema)

export interface TaskLocationAssignment {
  task_id: string;
  user_location_id?: string; // For direct assignment to specific user location
  location_group_id?: string; // For assignment to location group
  is_transition_end: boolean; // Maps to existing is_transition_end column
  created_at: string;
  updated_at: string;
}

export interface LocationGroup {
  location_group_id: string; // Maps to existing location_group_id
  user_id: string; // Already exists in schema
  name: string; // Already exists in schema
  created_at: string;
  updated_at: string;
}

export interface LocationGroupMember {
  location_group_id: string;
  user_location_id: string; // Maps to existing user_location_id
  // Note: No priority/is_active columns in existing schema - we'll use constraints field if needed
}

export interface UserPlaceLocation {
  user_location_id: string; // Actual primary key in database
  user_id: string;
  place_location_id?: string; // Links to place_location table
  location_id?: string; // Links to location table
  name?: string; // Custom name (maps to 'name' column)
  constraints?: any; // JSONB field for custom data
  ratings?: any; // JSONB field for user ratings
  created_at: string;
  updated_at: string;
}

export interface PlaceLocation {
  place_location_id: string; // Actual primary key
  place_id?: string; // Links to place table
  location_id: string; // Links to location table (required)
  name?: string;
  constraints?: any; // JSONB field
  ratings?: any; // JSONB field for ratings from APIs
  phone?: string; // Phone number
  created_at: string;
  updated_at: string;
}

export interface Location {
  location_id: string; // Primary key
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code: string; // Required
  location: any; // PostGIS geometry type (lat/lng coordinates)
  timezone: string; // Required
  weather_area_id?: string;
  created_at: string;
  updated_at: string;
}

export interface LocationTag {
  location_tag_id: string;
  name: string; // e.g., "grocery", "pharmacy", "restaurant"
  created_at: string;
  updated_at: string;
}

export interface PlaceLocationTag {
  place_location_id: string;
  location_tag_id: string;
  created_at: string;
}

export interface Place {
  place_id: string;
  name: string;
  description?: string;
  api_source?: string; // e.g., "google_places"
  constraints?: any; // JSONB field
  ratings?: any; // JSONB field for API ratings
  created_at: string;
  updated_at: string;
}

export interface AssignmentResult {
  success: boolean;
  assignment_type: 'direct' | 'group';
  task_id: string;
  location_id?: string;
  location_group_id?: string;
  message: string;
  suggested_locations?: UserPlaceLocation[];
}

export interface AssignmentOptions {
  task_id: string;
  task_type: string;
  user_id: string;
  selected_places?: string[]; // Place IDs selected by user
  auto_assign_threshold?: number; // Confidence threshold for auto-assignment
  create_group_if_missing?: boolean;
}

export interface LocationConfidence {
  location: UserPlaceLocation;
  confidence_score: number;
  reasons: string[];
}

export interface AssignmentStrategy {
  strategy_type: 'single_best' | 'multiple_options' | 'create_group';
  confidence: number;
  locations: LocationConfidence[];
  reasoning: string;
}