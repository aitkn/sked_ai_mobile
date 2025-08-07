import { LocationSearcher, PLACE_TYPES, SearchParams } from './location_searcher.js';

/**
 * Demo showcasing the LocationSearcher functionality
 * This file demonstrates different search scenarios and usage patterns
 */

// Mock Google Maps API key - replace with actual key for testing
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY_HERE';

async function runLocationSearcherDemo() {
  const searcher = new LocationSearcher(GOOGLE_MAPS_API_KEY);

  console.log('🗺️  Location Searcher Demo Starting...\n');

  // Demo 1: Search for grocery stores near home
  console.log('📍 Demo 1: Finding grocery stores near home (San Diego)');
  try {
    const grocerySearch: SearchParams = {
      location: {
        latitude: 32.7157,
        longitude: -117.1611,
        name: 'home'
      },
      radius: 5, // 5 miles
      placeTypes: PLACE_TYPES.GROCERY,
      maxResults: 5,
      minRating: 4.0
    };

    const groceryResults = await searcher.searchPlaces(grocerySearch);
    console.log(`Found ${groceryResults.places.length} grocery stores:`);
    
    groceryResults.places.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.name}`);
      console.log(`     📍 ${place.address}`);
      console.log(`     ⭐ Rating: ${place.rating || 'N/A'}`);
      console.log(`     📏 Distance: ${place.distance} miles`);
      console.log('');
    });
  } catch (error) {
    console.log('❌ Demo 1 failed:', error instanceof Error ? error.message : error);
  }

  // Demo 2: Multi-type search for errands
  console.log('🛍️  Demo 2: Finding places for multiple errands (pharmacy + bank)');
  try {
    const errandSearch: SearchParams = {
      location: {
        latitude: 32.7157,
        longitude: -117.1611,
        name: 'current location'
      },
      radius: 3,
      placeTypes: [
        ...PLACE_TYPES.PHARMACY,
        ...PLACE_TYPES.BANK
      ],
      maxResults: 8
    };

    const errandResults = await searcher.searchPlaces(errandSearch);
    console.log(`Found ${errandResults.places.length} places for errands:`);
    
    // Group by type for better display
    const pharmacies = errandResults.places.filter(p => 
      p.types.some(type => ['pharmacy', 'drugstore'].includes(type))
    );
    const banks = errandResults.places.filter(p => 
      p.types.some(type => ['bank', 'atm', 'finance'].includes(type))
    );

    console.log('💊 Pharmacies:');
    pharmacies.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.name} (${place.distance} mi, ⭐${place.rating || 'N/A'})`);
    });

    console.log('🏦 Banks/ATMs:');
    banks.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.name} (${place.distance} mi, ⭐${place.rating || 'N/A'})`);
    });
    console.log('');
  } catch (error) {
    console.log('❌ Demo 2 failed:', error instanceof Error ? error.message : error);
  }

  // Demo 3: Expanding radius search
  console.log('📡 Demo 3: Expanding radius search for specialized places');
  try {
    const specializedSearch: SearchParams = {
      location: {
        latitude: 32.7157,
        longitude: -117.1611,
        name: 'home'
      },
      radius: 2, // Start with small radius
      placeTypes: PLACE_TYPES.FITNESS,
      maxResults: 3,
      minRating: 4.2 // High rating requirement
    };

    console.log('Starting with 2-mile radius...');
    const expandedResults = await searcher.searchWithExpandingRadius(
      specializedSearch,
      3, // minimum results needed
      15 // max radius in miles
    );
    
    console.log(`Found ${expandedResults.places.length} high-rated gyms within ${expandedResults.searchParams.radius} miles:`);
    expandedResults.places.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.name}`);
      console.log(`     📍 ${place.address}`);
      console.log(`     ⭐ Rating: ${place.rating}`);
      console.log(`     📏 Distance: ${place.distance} miles`);
      console.log('');
    });
  } catch (error) {
    console.log('❌ Demo 3 failed:', error instanceof Error ? error.message : error);
  }

  // Demo 4: Task-specific search simulation
  console.log('🎯 Demo 4: Task-specific location search simulation');
  await simulateTaskLocationSearch(searcher);

  console.log('✅ Location Searcher Demo Complete!');
}

/**
 * Simulate how the location searcher would be used in task processing
 */
async function simulateTaskLocationSearch(searcher: LocationSearcher) {
  // Simulate different task scenarios
  const taskScenarios = [
    {
      task: 'Buy milk and bread',
      expectedLocation: 'home',
      coordinates: { latitude: 32.7157, longitude: -117.1611 },
      placeTypes: PLACE_TYPES.GROCERY,
      reason: 'Need grocery store for food items'
    },
    {
      task: 'Pick up prescription',
      expectedLocation: 'work',
      coordinates: { latitude: 32.7249, longitude: -117.1565 },
      placeTypes: PLACE_TYPES.PHARMACY,
      reason: 'Need pharmacy for prescription pickup'
    },
    {
      task: 'Grab dinner',
      expectedLocation: 'current location',
      coordinates: { latitude: 32.7100, longitude: -117.1500 },
      placeTypes: PLACE_TYPES.RESTAURANT,
      reason: 'Need restaurant for dining'
    }
  ];

  for (const scenario of taskScenarios) {
    console.log(`\n📋 Task: "${scenario.task}"`);
    console.log(`🧠 Analysis: ${scenario.reason}`);
    console.log(`📍 Search center: ${scenario.expectedLocation}`);

    try {
      const searchParams: SearchParams = {
        location: {
          ...scenario.coordinates,
          name: scenario.expectedLocation
        },
        radius: 5,
        placeTypes: scenario.placeTypes,
        maxResults: 3,
        minRating: 3.5
      };

      const results = await searcher.searchPlaces(searchParams);
      console.log(`✅ Found ${results.places.length} suitable locations:`);
      
      results.places.forEach((place, index) => {
        console.log(`  ${index + 1}. ${place.name} (${place.distance} mi, ⭐${place.rating || 'N/A'})`);
      });
      
      // Simulate user selection logic
      if (results.places.length === 1) {
        console.log(`🎯 Auto-selecting: ${results.places[0].name} (single obvious choice)`);
      } else if (results.places.length > 1) {
        console.log(`🤔 Multiple options available - would present to user for selection`);
      } else {
        console.log(`😞 No suitable locations found - would expand search or request manual input`);
      }
      
    } catch (error) {
      console.log(`❌ Search failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

/**
 * Demo showing place details lookup
 */
async function demoPlaceDetails(searcher: LocationSearcher, placeId: string) {
  console.log(`🔍 Getting detailed information for place: ${placeId}`);
  
  try {
    const details = await searcher.getPlaceDetails(placeId);
    if (details) {
      console.log('📋 Place Details:');
      console.log(`  Name: ${details.name}`);
      console.log(`  Address: ${details.address}`);
      console.log(`  Rating: ${details.rating || 'N/A'}`);
      console.log(`  Phone: ${details.phone_number || 'N/A'}`);
      console.log(`  Website: ${details.website || 'N/A'}`);
      console.log(`  Open Now: ${details.opening_hours?.open_now ? 'Yes' : 'No/Unknown'}`);
      console.log(`  Types: ${details.types.join(', ')}`);
    } else {
      console.log('❌ Could not retrieve place details');
    }
  } catch (error) {
    console.log(`❌ Error getting place details: ${error}`);
  }
}

// Helper function to demonstrate different search strategies
async function demonstrateSearchStrategies(searcher: LocationSearcher) {
  console.log('\n🎯 Search Strategy Demonstrations:\n');

  const baseLocation = {
    latitude: 32.7157,
    longitude: -117.1611,
    name: 'home'
  };

  // Strategy 1: High-confidence auto-selection
  console.log('Strategy 1: High-confidence auto-selection');
  const highConfidenceSearch: SearchParams = {
    location: baseLocation,
    radius: 2,
    placeTypes: PLACE_TYPES.PHARMACY,
    maxResults: 5,
    minRating: 4.5 // Very high rating
  };

  try {
    const results = await searcher.searchPlaces(highConfidenceSearch);
    if (results.places.length === 1) {
      console.log(`✅ Auto-selecting high-rated pharmacy: ${results.places[0].name}`);
    } else {
      console.log(`📋 ${results.places.length} high-rated pharmacies found - would present options`);
    }
  } catch (error) {
    console.log(`❌ Strategy 1 failed: ${error}`);
  }

  // Strategy 2: Fallback to broader search
  console.log('\nStrategy 2: Fallback to broader search');
  try {
    const narrowResults = await searcher.searchWithExpandingRadius({
      location: baseLocation,
      radius: 1, // Very small initial radius
      placeTypes: PLACE_TYPES.GAS_STATION,
      maxResults: 3
    }, 2, 10);

    console.log(`🔍 Expanded search found ${narrowResults.places.length} gas stations within ${narrowResults.searchParams.radius} miles`);
  } catch (error) {
    console.log(`❌ Strategy 2 failed: ${error}`);
  }
}

// Export for use in other files or testing
export {
  runLocationSearcherDemo,
  simulateTaskLocationSearch,
  demoPlaceDetails,
  demonstrateSearchStrategies
};

// Run demo if file is executed directly
if (require.main === module) {
  runLocationSearcherDemo().catch(console.error);
}