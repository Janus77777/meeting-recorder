const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-renderer',
  entry: './app/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'app'),
      '@shared': path.resolve(__dirname, 'app/shared'),
      '@renderer': path.resolve(__dirname, 'app/renderer'),
      '@main': path.resolve(__dirname, 'app/main')
    },
    fallback: {
      "global": false,
      "process": false
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './app/renderer/index.html',
      filename: 'index.html'
    }),
    new webpack.DefinePlugin({
      'global': 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    })
  ],
  devServer: {
    port: 3000,
    hot: true
  }
};