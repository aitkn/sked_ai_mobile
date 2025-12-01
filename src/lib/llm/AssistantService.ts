/**
 * Assistant Service for Mobile
 *
 * LLM-powered scheduling assistant using Claude API
 * Handles chat, task creation, and schedule management
 * Adapted from web version for React Native
 */

import llmConfig, { validateLLMConfig } from './config';
import { supabase } from '../supabase';
import { getEnabledFeatures, getFeaturePromptAdditions } from './featureFlags';

/**
 * Generate comprehensive system prompt (static, cacheable)
 */
function generateSystemPrompt(): string {
  const enabledFeatures = getEnabledFeatures();
  const featureAdditions = getFeaturePromptAdditions();

  return `You are an AI scheduling assistant for Sked AI, a constraint-based scheduling application.

Your role is to help users create and manage tasks in their schedule. The system uses a sophisticated constraint solver to generate optimal schedules based on user requirements.

## ⚠️ CRITICAL REQUIREMENTS - READ THIS FIRST ⚠️

**EVERY task you create MUST have:**
1. **At least ONE entity** (who will do the task) - REQUIRED in entity_names array
2. **At least ONE location** (where the task will happen) - REQUIRED in location_name field

**These are NOT optional. The system will REJECT tasks without entities and locations.**

**WORKFLOW FOR EVERY TASK REQUEST:**
1. **FIRST**: Call get_user_context to see existing entities and locations
2. **THEN**: Make reasonable inferences based on what exists:
   - "I need to clean my desk" + "Office" exists → entity = user, location = "Office"
   - "workout" + "Gym" exists → location = "Gym"
   - "John should review" + "John" exists → entity = "John"
3. **ONLY ASK** if truly ambiguous or no reasonable match exists

**Before calling create_schedule:**
- Verify EVERY task has entity_names array with at least one name
- Verify EVERY task has location_name specified
- If either is missing → DO NOT call create_schedule

## Core Capabilities

You can help users:
1. Create simple tasks with specific times and durations
2. Create complex tasks with constraints, entities (people), and locations
3. Schedule meetings with duration, participants, and location
4. Understand natural language time references (tomorrow, next week, etc.)

## Constraint Language

### Available Attributes

| Attribute | Type | Description | Examples |
|-----------|------|-------------|----------|
| **duration** | Duration | Task duration (5-min granularity) | "duration == 1h", "duration >= 30m" |
| **start** | Datetime | Exact start datetime (ISO format) | "start == YYYY-MM-DDTHH:MM" |
| **end** | Datetime | Exact end datetime (ISO format) | "end == YYYY-MM-DDTHH:MM" |
| **start_time** | Time | Time of day for start (any day) | "start_time >= 09:00" |
| **end_time** | Time | Time of day for end (any day) | "end_time <= 17:00" |
| **temp_c** | Temperature | Temperature during entire task | "temp_c >= 20°C" |
| **start_temp_c** | Temperature | Temperature at task start | "start_temp_c >= 15°C" |
| **end_temp_c** | Temperature | Temperature at task end | "end_temp_c <= 30°C" |
| **is_day** | Boolean | Daylight hours (true) or night (false) | "is_day == true" |

### Supported Operations

All attributes support all operations (where type-appropriate):

**Comparison operators**: ==, !=, >=, <=, >, <
- Examples: "duration >= 30m", "start_time <= 17:00", "temp_c > 20°C"

**Range operators**: in, between
- Range: "temp_c in 15-25°C", "duration in 30m-2h"
- List: "duration in [30m, 1h, 2h]"

**Logical operators**: & (AND), | (OR)
- AND: "duration >= 30m & duration <= 2h"
- OR: "temp_c < 10°C | temp_c > 25°C"
- Parentheses: "(start_time >= 09:00 & start_time <= 12:00) | (start_time >= 14:00 & start_time <= 17:00)"

### When to Use Each Attribute

**Use start/end (datetime)** for specific dates/times:
- "tomorrow at 2pm" → "start == YYYY-MM-DDT14:00" (use actual date from current context)
- "on Monday at 9am" → "start == YYYY-MM-DDT09:00" (use actual date from current context)

**Use start_time/end_time (time of day)** for recurring/flexible times:
- "after 9am" → "start_time >= 09:00"
- "before 5pm" → "end_time <= 17:00"
- "during business hours" → "start_time >= 09:00 & end_time <= 17:00"

**Use duration** for task length:
- "1 hour meeting" → "duration == 1h"
- "at least 30 minutes" → "duration >= 30m"

### Supported Units

**Duration**: m (minutes), h (hours), d (days), compound (1h30m)
**Time**: 24-hour (09:00) or 12-hour (9:00am)
**Temperature**: °C or °F (auto-converts)

Note: Priority is a task parameter in the JSON payload, NOT a constraint attribute.

${featureAdditions}

## JSON Payload Structure

Use the create_schedule tool with this structure:

**Example 1** ("Schedule a meeting with John tomorrow at 2pm for 1 hour")
\`\`\`json
{
  "tasks": [{
    "name": "Meeting",
    "description": "Team meeting",
    "priority": "normal",
    "entity_names": ["Proshkin", "John"],
    "location_name": "Office",
    "constraints": [
      "start == <TOMORROW_DATE>T14:00",
      "duration == 1h"
    ]
  }],
  "entities": [{"name": "John", "is_person": true}]
}
\`\`\`
Note: Replace <TOMORROW_DATE> with actual date calculated from current context.

**Example 2** ("I need to workout sometime after 9am")
\`\`\`json
{
  "tasks": [{
    "name": "Workout",
    "priority": "normal",
    "entity_names": ["Proshkin"],
    "location_name": "Gym",
    "constraints": [
      "duration == 1h",
      "start_time >= 09:00"
    ]
  }]
}
\`\`\`

**Example 3** ("Clean my desk before Wednesday")
\`\`\`json
{
  "tasks": [{
    "name": "Clean desk",
    "priority": "normal",
    "entity_names": ["Proshkin"],
    "location_name": "Office",
    "constraints": [
      "end <= <WEDNESDAY_DATE>T23:59",
      "duration == 30m"
    ]
  }]
}
\`\`\`
Note: Replace <WEDNESDAY_DATE> with actual date calculated from current context.

## MANDATORY PRE-CREATION CHECKLIST

Before creating ANY task, you MUST answer these questions to yourself (no exceptions):

1. **REQUIRED: What entity(s) is this task for?** 🚨
   - MUST identify who/what will perform this task
   - "I need to clean" → user entity (check with get_user_context for user's name)
   - "John needs to..." → John entity
   - If NO entity can be determined → STOP and ASK the user
   - DO NOT proceed without at least one entity

2. **REQUIRED: What location(s) is this task for?** 🚨
   - MUST identify where this task will happen
   - "clean my desk" → likely "Office" (check with get_user_context for existing locations)
   - "workout" → likely "Gym"
   - "at home" → "Home"
   - If NO location can be reasonably inferred → STOP and ASK the user
   - DO NOT proceed without at least one location

3. **What explicit constraints did the user specify?**
   - Times/dates mentioned?
   - Duration mentioned?
   - Conditions mentioned? (weather, temperature, time of day)
   - List ALL explicit information

4. **What implicit constraints can I infer?**
   - "morning" → start_time constraints?
   - "outdoor" → weather/daylight constraints?
   - "lunch" → time constraints?
   - Are these inferences reasonable?

5. **Do I have all needed information?**
   - ✅ Have entity? ✅ Have location? ✅ Have constraints?
   - Am I missing critical information?
   - If missing entity or location → STOP and ASK

6. **Are my guesses solid, or do I need user confirmation?**
   - If task is simple and obvious → create directly
   - If I made any inferences → show human-readable summary and confirm
   - If ambiguous or complex → ask for clarification first

VALIDATION BEFORE create_schedule:
- ✅ entity_names array has at least one name
- ✅ location_name is specified
- If either is missing → DO NOT call create_schedule, ASK user instead

## Important Guidelines

### Extracting Information from User Requests

1. **Extract ALL explicit information**: Parse everything the user says
   - Times: "tomorrow at 2pm" → "start == 2025-11-03T14:00"
   - Durations: "for 1 hour" → "duration == 1h"
   - Time ranges: "after 9am" → "start_time >= 09:00"
   - Conditions: "if it's warm" → "temp_c >= 20°C"
   - Preferences: "during daylight" → "is_day == true"

2. **Handle follow-up messages**: When user provides additional information in a follow-up message, apply it to the most recent task request
   - If you asked "How long?" and user responds "2 hours" → use "duration == 2h" for the task you were discussing
   - If you asked "What time?" and user responds "6pm" → use "start == <DATE>T18:00" for the task
   - ALWAYS include ALL information from the ENTIRE conversation when creating a task
   - Review the full conversation history before creating any task to ensure you capture all details

3. **Infer implicit information**: Consider what the user might mean
   - "morning workout" might imply "start_time >= 06:00 & start_time <= 09:00"
   - "lunch meeting" might imply "start_time >= 12:00 & start_time <= 13:00"
   - "outdoor task" might imply temperature or daylight constraints

4. **Confirm before creating** (unless absolutely obvious):
   - Show human-readable constraints to user
   - Example: "I'll create a task with these constraints: starts tomorrow at 2pm, duration 1 hour, temperature above 20°C. Is this correct?"
   - Wait for user confirmation or corrections
   - Only skip confirmation for very simple, unambiguous tasks

5. **Ask when uncertain**: If user request is ambiguous or missing information, ask clarifying questions
   - "Should this be during business hours?"
   - "Do you want this scheduled for a specific time or just sometime today?"
   - "Should I add any temperature or weather constraints?"

6. **All constraints go in the constraints array**: Never use separate fields for duration, time, etc.
   - Duration MUST be in constraints: "duration == 2h" (NOT in a separate duration field)
   - When user says "2 hours" in a follow-up, add "duration == 2h" to the constraints array

7. **Always create entities**: Every task needs at least one entity (person or object performing it)

## Enabled Features

Currently enabled: ${enabledFeatures}

The solver will find optimal times based on all constraints and user's existing schedule.`;
}

// System prompt - generated dynamically
const SYSTEM_PROMPT = generateSystemPrompt();

// Tool definitions for Claude
const TOOLS = [
  {
    name: 'create_schedule',
    description: 'Create tasks with entities, locations, and constraints. Accepts complex JSON payload.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Task name' },
              description: { type: 'string', description: 'Task description' },
              priority: {
                type: 'string',
                enum: ['optional', 'low', 'below normal', 'normal', 'above normal', 'high', 'critical'],
                description: 'Task priority'
              },
              duration: { type: 'number', description: 'Duration in minutes' },
              entity_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Names of people/entities'
              },
              location_name: { type: 'string', description: 'Location name' },
              constraints: {
                type: 'array',
                items: { type: 'string' },
                description: 'Constraint strings like "duration >= 30m", "start_time >= 09:00"'
              },
              schedule: { type: 'boolean', description: 'Schedule immediately (default: true)' }
            },
            required: ['name']
          },
          description: 'Array of tasks to create'
        },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              is_person: { type: 'boolean', description: 'True for people, false for objects/vehicles' }
            },
            required: ['name']
          },
          description: 'Entities (people/objects) to create if they don\'t exist'
        },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              address: { type: 'string', description: 'Optional address' }
            },
            required: ['name']
          },
          description: 'Locations to create if they don\'t exist'
        }
      },
      required: ['tasks']
    },
  },
];

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
}

interface ClaudeResponse {
  content: ContentBlock[];
  fullText: string;
}

/**
 * Assistant Service class
 */
export class AssistantService {
  private conversationHistory: Message[] = [];
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = validateLLMConfig();
  }

  /**
   * Send a message to the assistant
   *
   * @param {string} userMessage - User's message
   * @param {Function} onChunk - Callback for streaming chunks (optional)
   * @returns {Promise<string>} Assistant's response
   */
  async sendMessage(userMessage: string, onChunk?: (chunk: string) => void): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('LLM not configured. Please set ANTHROPIC_API_KEY in environment variables.');
    }

    console.log('[AssistantService] Sending message:', userMessage);

    // Prepend current time and timezone to user message for context
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const messageWithContext = `[Current date and time: ${now.toLocaleString()} (${timezone})]

${userMessage}`;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: messageWithContext,
    });

    try {
      // Call Claude API (may involve multiple turns for tool use)
      const response = await this.callClaudeAPIWithTools(onChunk);

      console.log('[AssistantService] Final response:', response);
      return response;

    } catch (error: any) {
      console.error('[AssistantService] Error:', error);

      // Remove user message from history on error
      this.conversationHistory.pop();

      throw error;
    }
  }

  /**
   * Call Claude API with automatic tool execution handling
   * Handles multi-turn conversations when tools are used
   * Supports streaming!
   *
   * @param {Function} onChunk - Callback for streaming chunks
   * @returns {Promise<string>} Final response text
   */
  private async callClaudeAPIWithTools(onChunk?: (chunk: string) => void): Promise<string> {
    let continueLoop = true;
    let finalText = '';

    while (continueLoop) {
      // Call Claude API with streaming enabled
      const data = await this.callClaudeAPI(onChunk);

      // Check if Claude wants to use tools
      const toolUseBlocks = data.content.filter(block => block.type === 'tool_use');

      if (toolUseBlocks.length > 0) {
        console.log('[AssistantService] Processing tool use blocks:', toolUseBlocks.length);

        // Add assistant's tool use to history
        this.conversationHistory.push({
          role: 'assistant',
          content: data.content, // Full content with tool_use blocks
        });

        // Execute all tools and collect results
        const toolResults = [];
        for (const toolBlock of toolUseBlocks) {
          const result = await this.executeTool(toolBlock.name!, toolBlock.input, toolBlock.id!);
          toolResults.push(result);
        }

        // Add tool results to history
        this.conversationHistory.push({
          role: 'user',
          content: toolResults,
        });

        // Continue loop to get Claude's final response
        continue;
      }

      // No tools used, extract text and finish
      finalText = data.fullText;

      // Add final assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: finalText,
      });

      continueLoop = false;
    }

    return finalText;
  }

  /**
   * Get authorization header with JWT token
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    console.log('[AssistantService] Getting auth session...');
    const { data: { session }, error } = await supabase.auth.getSession();

    console.log('[AssistantService] Session:', session ? 'Found' : 'Not found');
    console.log('[AssistantService] Session error:', error);

    if (error) {
      console.error('[AssistantService] Session error:', error);
      throw new Error(`Auth error: ${error.message}`);
    }

    if (!session) {
      console.error('[AssistantService] No session found. User not authenticated.');
      throw new Error('User not authenticated. Please sign in.');
    }

    console.log('[AssistantService] User email:', session.user?.email);
    console.log('[AssistantService] Token (first 50 chars):', session.access_token?.substring(0, 50));

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    };
  }

  /**
   * Call Edge Function / Claude API
   *
   * @param {Function} onChunk - Callback for streaming chunks
   * @returns {Promise<ClaudeResponse>} Full response data object
   */
  private async callClaudeAPI(onChunk?: (chunk: string) => void): Promise<ClaudeResponse> {
    // Get user's timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const requestBody = {
      messages: this.conversationHistory,
      timezone: timezone,
    };

    console.log('[AssistantService] Calling', llmConfig.useEdgeFunction ? 'Edge Function' : 'Proxy');
    console.log('[AssistantService] URL:', llmConfig.apiUrl);
    console.log('[AssistantService] Messages in history:', this.conversationHistory.length);

    try {
      const headers = llmConfig.useEdgeFunction
        ? await this.getAuthHeaders()
        : {
            'Content-Type': 'application/json',
            // Note: For proxy mode, API key would need to be configured
            'anthropic-version': '2023-06-01',
          };

      const response = await fetch(llmConfig.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      console.log('[AssistantService] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AssistantService] API error response:', errorText);

        // Try to parse error details if available
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.details) {
            console.error('[AssistantService] Claude API error details:', errorData.details);
          }
        } catch (e) {
          // Not JSON, ignore
        }

        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      // Handle streaming response
      if (onChunk) {
        return await this.handleStreamingResponse(response, onChunk);
      }

      // Handle non-streaming response
      const data = await response.json();
      console.log('[AssistantService] Response data:', data);
      return data;

    } catch (error) {
      console.error('[AssistantService] Fetch error:', error);
      throw error;
    }
  }

  /**
   * Handle streaming response from Claude API
   * Adapted for React Native (uses TextDecoder which should be available)
   *
   * @param {Response} response - Fetch response object
   * @param {Function} onChunk - Callback for chunks
   * @returns {Promise<ClaudeResponse>} Response object with content blocks and text
   */
  private async handleStreamingResponse(
    response: Response,
    onChunk: (chunk: string) => void
  ): Promise<ClaudeResponse> {
    // React Native doesn't always support response.body.getReader()
    // Check if streaming is supported, otherwise fall back to text parsing
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    
    try {
      if (response.body && typeof response.body.getReader === 'function') {
        reader = response.body.getReader();
      }
    } catch (e) {
      console.log('[AssistantService] getReader() not available:', e);
    }
    
    if (!reader) {
      // Fallback: Read entire response as text and parse manually
      console.log('[AssistantService] Streaming not supported, using text fallback');
      const text = await response.text();
      return this.parseStreamingText(text, onChunk);
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    const contentBlocks: ContentBlock[] = [];
    let currentToolBlock: ContentBlock | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr);

              // Handle content_block_start
              if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'text') {
                  contentBlocks.push({ type: 'text', text: '' });
                } else if (event.content_block?.type === 'tool_use') {
                  console.log('[AssistantService] Tool use detected:', event.content_block.name);
                  currentToolBlock = {
                    type: 'tool_use',
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: '',
                  };
                  contentBlocks.push(currentToolBlock);
                }
              }

              // Handle text deltas
              if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta.type === 'text_delta') {
                  fullText += delta.text;
                  if (contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1].type === 'text') {
                    contentBlocks[contentBlocks.length - 1].text = (contentBlocks[contentBlocks.length - 1].text || '') + delta.text;
                  }
                  if (onChunk) {
                    onChunk(delta.text);
                  }
                }
                // Handle tool input JSON deltas
                else if (delta.type === 'input_json_delta') {
                  if (currentToolBlock) {
                    currentToolBlock.input = (currentToolBlock.input || '') + delta.partial_json;
                  }
                }
              }

              // Handle content_block_stop
              if (event.type === 'content_block_stop') {
                if (currentToolBlock) {
                  // Parse tool input JSON, or set to empty object if no input
                  if (currentToolBlock.input && typeof currentToolBlock.input === 'string' && currentToolBlock.input.trim()) {
                    try {
                      const parsed = JSON.parse(currentToolBlock.input);
                      console.log('[AssistantService] Parsed tool input JSON successfully');
                      currentToolBlock.input = parsed;
                    } catch (e) {
                      console.error('[AssistantService] Failed to parse tool input JSON:', currentToolBlock.input);
                      console.error('[AssistantService] Parse error:', e);
                      // Try to fix common issues: remove trailing commas, fix quotes, etc.
                      try {
                        // Remove trailing commas before closing brackets/braces
                        let fixed = currentToolBlock.input.replace(/,(\s*[}\]])/g, '$1');
                        const parsed = JSON.parse(fixed);
                        console.log('[AssistantService] Successfully parsed after fixing trailing commas');
                        currentToolBlock.input = parsed;
                      } catch (e2) {
                        console.error('[AssistantService] Failed to parse even after fixing:', e2);
                        currentToolBlock.input = {};
                      }
                    }
                  } else {
                    currentToolBlock.input = {};
                  }
                  currentToolBlock = null;
                }
              }

            } catch (e) {
              console.warn('[AssistantService] Failed to parse SSE line:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: contentBlocks, fullText };
  }

  /**
   * Parse streaming text response (fallback for React Native)
   * Parses SSE format text that was received all at once
   *
   * @param {string} text - Full SSE text response
   * @param {Function} onChunk - Callback for chunks
   * @returns {ClaudeResponse} Response object with content blocks and text
   */
  private parseStreamingText(
    text: string,
    onChunk: (chunk: string) => void
  ): ClaudeResponse {
    let fullText = '';
    const contentBlocks: ContentBlock[] = [];
    let currentToolBlock: ContentBlock | null = null;

    // Split by double newlines (SSE event separator)
    const events = text.split('\n\n');

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;

      const lines = eventBlock.split('\n');
      let eventData = '';

      // Extract data line
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          eventData = line.slice(6);
          break;
        }
      }

      if (eventData === '[DONE]' || !eventData) continue;

      try {
        const event = JSON.parse(eventData);

        // Handle content_block_start
        if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'text') {
            contentBlocks.push({ type: 'text', text: '' });
          } else if (event.content_block?.type === 'tool_use') {
            console.log('[AssistantService] Tool use detected:', event.content_block.name);
            currentToolBlock = {
              type: 'tool_use',
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            };
            contentBlocks.push(currentToolBlock);
          }
        }

        // Handle text deltas
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            fullText += delta.text;
            if (contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1].type === 'text') {
              contentBlocks[contentBlocks.length - 1].text = (contentBlocks[contentBlocks.length - 1].text || '') + delta.text;
            }
            if (onChunk) {
              onChunk(delta.text);
            }
          }
          // Handle tool input JSON deltas
          else if (delta.type === 'input_json_delta') {
            if (currentToolBlock) {
              currentToolBlock.input = (currentToolBlock.input || '') + delta.partial_json;
            }
          }
        }

        // Handle content_block_stop
        if (event.type === 'content_block_stop') {
          if (currentToolBlock) {
            // Parse tool input JSON
            if (currentToolBlock.input && typeof currentToolBlock.input === 'string' && currentToolBlock.input.trim()) {
              try {
                const parsed = JSON.parse(currentToolBlock.input);
                currentToolBlock.input = parsed;
              } catch (e) {
                // Try to fix common issues
                try {
                  let fixed = currentToolBlock.input.replace(/,(\s*[}\]])/g, '$1');
                  const parsed = JSON.parse(fixed);
                  currentToolBlock.input = parsed;
                } catch (e2) {
                  currentToolBlock.input = {};
                }
              }
            } else {
              currentToolBlock.input = {};
            }
            currentToolBlock = null;
          }
        }

      } catch (e) {
        console.warn('[AssistantService] Failed to parse SSE event:', eventData);
      }
    }

    return { content: contentBlocks, fullText };
  }

  /**
   * Execute a tool based on its name
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} toolInput - Input parameters for the tool
   * @param {string} toolUseId - Tool use ID from Claude
   * @returns {Promise<Object>} Tool result object
   */
  private async executeTool(toolName: string, toolInput: any, toolUseId: string): Promise<any> {
    console.log('[AssistantService] Executing tool:', toolName, 'with input:', toolInput);
    console.log('[AssistantService] Tool input type:', typeof toolInput);
    if (toolInput && typeof toolInput === 'object') {
      console.log('[AssistantService] Tool input tasks type:', typeof toolInput.tasks);
      console.log('[AssistantService] Tool input tasks value:', toolInput.tasks);
    }

    try {
      // If using Edge Function, call it for tool execution
      if (llmConfig.useEdgeFunction) {
        const headers = await this.getAuthHeaders();

        const response = await fetch(llmConfig.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            execute_tool: {
              name: toolName,
              input: toolInput,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tool execution failed: ${response.status} ${errorText}`);
        }

        const { result } = await response.json();
        console.log('[AssistantService] Tool result from Edge Function:', result);

        // Handle create_schedule result (returns schedule JSON for client to process)
        if (toolName === 'create_schedule' && result.type === 'schedule_json') {
          const scheduleResult = await this.createSchedule(result.payload);
          return {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: JSON.stringify({
              success: true,
              ...scheduleResult,
            }),
          };
        }

        // Return tool result for other tools (like get_user_context)
        return {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: JSON.stringify(result),
        };
      }

      // Fallback for proxy mode
      if (toolName === 'create_schedule') {
        const result = await this.createSchedule(toolInput);
        return {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: JSON.stringify({
            success: true,
            ...result,
            message: `Created ${result.task_count} task(s), ${result.entity_count} entity/entities, ${result.location_count} location(s)`,
          }),
        };
      } else {
        throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      console.error('[AssistantService] Tool execution error:', error);
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        is_error: true,
        content: JSON.stringify({
          success: false,
          error: error.message,
        }),
      };
    }
  }

  /**
   * Create a schedule (tasks, entities, locations) via Supabase RPC
   *
   * @param {Object} payload - Complete schedule payload from tool call
   * @returns {Promise<Object>} Created schedule with task/entity/location IDs
   */
  async createSchedule(payload: any): Promise<any> {
    console.log('[AssistantService] Creating schedule via RPC (raw):', payload);

    // Fix: Parse stringified JSON if needed
    // Sometimes Claude sends tasks/entities/locations as strings instead of arrays
    const normalizedPayload: any = { ...payload };
    
    if (typeof normalizedPayload.tasks === 'string') {
      try {
        normalizedPayload.tasks = JSON.parse(normalizedPayload.tasks);
        console.log('[AssistantService] Parsed tasks from string:', normalizedPayload.tasks);
      } catch (e) {
        console.error('[AssistantService] Failed to parse tasks string:', normalizedPayload.tasks);
        throw new Error('Invalid tasks format: expected array or valid JSON string');
      }
    }
    
    if (typeof normalizedPayload.entities === 'string') {
      try {
        normalizedPayload.entities = JSON.parse(normalizedPayload.entities);
        console.log('[AssistantService] Parsed entities from string:', normalizedPayload.entities);
      } catch (e) {
        console.warn('[AssistantService] Failed to parse entities string, using empty array');
        normalizedPayload.entities = [];
      }
    }
    
    if (typeof normalizedPayload.locations === 'string') {
      try {
        normalizedPayload.locations = JSON.parse(normalizedPayload.locations);
        console.log('[AssistantService] Parsed locations from string:', normalizedPayload.locations);
      } catch (e) {
        console.warn('[AssistantService] Failed to parse locations string, using empty array');
        normalizedPayload.locations = [];
      }
    }

    console.log('[AssistantService] Creating schedule via RPC (normalized):', normalizedPayload);
    console.log('[AssistantService] Normalized payload tasks:', JSON.stringify(normalizedPayload.tasks, null, 2));
    console.log('[AssistantService] Normalized payload entities:', JSON.stringify(normalizedPayload.entities, null, 2));
    console.log('[AssistantService] Normalized payload locations:', JSON.stringify(normalizedPayload.locations, null, 2));

    // Validate payload before sending
    if (!normalizedPayload.tasks || !Array.isArray(normalizedPayload.tasks) || normalizedPayload.tasks.length === 0) {
      console.error('[AssistantService] Invalid payload: tasks must be a non-empty array');
      throw new Error('Invalid payload: tasks must be a non-empty array');
    }

    // Validate each task has required fields and fix duration
    for (const task of normalizedPayload.tasks) {
      if (!task.entity_names || !Array.isArray(task.entity_names) || task.entity_names.length === 0) {
        console.error('[AssistantService] Invalid task: missing entity_names', task);
        throw new Error(`Task "${task.name || 'unnamed'}" is missing required entity_names array`);
      }
      if (!task.location_name || typeof task.location_name !== 'string') {
        console.error('[AssistantService] Invalid task: missing location_name', task);
        throw new Error(`Task "${task.name || 'unnamed'}" is missing required location_name`);
      }

      // Fix: Ensure duration is in constraints if provided as a field
      if (typeof task.duration === 'number' && task.duration > 0) {
        if (!task.constraints) {
          task.constraints = [];
        }
        // Check if duration constraint already exists
        const hasDurationConstraint = task.constraints.some((c: string) => c.includes('duration'));
        if (!hasDurationConstraint) {
          console.log(`[AssistantService] Moving duration (${task.duration}m) to constraints for task "${task.name}"`);
          task.constraints.push(`duration == ${task.duration}m`);
        }
      }
    }

    // Call the new comprehensive RPC function
    const { data, error } = await supabase.rpc('create_schedule_from_llm', {
      p_payload: normalizedPayload,
    });

    if (error) {
      console.error('[AssistantService] Error creating schedule via RPC:', error);
      console.error('[AssistantService] RPC error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('[AssistantService] Schedule created successfully:', data);
    console.log('[AssistantService] Task count:', data.task_count);
    console.log('[AssistantService] Entity count:', data.entity_count);
    console.log('[AssistantService] Location count:', data.location_count);

    // Warn if no tasks were created
    if (data.task_count === 0) {
      console.warn('[AssistantService] WARNING: RPC returned success but created 0 tasks!');
      console.warn('[AssistantService] This might indicate a validation error in the RPC function');
      console.warn('[AssistantService] Payload sent:', JSON.stringify(normalizedPayload, null, 2));
    }

    return data;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    console.log('[AssistantService] Conversation history cleared');
  }
}

// Export singleton instance
export const assistantService = new AssistantService();

export default assistantService;

