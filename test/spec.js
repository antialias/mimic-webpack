var Mimic = require('../');
var assert = require('assert');
var sinon = require('sinon');
var path = require('path');
var Module = require('module');
describe('mimic', function () {
    var sandbox;
    beforeEach(function () {
        process.chdir(__dirname);
        sandbox = sinon.sandbox.create();
    });
    afterEach(function () {
        Mimic.restore();
        sandbox.restore();
    });
    describe('uninstall warnings', function () {
        var m1;
        var m2;
        beforeEach(function () {
            m1 = new Mimic();
            m2 = new Mimic();
            m1.install();
            m2.install();
            sandbox.stub(console, 'warn');
        });
        it('should console.warn when uninstalling a Module.prototype.require that it didnt install', function () {
            m1.uninstall();
            sinon.assert.called(console.warn);
        });
        it('should not console.warn when uninstalling a Module.prototype.require in the correct (reverse) order', function () {
            m2.uninstall();
            m1.uninstall();
            sinon.assert.notCalled(console.warn);
        });
    });
    describe('webpack alias transforms', function () {
        it('should work with module names', function () {
            var m = new Mimic({webpackConfig: {resolve: {alias: {foo: 'bar'}}}}).install();
            sandbox.stub(m, '_originalRequire');
            require('foo');
            sinon.assert.calledWith(m._originalRequire, 'bar');
            require('foo/fizz');
            sinon.assert.calledWith(m._originalRequire, 'bar/fizz');
        });
        it('should work with file names when the file extension is present', function () {
            var m = new Mimic({webpackConfig: {resolve: {alias: {foo: 'bar.js'}}}}).install();
            sandbox.stub(m, '_originalRequire');
            require('foo');
            sinon.assert.calledWith(m._originalRequire, 'bar.js');
        });
    });
    it('should use resolve.extensions to resolve paths', function () {
        var m = new Mimic({
            webpackConfig: {
                resolve: {
                    extensions: ['.bar']
                }
            }
        }).install();
        assert.equal(path.extname(require.resolve('./foo')), '.bar');
        delete require.cache[require.resolve('./foo')];
        m.uninstall();
        assert.throws(function () {
            require.resolve('./fizz'); // using another file because we can no longer make previously resolved paths unresolvable
        }, Error);
    });
    describe('webpack loader transforms', function () {
        afterEach(function () {
            delete require.cache[require.resolve('./baz')];
        });
        it('should apply webpack loaders according to the matcher', function () {
            var loaderSpy = sinon.spy();
            var m = new Mimic({
                webpackConfig: {
                    resolve: {
                        extensions: ['.reverse']
                    },
                    module: {
                        loaders: [
                            {
                                test: /.reverse/,
                                loader: loaderSpy
                            }
                        ]
                    }
                }
            }).install();
            sandbox.stub(Module.prototype, '_compile');
            require('./baz');
            sinon.assert.calledWith(
                loaderSpy,
                'thisisatest'
            );
        });
        it('should run loaders through the normalizer', function () {
            var myLoader = [];
            sandbox.stub(Mimic.prototype, 'normalizeLoaders', Mimic.prototype.normalizeLoaders);
            var m = new Mimic({
                webpackConfig: {
                    resolve: {
                        extensions: ['.reverse']
                    },
                    module: {
                        loaders: [
                            {
                                test: /.reverse/,
                                loader: myLoader
                            }
                        ]
                    }
                }
            }).install();
            sandbox.stub(Module.prototype, '_compile');
            require('./baz');
            assert.equal(m.normalizeLoaders.firstCall.args[0].loader, myLoader);
        });
    });
    describe('normalizeLoaders', function () {
        var mimic;
        beforeEach(function () {
            m = new Mimic();
        });
        it('should handle single functions', function () {
            var m = new Mimic();
            var loaderSpy = {loader: sinon.spy(function () {
                return 'bar';
            })};
            var bigLoader = m.normalizeLoaders(loaderSpy);
            assert.equal(bigLoader('foo'), 'bar');
            sinon.assert.calledWith(loaderSpy.loader, 'foo');
        });
        it('should handle exclamation separated strings', function () {
            var bigLoader = m.normalizeLoaders({loader: './foojs!./barjs'});
            assert.equal(bigLoader('asdf'), 'asdfbarfoo');
        });
        it('should handle arrays of functions', function () {
            var bigLoader = m.normalizeLoaders({loader: [
                function (content) {return content + 'func1';},
                function (content) {return content + 'func2';}
            ]});
            assert.equal(bigLoader('asdf'), 'asdffunc2func1');
        });
        it('should support functions that use this.callback', function () {
            var bigLoader = m.normalizeLoaders({loader: [
                function (content) {
                    return this.callback(null, content + 'func1');
                },
                function (content) {return content + 'func2';}
            ]});
            assert.equal(bigLoader('asdf'), 'asdffunc2func1');
        });
    });
    describe('options.loaders.use', function () {
        it('should not use loaders that arent in the use list', function () {
            m = new Mimic({
                loaders: {
                    use: ['./barjs']
                },
                webpackConfig: {
                    resolve: {
                        extensions: ['.bar']
                    },
                    module: {
                        loaders: [{
                            test: /\.bar$/,
                            loader: './foojs'
                        }]
                    }
                }
            }).install();
            assert.deepEqual(require('./foo'), {});
        });
    });
});
