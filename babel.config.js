// Expo SDK 57's babel-preset-expo auto-adds react-native-reanimated/plugin
// and react-native-worklets/plugin whenever those packages are detected —
// no manual plugin wiring needed here (unlike older Expo/Reanimated setups).
// See node_modules/expo/node_modules/babel-preset-expo/README.md.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
