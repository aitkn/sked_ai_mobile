// Polyfills for React Native
import 'react-native-get-random-values';
import { polyfillWebCrypto } from 'expo-standard-web-crypto';

polyfillWebCrypto();

// Global polyfills
global.Buffer = require('buffer').Buffer;
global.process = require('process');
global.process.env = {};
global.process.version = 'v16.0.0';

// Stub WebSocket modules that cause issues
if (typeof __dirname === 'undefined') {
  global.__dirname = '/';
}
if (typeof __filename === 'undefined') {
  global.__filename = '';
}

// Mock net module for WebSocket
global.net = {
  Socket: class Socket {},
  createConnection: () => null,
};