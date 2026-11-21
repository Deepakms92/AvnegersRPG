import { registerRootComponent } from 'expo';

// Must load first: handles notification buttons while the app is closed.
import './src/backgroundTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
