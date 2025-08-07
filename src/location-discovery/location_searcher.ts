export interface SearchLocation {
  latitude: number;
  longitude: number;
  name?: string; // e.g., "home", "work", "current location"
}

export interface PlaceType {
  readonly type: string; // Google Places API types
  readonly keywords: readonly string[]; // Alternative search keywords
}

export interface SearchParams {
  location: SearchLocation;
  radius: number; // in miles
  placeTypes: readonly PlaceType[];
  maxResults?: number;
  minRating?: number;
}

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  price_level?: number;
  types: string[];
  distance?: number; // in miles
  phone_number?: string;
  website?: string;
  opening_hours?: {
    open_now?: boolean;
    periods?: any[];
  };
}

export interface SearchResult {
  places: PlaceResult[];
  searchParams: SearchParams;
  totalFound: number;
}

export class LocationSearcher {
  private googleMapsApiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(apiKey: string) {
    this.googleMapsApiKey = apiKey;
  }

  /**
   * Search for places based on task requirements
   */
  async searchPlaces(params: SearchParams): Promise<SearchResult> {
    const { location, radius, placeTypes, maxResults = 10, minRating = 0 } = params;
    
    try {
      // Convert miles to meters for Google Places API
      const radiusMeters = Math.round(radius * 1609.34);
      
      let allPlaces: PlaceResult[] = [];
      
      // Search for each place type
      for (const placeType of placeTypes) {
        const places = await this.searchByType(location, radiusMeters, placeType, maxResults);
        allPlaces = allPlaces.concat(places);
      }
      
      // Remove duplicates based on place_id
      const uniquePlaces = allPlaces.filter((place, index, self) =>
        index === self.findIndex(p => p.place_id === place.place_id)
      );
      
      // Filter by rating if specified
      const filteredPlaces = uniquePlaces.filter(place => 
        !place.rating || place.rating >= minRating
      );
      
      // Calculate distances
      const placesWithDistance = filteredPlaces.map(place => ({
        ...place,
        distance: this.calculateDistance(
          location.latitude,
          location.longitude,
          place.latitude,
          place.longitude
        )
      }));
      
      // Sort by distance, then by rating
      placesWithDistance.sort((a, b) => {
        const distanceDiff = (a.distance || 0) - (b.distance || 0);
        if (distanceDiff !== 0) return distanceDiff;
        return (b.rating || 0) - (a.rating || 0);
      });
      
      // Limit results
      const limitedPlaces = placesWithDistance.slice(0, maxResults);
      
      return {
        places: limitedPlaces,
        searchParams: params,
        totalFound: uniquePlaces.length
      };
      
    } catch (error) {
      console.error('Error searching places:', error);
      throw new Error(`Location search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for places of a specific type
   */
  private async searchByType(
    location: SearchLocation,
    radiusMeters: number,
    placeType: PlaceType,
    maxResults: number
  ): Promise<PlaceResult[]> {
    const url = `${this.baseUrl}/nearbysearch/json`;
    
    const params = new URLSearchParams({
      location: `${location.latitude},${location.longitude}`,
      radius: radiusMeters.toString(),
      type: placeType.type,
      key: this.googleMapsApiKey,
    });

    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }

    if (!data.results) {
      return [];
    }

    // Process and enrich place data
    const places: PlaceResult[] = data.results.map((result: any) => ({
      place_id: result.place_id,
      name: result.name,
      address: result.vicinity || result.formatted_address || '',
      latitude: result.geometry?.location?.lat || 0,
      longitude: result.geometry?.location?.lng || 0,
      rating: result.rating,
      price_level: result.price_level,
      types: result.types || [],
      phone_number: result.formatted_phone_number,
      website: result.website,
      opening_hours: result.opening_hours ? {
        open_now: result.opening_hours.open_now,
        periods: result.opening_hours.periods
      } : undefined
    }));

    return places.slice(0, maxResults);
  }

  /**
   * Get detailed information for a specific place
   */
  async getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
    const url = `${this.baseUrl}/details/json`;
    
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'place_id,name,formatted_address,geometry,rating,price_level,types,formatted_phone_number,website,opening_hours',
      key: this.googleMapsApiKey,
    });

    try {
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();

      if (data.status !== 'OK') {
        console.error('Place details error:', data.status, data.error_message);
        return null;
      }

      const result = data.result;
      return {
        place_id: result.place_id,
        name: result.name,
        address: result.formatted_address || '',
        latitude: result.geometry?.location?.lat || 0,
        longitude: result.geometry?.location?.lng || 0,
        rating: result.rating,
        price_level: result.price_level,
        types: result.types || [],
        phone_number: result.formatted_phone_number,
        website: result.website,
        opening_hours: result.opening_hours ? {
          open_now: result.opening_hours.open_now,
          periods: result.opening_hours.periods
        } : undefined
      };
    } catch (error) {
      console.error('Error getting place details:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two coordinates in miles
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Expand search radius if insufficient results found
   */
  async searchWithExpandingRadius(
    initialParams: SearchParams,
    minResults: number = 3,
    maxRadius: number = 25
  ): Promise<SearchResult> {
    let currentRadius = initialParams.radius;
    let result: SearchResult;

    do {
      result = await this.searchPlaces({
        ...initialParams,
        radius: currentRadius
      });

      if (result.places.length >= minResults || currentRadius >= maxRadius) {
        break;
      }

      // Expand radius by 50%
      currentRadius = Math.min(currentRadius * 1.5, maxRadius);
    } while (currentRadius <= maxRadius);

    return result;
  }
}

// Common place types for different task categories
export const PLACE_TYPES = {
  GROCERY: [
    { type: 'grocery_or_supermarket', keywords: ['grocery', 'supermarket', 'food'] },
    { type: 'supermarket', keywords: ['supermarket', 'grocery'] }
  ],
  PHARMACY: [
    { type: 'pharmacy', keywords: ['pharmacy', 'drugstore', 'medicine'] }
  ],
  GAS_STATION: [
    { type: 'gas_station', keywords: ['gas', 'fuel', 'petrol'] }
  ],
  RESTAURANT: [
    { type: 'restaurant', keywords: ['restaurant', 'food', 'dining'] },
    { type: 'meal_takeaway', keywords: ['takeaway', 'takeout'] }
  ],
  BANK: [
    { type: 'bank', keywords: ['bank', 'atm'] },
    { type: 'atm', keywords: ['atm', 'cash'] }
  ],
  SHOPPING: [
    { type: 'shopping_mall', keywords: ['mall', 'shopping'] },
    { type: 'store', keywords: ['store', 'shop'] }
  ],
  MEDICAL: [
    { type: 'hospital', keywords: ['hospital', 'medical'] },
    { type: 'doctor', keywords: ['doctor', 'clinic'] }
  ],
  FITNESS: [
    { type: 'gym', keywords: ['gym', 'fitness', 'workout'] }
  ]
} as const;