# `mimic-webpack`
Mimics a webpack config's filename extensions, aliases, and loaders inside of the current node process.

You might want to `mimic.install()`:

* instead of bundling your specs with webpack.
* before using linter rules like [`eslint-plugin-require-path-exists`](https://www.npmjs.com/package/eslint-plugin-require-path-exists).
* when performing universal rendering with code you also plan to bundle with webpack.

## installation
```bash
npm install mimic-webpack
```

## usage

In your entry file:
```js
var Mimic = require('mimic-webpack');
new Mimic({
    webpackConfig: { // pass your webpack config here
        resolve: {
            extensions: ['.foo'],
            alias: {
                myModule: 'theirModule'
            }
        },
        module: {
            loaders: [{
                test: /\.foo$/,
                loader: 'foo-loader'
            }]
        }
    }
}).install();
```

`myModule.foo`:
```js
// code to be processed with foo-loader
```

Now, anywhere in your project, you can do this:
```js
require('theirModule');
```

In the above example:
* `theirModule` is aliased to `myModule` due to `resolve.alias`
* The `.foo` extension is inferred due to `resolve.extensions.
* The module is processed with `foo-loader` because of `module.loaders`

## api
* `Mimic.prototype.install` - configures `require` in the current node process to behave according to the webpack config specified by `options.webpackConfig` passed to the constructor. Returns the current instance.
* `Mimic.prototype.uninstall` - un-does what `Mimic.prototype.install` did. Returns the current instance.
* `Mimic.restore` - restores configuration to the way it was before Mimic was required in.

## known issues
Paths that were resolved using custom properties in `require.extensions` will continue to resolve the same even after `Mimic.restore` or `Mimic.prototype.uninstall` have been called.

```js
myMimic.uninstall();
require.resolve('theirModule'); // still resolves to myModule.foo.
```

## current limitations
* Asynchronous loaders are not supported
* Loaders must be specified in the webpack config. Loaders specified on the path will not work
* `install` and `uninstall` can only be run once per instance.