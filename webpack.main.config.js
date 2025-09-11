const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-main',
  entry: {
    main: './app/main/main.ts',
    preload: './app/main/preload.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'app'),
      '@shared': path.resolve(__dirname, 'app/shared'),
      '@main': path.resolve(__dirname, 'app/main')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  externals: {
    'electron': 'commonjs2 electron'
  }
};