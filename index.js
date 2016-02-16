var result = require('lodash.result');
var assign = require('lodash.assign');
var forEach = require('lodash.foreach');
var Module = require('module');
var nullLoader = require('null-loader');
var identityLoader = require('./identity-loader');
var path = require('path');
var relative = require('require-relative');
var slice = Array.prototype.slice;
var fs = require('fs');
var jsdom = require('jsdom').jsdom;
var globalOriginalRequire = Module.prototype.require;

var globalOriginalNODE_PATH = process.env.NODE_PATH;
var globalOriginalRequireMainPaths = require.main.paths;
var globalOriginalExtensionHandlers = assign({}, require.extensions);
var globalDomWindowProperties = [
    'CustomEvent',
    'document',
    'window',
    'Element',
    'HTMLElement'
];
var Mimic = module.exports = function (options) {
    options = assign({
        loaders: {},
        domSupport: false,
        webpackConfig: undefined,
    }, options);
    this._useLoaders = options.loaders && options.loaders.use;
    this._identityLoaders = options.loaders && options.loaders.identity || [];
    this._domSupport = options.domSupport;
    this._domWindowProperties = globalDomWindowProperties;
    this._webpackConfig = options.webpackConfig;
    this._roots = options.webpackConfig.resolve.root;
    if ('string' === typeof this._roots) {
        this._roots = [this._roots];
    }
    if (options.webpackConfig) {
        this._webpackAliases = result(result(options.webpackConfig, 'resolve'), 'alias') || [];
    }
    this._extensions = result(result(this._webpackConfig, 'resolve'), 'extensions');
    this._handleJsWithLoaders = this._handleJsWithLoaders.bind(this);
    this._loaders = (result(result(this._webpackConfig, 'module'), 'loaders') || [])
        .map(function (loaderConfig) {
            return assign({}, loaderConfig, {
                bigLoader: this.normalizeLoaders(loaderConfig)
            });
        }.bind(this));
};

var canRequire = function (path) {
    try {
        relative.resolve(path);
    } catch(e) {
        return false;
    }
    return true;
};

Mimic.prototype.normalizeLoaders = function (loaderConfig) {
    var loaders = loaderConfig.loader;
    if (loaders instanceof Array) {
        loaders = loaders.map(function (loader) {
            return {module: loader};
        });
    }
    if ('function' === typeof loaders) {
        loaders = [{module: loaders}];
    }
    if ('string' === typeof loaders) {
        loaders = loaders.split('!').map(function (loader) {
            loader = loader.split('?')[0];
            if (!canRequire(loader)) {
                if (canRequire(loader + '-loader')) {
                    loader += '-loader';
                }
            }
            if (this._identityLoaders.length > 0 && -1 !== this._identityLoaders.indexOf(loader)) {
                return {module: identityLoader};
            }
            if (this._useLoaders && -1 === this._useLoaders.indexOf(loader)) {
                return {module: nullLoader};
            }
            return {module: relative(loader)};
        }.bind(this));
    }
    // loaders is an array of loader functions
    return function (moduleText) {
        return loaders.reduceRight(function (moduleText, loader, loaderIndex) {
            var callbackused = false;
            var loaderReturnValue = loader.module.call({
                cacheable: function () {},
                loaders: loaders,
                options: this._webpackConfig,
                loaderIndex: loaderIndex,
                async: function () {
                    // todo: support async loaders
                    console.warn('Mimic does not support async loaders');
                    return function () {};
                },
                callback: function (error, _moduleText) {
                    callbackused = true;
                    moduleText = _moduleText;
                }
            }, moduleText);
            if (!callbackused) {
                moduleText = loaderReturnValue;
            }
            return moduleText;
        }.bind(this), moduleText);
    }.bind(this);
};
Mimic.restore = function () {
    Module.prototype.require = globalOriginalRequire;
    forEach(require.extensions, function (handler, extension) {
        if (!globalOriginalExtensionHandlers[extension]) {
            delete require.extensions[extension];
        } else {
            require.extensions[extension] = globalOriginalExtensionHandlers[extension];
        }
    });
    if (globalOriginalRequireMainPaths) {
        require.main.paths = globalOriginalRequireMainPaths;
    }
    process.env.NODE_PATH = globalOriginalNODE_PATH;
    require('module').Module._initPaths();
};

Mimic.prototype._handleJsWithLoaders = function (module, filename) {
    var loaderConfig = this._loaders.find(function (loaderConfig) {
        return loaderConfig.test.test(filename);
    });
    if (!loaderConfig) {
        return this._originalExtensionHandlers['.js'].apply(this, arguments);
    }
    var moduleText = loaderConfig.bigLoader(fs.readFileSync(filename, 'utf8'));
    return module._compile(moduleText, filename);
};

Mimic.prototype.install = function () {
    var mimicInstance = this;
    this._originalRequire = Module.prototype.require;
    this._installedRequireProxy = Module.prototype.require = function () {
        return mimicInstance.requireWithContext.apply(mimicInstance, [this].concat(slice.call(arguments)));
    };
    this._originalExtensionHandlers = {};
    this._originalExtensionHandlers['.js'] = require.extensions['.js'];
    require.extensions['.js'] = this._handleJsWithLoaders;
    if (this._domSupport) { // TODO: uninstall this stuff on uninstall and restore
        global.document = jsdom(undefined, {});
        global.window = document.defaultView;
        this._domWindowProperties.forEach(function (globalDomPropertyName) {
            global[globalDomPropertyName] = global.window[globalDomPropertyName];
        });
    }
    if (this._extensions) {
        this._extensions.forEach(function (extension) {
            if (extension !== '.js') {
                this._originalExtensionHandlers[extension] = require.extensions[extension];
            }
            // assume loaders always transform into js
            require.extensions[extension] = require.extensions['.js'];
        }.bind(this));
    }
    if (this._roots) {
        this._originalRequireMainPaths = [].concat(require.main.paths);
        this._roots.forEach(function (root) {
            require.main.paths = require.main.paths.concat(root);
        });
        this._original_NODE_PATH = process.env.NODE_PATH;
        process.env.NODE_PATH = this._roots.join(':');
        require('module').Module._initPaths();
    }
    return this;
};
Mimic.prototype.uninstall = function () {
    if (!this._originalRequire) {
        console.warn('Mimic was never installed');
        return this;
    }
    if (Module.prototype.require !== this._installedRequireProxy) {
        console.warn('Mimic is restoring an overridden Module.prototype.require that it did not install.');
    }
    Module.prototype.require = this._originalRequire;
    forEach(this._originalExtensionHandlers, function (handler, extension) {
        if (undefined === handler) {
            delete require.extensions[extension];
        } else {
            require.extensions[extension] = handler;
        }
    });
    if (this._originalRequireMainPaths) {
        require.main.paths = this._originalRequireMainPaths;
    }
    if (this._original_NODE_PATH) {
        process.env.NODE_PATH = this._original_NODE_PATH;
    }
    require('module').Module._initPaths();
    return this;
};

Mimic.prototype.requireWithContext = function(context) {
    if (!this._originalRequire) {
        throw new Error('mimic must be installed before invoking requireWithContext');
    }
    var moduleName = arguments[1];
    var oldname = moduleName;
    var splitModuleName = moduleName.split(path.sep);
    var aliasPath;
    // apply webpack alias transforms
    if (this._webpackAliases) {
        aliasPath = this._webpackAliases[splitModuleName[0]];
    }
    if (aliasPath) {
        // assume that aliasPath is a file and use it for moduleName
        moduleName = aliasPath;
        if ('' === path.extname(aliasPath)) {
            // if aliasPath does not end with an extension, prefix moduleName with it
            moduleName = [aliasPath].concat(splitModuleName.slice(1)).join(path.sep);
        }
    }
    var args = slice.call(arguments);
    args.shift();
    args[0] = moduleName;
    return this._originalRequire.apply(context, args);
};
