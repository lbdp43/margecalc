module.exports = function (api) {
  // api.caller() keys the cache on platform; do NOT also call api.cache(true).
  const platform = api.caller((caller) => caller && caller.platform);
  return {
    presets: [['babel-preset-expo', { reanimated: false }]],
    plugins: [
      // Must stay last. On web, drop worklet source strings only the native runtime needs.
      ['react-native-reanimated/plugin', { omitNativeOnlyData: platform === 'web' }],
    ],
  };
};
