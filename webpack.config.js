module.exports = /** @type {import('webpack').Configuration} */ ({
  mode: 'production',
  target: 'webworker',
  entry: {
    'extension': './extension.js',
  },
  output: {
    library: {
      type: 'commonjs',
    },
  },
  optimization: {
    moduleIds: 'named',
    minimize: false,
  },
  resolve: {
    aliasFields: ['browser', 'webpackAlias'],
  },
  externals: {
    vscode: 'commonjs vscode',
  },
});
