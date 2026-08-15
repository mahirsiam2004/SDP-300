const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration for ShopFlare.
 * Adds react-native-reanimated's Babel transform (required for the animation
 * runtime to work) and keeps Metro's default asset/transform behaviour.
 */
const defaultConfig = getDefaultConfig(__dirname);
const { transformer, resolver } = defaultConfig;

const config = {
  transformer: {
    ...transformer,
    babelTransformerPath: require.resolve('react-native-reanimated/plugin'),
  },
  resolver: {
    ...resolver,
    assetExts: [...resolver.assetExts, 'bin', 'sql', 'csv'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
