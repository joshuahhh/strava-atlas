const { resolve } = require('path');
const webpack = require("webpack");
const _ = require('lodash');
const SpeedMeasurePlugin = require("speed-measure-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const PROD = process.env.NODE_ENV === 'production';

module.exports = {
    mode: process.env.NODE_ENV,
    entry: {
        main: _.compact([ './src/main.ts', !PROD && 'webpack-hot-middleware/client?reload=true' ]),
        hub: _.compact([ './src/hub.ts', !PROD && 'webpack-hot-middleware/client?reload=true' ]),
    },
    output: {
        filename: 'js/[name].js',
        path: resolve(__dirname, 'public'),
    },
    devtool: PROD ? 'source-map' : 'eval-cheap-source-map',
    resolve: {
        extensions: [".ts", ".js", ".json"],

        alias: {
            // incorporates https://github.com/pixijs/pixi.js/pull/6928
            // built from https://github.com/pixijs/pixi.js#10983e29
            'pixi.js': resolve(__dirname, 'vendor/pixi.min.mjs'),

            // incorporates https://github.com/Leaflet/Leaflet/pull/6522
            // built from https://github.com/joshuahhh/Leaflet.git#2b8c9865
            'leaflet$': resolve(__dirname, 'vendor/leaflet-src.js'),
        },
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)?$/,
                loader: 'ts-loader',
                options: { transpileOnly: true },
                exclude: '/node_modules/',
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
                loader: 'url-loader',
            },
        ]
    },
    plugins: _.compact([
        new SpeedMeasurePlugin(),
        new ForkTsCheckerWebpackPlugin({ typescript: { configFile: 'src/tsconfig.json' } }),
        !PROD && new webpack.HotModuleReplacementPlugin(),
        // !PROD && new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)(),
    ])
};