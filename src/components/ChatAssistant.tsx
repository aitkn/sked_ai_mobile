/**
 * Chat Assistant Component
 *
 * Mobile chat UI for LLM assistant integration
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { assistantService } from '../lib/llm/AssistantService';
import { useTheme } from '../contexts/ThemeContext';
import Colors from '../constants/Colors';
import ThemedIcon from './ThemedIcon';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatAssistantProps {
  onTaskCreated?: () => void;
  initialMessage?: string;
  onClose?: () => void;
}

export function ChatAssistant({ onTaskCreated, initialMessage, onClose }: ChatAssistantProps) {
  const { actualTheme, colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your scheduling assistant. I can help you create tasks, schedule events, and manage your calendar.\n\nTry: \"Schedule a meeting with John tomorrow at 2pm for 1 hour\"",
    },
  ]);
  const [inputText, setInputText] = useState(initialMessage || '');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  
  const currentDate = new Date().toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  useEffect(() => {
    if (initialMessage) {
      setInputText(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, streamingText]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText.trim();
    setInputText('');
    
    // Add user message to UI
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
    };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);
    setStreamingText('');

    try {
      let fullResponse = '';

      // Send to LLM with streaming
      await assistantService.sendMessage(userMessage, (chunk: string) => {
        fullResponse += chunk;
        setStreamingText(fullResponse);
      });

      // Add assistant response
      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
      setStreamingText('');

      // Trigger callback if task was created
      if (onTaskCreated) {
        // Wait a bit for backend to process
        setTimeout(() => {
          onTaskCreated();
        }, 2000);
      }

    } catch (error: any) {
      console.error('[ChatAssistant] Error:', error);
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      
      if (error.message?.includes('not authenticated') || error.message?.includes('Auth error')) {
        errorMessage = '🔒 Please sign in to use the assistant.';
      } else if (error.message?.includes('not configured')) {
        errorMessage = 'LLM not configured. Please check your settings.';
      } else if (error.message?.includes('401')) {
        errorMessage = '🔒 Authentication failed. Please try signing out and signing in again.';
      }

      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === 'user';
    
    return (
      <View
        key={index}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.assistantMessage,
        ]}
      >
        <View style={isUser ? styles.messageBubble : styles.assistantBubble}>
          <Text style={isUser ? styles.messageText : styles.assistantText}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        contentContainerStyle={styles.keyboardContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header - Fixed at top */}
        <View style={styles.headerSection}>
          <View style={styles.headerContent}>
            <Text style={styles.dateText}>{currentDate}</Text>
            <View style={styles.statusContainer}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>We're online</Text>
            </View>
          </View>
          {onClose && (
            <TouchableOpacity 
              onPress={onClose}
              style={styles.closeButton}
            >
              <FontAwesome name="times" size={22} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        {/* Chat Card Container - wraps messages and input */}
        <View style={styles.chatCard}>
          {/* Scrollable Messages Area - flex-grow fills space */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={true}
          >
            {messages.map((message, index) => renderMessage(message, index))}
            
            {streamingText && (
              <View style={[styles.messageContainer, styles.assistantMessage]}>
                <View style={styles.assistantBubble}>
                  <Text style={styles.assistantText}>
                    {streamingText}
                    <Text style={styles.typingIndicator}>▋</Text>
                  </Text>
                </View>
              </View>
            )}
            
            {isLoading && !streamingText && (
              <View style={[styles.messageContainer, styles.assistantMessage]}>
                <View style={styles.assistantBubble}>
                  <ActivityIndicator size="small" color="#007AFF" />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input Bar - Fixed at bottom, never scrolls */}
          <View style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Message"
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                editable={!isLoading}
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedIcon name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Main container - fills entire screen (100vh equivalent)
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  
  // Keyboard avoiding view - fills container
  keyboardView: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  keyboardContent: {
    flexGrow: 1,
  },
  
  // Header section - fixed height at top
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 12,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    color: '#666',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#888',
  },
  
  // Chat card - takes remaining vertical space (flex-grow)
  chatCard: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0, // Allows ScrollView to calculate height
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  
  // Messages container - scrollable, fills space above input
  messagesContainer: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
  },
  messagesContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
  },
  
  // Message styling
  messageContainer: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  assistantBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#fff',
  },
  assistantText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#000',
  },
  typingIndicator: {
    opacity: 0.5,
  },
  
  // Input container - fixed at bottom, never moves
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : Platform.OS === 'web' ? 60 : 12,
    flexShrink: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: 20,
    fontSize: 15,
    backgroundColor: '#f0f0f0',
    color: '#000',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});

