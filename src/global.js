// Polyfills for React Native
import 'react-native-get-random-values';

// Global polyfills
global.process = global.process || {};
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