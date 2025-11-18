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
} from 'react-native';
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
}

export function ChatAssistant({ onTaskCreated, initialMessage }: ChatAssistantProps) {
  const { actualTheme, colors } = useTheme();
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
        <View
          style={[
            styles.messageBubble,
            {
              backgroundColor: isUser ? colors.tint : (actualTheme === 'dark' ? colors.cardBackground : '#d3d3d3'),
            },
          ]}
        >
          <Text
            style={[
              styles.messageText,
              { color: isUser ? '#fff' : colors.text },
            ]}
          >
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message, index) => renderMessage(message, index))}
        
        {streamingText && (
          <View style={[styles.messageContainer, styles.assistantMessage]}>
            <View
              style={[
                styles.messageBubble,
                { backgroundColor: actualTheme === 'dark' ? colors.cardBackground : '#d3d3d3' },
              ]}
            >
              <Text style={[styles.messageText, { color: colors.text }]}>
                {streamingText}
                <Text style={styles.typingIndicator}>▋</Text>
              </Text>
            </View>
          </View>
        )}
        
        {isLoading && !streamingText && (
          <View style={[styles.messageContainer, styles.assistantMessage]}>
            <View
              style={[
                styles.messageBubble,
                { backgroundColor: actualTheme === 'dark' ? colors.cardBackground : '#d3d3d3' },
              ]}
            >
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.inputContainer,
          { backgroundColor: colors.background, borderTopColor: colors.borderColor },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.background },
          ]}
          placeholder="Type a message..."
          placeholderTextColor={colors.text + '80'}
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
            { backgroundColor: colors.tint },
            (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedIcon name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
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
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  typingIndicator: {
    opacity: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

