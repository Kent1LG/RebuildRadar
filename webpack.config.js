const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    resolve: {
        extensions: ['.ts', '.js']
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
    plugins: [
        new CleanWebpackPlugin(),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'media', to: 'media' },
                { from: 'package.json', to: 'package.json' },
                { from: 'README.md', to: 'README.md' },
                { from: 'CHANGELOG.md', to: 'CHANGELOG.md' }
            ]
        })
    ],
    devtool: 'source-map',
    target: 'node',
    externals: {
        vscode: 'commonjs vscode'
    }
};