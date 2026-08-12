module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated must be listed LAST (required by the library).
      'react-native-reanimated/plugin',
    ],
  };
};
