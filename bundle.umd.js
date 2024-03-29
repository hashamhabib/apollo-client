(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('tslib'), require('apollo-utilities'), require('apollo-link'), require('symbol-observable'), require('ts-invariant'), require('apollo-link-dedup'), require('graphql/language/printer'), require('graphql/language/visitor')) :
    typeof define === 'function' && define.amd ? define(['exports', 'tslib', 'apollo-utilities', 'apollo-link', 'symbol-observable', 'ts-invariant', 'apollo-link-dedup', 'graphql/language/printer', 'graphql/language/visitor'], factory) :
    (global = global || self, factory(global['apollo.core'] = {}, global.tslib, global.apollo.utilities, global.apolloLink.core, global.$$observable, global.invariant, global.apolloLink.dedup, global.printer, global.visitor));
}(this, function (exports, tslib, apolloUtilities, apolloLink, $$observable, tsInvariant, apolloLinkDedup, printer, visitor) { 'use strict';

    $$observable = $$observable && $$observable.hasOwnProperty('default') ? $$observable['default'] : $$observable;

    (function (NetworkStatus) {
        NetworkStatus[NetworkStatus["loading"] = 1] = "loading";
        NetworkStatus[NetworkStatus["setVariables"] = 2] = "setVariables";
        NetworkStatus[NetworkStatus["fetchMore"] = 3] = "fetchMore";
        NetworkStatus[NetworkStatus["refetch"] = 4] = "refetch";
        NetworkStatus[NetworkStatus["poll"] = 6] = "poll";
        NetworkStatus[NetworkStatus["ready"] = 7] = "ready";
        NetworkStatus[NetworkStatus["error"] = 8] = "error";
    })(exports.NetworkStatus || (exports.NetworkStatus = {}));
    function isNetworkRequestInFlight(networkStatus) {
        return networkStatus < 7;
    }

    var Observable$1 = (function (_super) {
        tslib.__extends(Observable$$1, _super);
        function Observable$$1() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Observable$$1.prototype[$$observable] = function () {
            return this;
        };
        Observable$$1.prototype['@@observable'] = function () {
            return this;
        };
        return Observable$$1;
    }(apolloLink.Observable));

    function isApolloError(err) {
        return err.hasOwnProperty('graphQLErrors');
    }
    var generateErrorMessage = function (err) {
        var message = '';
        if (Array.isArray(err.graphQLErrors) && err.graphQLErrors.length !== 0) {
            err.graphQLErrors.forEach(function (graphQLError) {
                var errorMessage = graphQLError
                    ? graphQLError.message
                    : 'Error message not found.';
                message += "GraphQL error: " + errorMessage + "\n";
            });
        }
        if (err.networkError) {
            message += 'Network error: ' + err.networkError.message + '\n';
        }
        message = message.replace(/\n$/, '');
        return message;
    };
    var ApolloError = (function (_super) {
        tslib.__extends(ApolloError, _super);
        function ApolloError(_a) {
            var graphQLErrors = _a.graphQLErrors, networkError = _a.networkError, errorMessage = _a.errorMessage, extraInfo = _a.extraInfo;
            var _this = _super.call(this, errorMessage) || this;
            _this.graphQLErrors = graphQLErrors || [];
            _this.networkError = networkError || null;
            if (!errorMessage) {
                _this.message = generateErrorMessage(_this);
            }
            else {
                _this.message = errorMessage;
            }
            _this.extraInfo = extraInfo;
            _this.__proto__ = ApolloError.prototype;
            return _this;
        }
        return ApolloError;
    }(Error));


    (function (FetchType) {
        FetchType[FetchType["normal"] = 1] = "normal";
        FetchType[FetchType["refetch"] = 2] = "refetch";
        FetchType[FetchType["poll"] = 3] = "poll";
    })(exports.FetchType || (exports.FetchType = {}));

    var hasError = function (storeValue, policy) {
        if (policy === void 0) { policy = 'none'; }
        return storeValue &&
            ((storeValue.graphQLErrors &&
                storeValue.graphQLErrors.length > 0 &&
                policy === 'none') ||
                storeValue.networkError);
    };
    var ObservableQuery = (function (_super) {
        tslib.__extends(ObservableQuery, _super);
        function ObservableQuery(_a) {
            var queryManager = _a.queryManager, options = _a.options, _b = _a.shouldSubscribe, shouldSubscribe = _b === void 0 ? true : _b;
            var _this = _super.call(this, function (observer) {
                return _this.onSubscribe(observer);
            }) || this;
            _this.isTornDown = false;
            _this.options = options;
            _this.variables = options.variables || {};
            _this.queryId = queryManager.generateQueryId();
            _this.shouldSubscribe = shouldSubscribe;
            _this.queryManager = queryManager;
            _this.observers = [];
            _this.subscriptionHandles = [];
            return _this;
        }
        ObservableQuery.prototype.result = function () {
            var that = this;
            return new Promise(function (resolve, reject) {
                var subscription;
                var observer = {
                    next: function (result) {
                        resolve(result);
                        if (!that.observers.some(function (obs) { return obs !== observer; })) {
                            that.queryManager.removeQuery(that.queryId);
                        }
                        setTimeout(function () {
                            subscription.unsubscribe();
                        }, 0);
                    },
                    error: function (error) {
                        reject(error);
                    },
                };
                subscription = that.subscribe(observer);
            });
        };
        ObservableQuery.prototype.currentResult = function () {
            var result = this.getCurrentResult();
            if (result.data === undefined) {
                result.data = {};
            }
            return result;
        };
        ObservableQuery.prototype.getCurrentResult = function () {
            if (this.isTornDown) {
                return {
                    data: this.lastError
                        ? undefined
                        : this.lastResult
                            ? this.lastResult.data
                            : undefined,
                    error: this.lastError,
                    loading: false,
                    networkStatus: exports.NetworkStatus.error,
                };
            }
            var queryStoreValue = this.queryManager.queryStore.get(this.queryId);
            if (hasError(queryStoreValue, this.options.errorPolicy)) {
                return {
                    data: undefined,
                    loading: false,
                    networkStatus: queryStoreValue.networkStatus,
                    error: new ApolloError({
                        graphQLErrors: queryStoreValue.graphQLErrors,
                        networkError: queryStoreValue.networkError,
                    }),
                };
            }
            if (queryStoreValue && queryStoreValue.variables) {
                this.options.variables = Object.assign({}, this.options.variables, queryStoreValue.variables);
            }
            var _a = this.queryManager.getCurrentQueryResult(this), data = _a.data, partial = _a.partial;
            var queryLoading = !queryStoreValue ||
                queryStoreValue.networkStatus === exports.NetworkStatus.loading;
            var loading = (this.options.fetchPolicy === 'network-only' && queryLoading) ||
                (partial && this.options.fetchPolicy !== 'cache-only');
            var networkStatus;
            if (queryStoreValue) {
                networkStatus = queryStoreValue.networkStatus;
            }
            else {
                networkStatus = loading ? exports.NetworkStatus.loading : exports.NetworkStatus.ready;
            }
            var result = {
                data: data,
                loading: isNetworkRequestInFlight(networkStatus),
                networkStatus: networkStatus,
            };
            if (queryStoreValue &&
                queryStoreValue.graphQLErrors &&
                this.options.errorPolicy === 'all') {
                result.errors = queryStoreValue.graphQLErrors;
            }
            if (!partial) {
                this.lastResult = tslib.__assign({}, result, { stale: false });
                this.lastResultSnapshot = apolloUtilities.cloneDeep(this.lastResult);
            }
            return tslib.__assign({}, result, { partial: partial });
        };
        ObservableQuery.prototype.isDifferentFromLastResult = function (newResult) {
            var snapshot = this.lastResultSnapshot;
            return !(snapshot &&
                newResult &&
                snapshot.networkStatus === newResult.networkStatus &&
                snapshot.stale === newResult.stale &&
                apolloUtilities.isEqual(snapshot.data, newResult.data));
        };
        ObservableQuery.prototype.getLastResult = function () {
            return this.lastResult;
        };
        ObservableQuery.prototype.getLastError = function () {
            return this.lastError;
        };
        ObservableQuery.prototype.resetLastResults = function () {
            delete this.lastResult;
            delete this.lastResultSnapshot;
            delete this.lastError;
            this.isTornDown = false;
        };
        ObservableQuery.prototype.refetch = function (variables) {
            var fetchPolicy = this.options.fetchPolicy;
            if (fetchPolicy === 'cache-only') {
                return Promise.reject(new Error('cache-only fetchPolicy option should not be used together with query refetch.'));
            }
            if (!apolloUtilities.isEqual(this.variables, variables)) {
                this.variables = Object.assign({}, this.variables, variables);
            }
            if (!apolloUtilities.isEqual(this.options.variables, this.variables)) {
                this.options.variables = Object.assign({}, this.options.variables, this.variables);
            }
            var isNetworkFetchPolicy = fetchPolicy === 'network-only' || fetchPolicy === 'no-cache';
            var combinedOptions = tslib.__assign({}, this.options, { fetchPolicy: isNetworkFetchPolicy ? fetchPolicy : 'network-only' });
            return this.queryManager
                .fetchQuery(this.queryId, combinedOptions, exports.FetchType.refetch)
                .then(function (result) { return result; });
        };
        ObservableQuery.prototype.fetchMore = function (fetchMoreOptions) {
            var _this = this;
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(fetchMoreOptions.updateQuery) : tsInvariant.invariant(fetchMoreOptions.updateQuery, 'updateQuery option is required. This function defines how to update the query data with the new results.');
            var combinedOptions;
            return Promise.resolve()
                .then(function () {
                var qid = _this.queryManager.generateQueryId();
                if (fetchMoreOptions.query) {
                    combinedOptions = fetchMoreOptions;
                }
                else {
                    combinedOptions = tslib.__assign({}, _this.options, fetchMoreOptions, { variables: Object.assign({}, _this.variables, fetchMoreOptions.variables) });
                }
                combinedOptions.fetchPolicy = 'network-only';
                return _this.queryManager.fetchQuery(qid, combinedOptions, exports.FetchType.normal, _this.queryId);
            })
                .then(function (fetchMoreResult) {
                _this.updateQuery(function (previousResult) {
                    return fetchMoreOptions.updateQuery(previousResult, {
                        fetchMoreResult: fetchMoreResult.data,
                        variables: combinedOptions.variables,
                    });
                });
                return fetchMoreResult;
            });
        };
        ObservableQuery.prototype.subscribeToMore = function (options) {
            var _this = this;
            var subscription = this.queryManager
                .startGraphQLSubscription({
                query: options.document,
                variables: options.variables,
            })
                .subscribe({
                next: function (subscriptionData) {
                    if (options.updateQuery) {
                        _this.updateQuery(function (previous, _a) {
                            var variables = _a.variables;
                            return options.updateQuery(previous, {
                                subscriptionData: subscriptionData,
                                variables: variables,
                            });
                        });
                    }
                },
                error: function (err) {
                    if (options.onError) {
                        options.onError(err);
                        return;
                    }
                    console.error('Unhandled GraphQL subscription error', err);
                },
            });
            this.subscriptionHandles.push(subscription);
            return function () {
                var i = _this.subscriptionHandles.indexOf(subscription);
                if (i >= 0) {
                    _this.subscriptionHandles.splice(i, 1);
                    subscription.unsubscribe();
                }
            };
        };
        ObservableQuery.prototype.setOptions = function (opts) {
            var oldOptions = this.options;
            this.options = Object.assign({}, this.options, opts);
            if (opts.pollInterval) {
                this.startPolling(opts.pollInterval);
            }
            else if (opts.pollInterval === 0) {
                this.stopPolling();
            }
            var tryFetch = (oldOptions.fetchPolicy !== 'network-only' &&
                opts.fetchPolicy === 'network-only') ||
                (oldOptions.fetchPolicy === 'cache-only' &&
                    opts.fetchPolicy !== 'cache-only') ||
                (oldOptions.fetchPolicy === 'standby' &&
                    opts.fetchPolicy !== 'standby') ||
                false;
            return this.setVariables(this.options.variables, tryFetch, opts.fetchResults);
        };
        ObservableQuery.prototype.setVariables = function (variables, tryFetch, fetchResults) {
            if (tryFetch === void 0) { tryFetch = false; }
            if (fetchResults === void 0) { fetchResults = true; }
            this.isTornDown = false;
            var newVariables = variables ? variables : this.variables;
            if (apolloUtilities.isEqual(newVariables, this.variables) && !tryFetch) {
                if (this.observers.length === 0 || !fetchResults) {
                    return new Promise(function (resolve) { return resolve(); });
                }
                return this.result();
            }
            else {
                this.variables = newVariables;
                this.options.variables = newVariables;
                if (this.observers.length === 0) {
                    return new Promise(function (resolve) { return resolve(); });
                }
                return this.queryManager
                    .fetchQuery(this.queryId, tslib.__assign({}, this.options, { variables: this.variables }))
                    .then(function (result) { return result; });
            }
        };
        ObservableQuery.prototype.updateQuery = function (mapFn) {
            var _a = this.queryManager.getQueryWithPreviousResult(this.queryId), previousResult = _a.previousResult, variables = _a.variables, document = _a.document;
            var newResult = apolloUtilities.tryFunctionOrLogError(function () {
                return mapFn(previousResult, { variables: variables });
            });
            if (newResult) {
                this.queryManager.dataStore.markUpdateQueryResult(document, variables, newResult);
                this.queryManager.broadcastQueries();
            }
        };
        ObservableQuery.prototype.stopPolling = function () {
            this.queryManager.stopPollingQuery(this.queryId);
            this.options.pollInterval = undefined;
        };
        ObservableQuery.prototype.startPolling = function (pollInterval) {
            assertNotCacheFirstOrOnly(this);
            this.options.pollInterval = pollInterval;
            this.queryManager.startPollingQuery(this.options, this.queryId);
        };
        ObservableQuery.prototype.onSubscribe = function (observer) {
            var _this = this;
            if (observer._subscription &&
                observer._subscription._observer &&
                !observer._subscription._observer.error) {
                observer._subscription._observer.error = function (error) {
                    console.error('Unhandled error', error.message, error.stack);
                };
            }
            this.observers.push(observer);
            if (observer.next && this.lastResult)
                observer.next(this.lastResult);
            if (observer.error && this.lastError)
                observer.error(this.lastError);
            if (this.observers.length === 1)
                this.setUpQuery();
            return function () {
                _this.observers = _this.observers.filter(function (obs) { return obs !== observer; });
                if (_this.observers.length === 0) {
                    _this.tearDownQuery();
                }
            };
        };
        ObservableQuery.prototype.setUpQuery = function () {
            var _this = this;
            if (this.shouldSubscribe) {
                this.queryManager.addObservableQuery(this.queryId, this);
            }
            if (!!this.options.pollInterval) {
                assertNotCacheFirstOrOnly(this);
                this.queryManager.startPollingQuery(this.options, this.queryId);
            }
            var observer = {
                next: function (result) {
                    _this.lastResult = result;
                    _this.lastResultSnapshot = apolloUtilities.cloneDeep(result);
                    _this.observers.forEach(function (obs) { return obs.next && obs.next(result); });
                },
                error: function (error) {
                    _this.lastError = error;
                    _this.observers.forEach(function (obs) { return obs.error && obs.error(error); });
                },
            };
            this.queryManager.startQuery(this.queryId, this.options, this.queryManager.queryListenerForObserver(this.queryId, this.options, observer));
        };
        ObservableQuery.prototype.tearDownQuery = function () {
            this.isTornDown = true;
            this.queryManager.stopPollingQuery(this.queryId);
            this.subscriptionHandles.forEach(function (sub) { return sub.unsubscribe(); });
            this.subscriptionHandles = [];
            this.queryManager.removeObservableQuery(this.queryId);
            this.queryManager.stopQuery(this.queryId);
            this.observers = [];
        };
        return ObservableQuery;
    }(Observable$1));
    function assertNotCacheFirstOrOnly(obsQuery) {
        var fetchPolicy = obsQuery.options.fetchPolicy;
        process.env.NODE_ENV === "production" ? tsInvariant.invariant(fetchPolicy !== 'cache-first' && fetchPolicy !== 'cache-only') : tsInvariant.invariant(fetchPolicy !== 'cache-first' && fetchPolicy !== 'cache-only', 'Queries that specify the cache-first and cache-only fetchPolicies cannot also be polling queries.');
    }

    var MutationStore = (function () {
        function MutationStore() {
            this.store = {};
        }
        MutationStore.prototype.getStore = function () {
            return this.store;
        };
        MutationStore.prototype.get = function (mutationId) {
            return this.store[mutationId];
        };
        MutationStore.prototype.initMutation = function (mutationId, mutation, variables) {
            this.store[mutationId] = {
                mutation: mutation,
                variables: variables || {},
                loading: true,
                error: null,
            };
        };
        MutationStore.prototype.markMutationError = function (mutationId, error) {
            var mutation = this.store[mutationId];
            if (!mutation) {
                return;
            }
            mutation.loading = false;
            mutation.error = error;
        };
        MutationStore.prototype.markMutationResult = function (mutationId) {
            var mutation = this.store[mutationId];
            if (!mutation) {
                return;
            }
            mutation.loading = false;
            mutation.error = null;
        };
        MutationStore.prototype.reset = function () {
            this.store = {};
        };
        return MutationStore;
    }());

    var QueryStore = (function () {
        function QueryStore() {
            this.store = {};
        }
        QueryStore.prototype.getStore = function () {
            return this.store;
        };
        QueryStore.prototype.get = function (queryId) {
            return this.store[queryId];
        };
        QueryStore.prototype.initQuery = function (query) {
            var previousQuery = this.store[query.queryId];
            if (previousQuery &&
                previousQuery.document !== query.document &&
                !apolloUtilities.isEqual(previousQuery.document, query.document)) {
                throw process.env.NODE_ENV === "production" ? new tsInvariant.InvariantError() : new tsInvariant.InvariantError('Internal Error: may not update existing query string in store');
            }
            var isSetVariables = false;
            var previousVariables = null;
            if (query.storePreviousVariables &&
                previousQuery &&
                previousQuery.networkStatus !== exports.NetworkStatus.loading) {
                if (!apolloUtilities.isEqual(previousQuery.variables, query.variables)) {
                    isSetVariables = true;
                    previousVariables = previousQuery.variables;
                }
            }
            var networkStatus;
            if (isSetVariables) {
                networkStatus = exports.NetworkStatus.setVariables;
            }
            else if (query.isPoll) {
                networkStatus = exports.NetworkStatus.poll;
            }
            else if (query.isRefetch) {
                networkStatus = exports.NetworkStatus.refetch;
            }
            else {
                networkStatus = exports.NetworkStatus.loading;
            }
            var graphQLErrors = [];
            if (previousQuery && previousQuery.graphQLErrors) {
                graphQLErrors = previousQuery.graphQLErrors;
            }
            this.store[query.queryId] = {
                document: query.document,
                variables: query.variables,
                previousVariables: previousVariables,
                networkError: null,
                graphQLErrors: graphQLErrors,
                networkStatus: networkStatus,
                metadata: query.metadata,
            };
            if (typeof query.fetchMoreForQueryId === 'string' &&
                this.store[query.fetchMoreForQueryId]) {
                this.store[query.fetchMoreForQueryId].networkStatus =
                    exports.NetworkStatus.fetchMore;
            }
        };
        QueryStore.prototype.markQueryResult = function (queryId, result, fetchMoreForQueryId) {
            if (!this.store || !this.store[queryId])
                return;
            this.store[queryId].networkError = null;
            this.store[queryId].graphQLErrors =
                result.errors && result.errors.length ? result.errors : [];
            this.store[queryId].previousVariables = null;
            this.store[queryId].networkStatus = exports.NetworkStatus.ready;
            if (typeof fetchMoreForQueryId === 'string' &&
                this.store[fetchMoreForQueryId]) {
                this.store[fetchMoreForQueryId].networkStatus = exports.NetworkStatus.ready;
            }
        };
        QueryStore.prototype.markQueryError = function (queryId, error, fetchMoreForQueryId) {
            if (!this.store || !this.store[queryId])
                return;
            this.store[queryId].networkError = error;
            this.store[queryId].networkStatus = exports.NetworkStatus.error;
            if (typeof fetchMoreForQueryId === 'string') {
                this.markQueryResultClient(fetchMoreForQueryId, true);
            }
        };
        QueryStore.prototype.markQueryResultClient = function (queryId, complete) {
            if (!this.store || !this.store[queryId])
                return;
            this.store[queryId].networkError = null;
            this.store[queryId].previousVariables = null;
            this.store[queryId].networkStatus = complete
                ? exports.NetworkStatus.ready
                : exports.NetworkStatus.loading;
        };
        QueryStore.prototype.stopQuery = function (queryId) {
            delete this.store[queryId];
        };
        QueryStore.prototype.reset = function (observableQueryIds) {
            var _this = this;
            this.store = Object.keys(this.store)
                .filter(function (queryId) {
                return observableQueryIds.indexOf(queryId) > -1;
            })
                .reduce(function (res, key) {
                res[key] = tslib.__assign({}, _this.store[key], { networkStatus: exports.NetworkStatus.loading });
                return res;
            }, {});
        };
        return QueryStore;
    }());

    function capitalizeFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    var LocalState = (function () {
        function LocalState(_a) {
            var cache = _a.cache, client = _a.client, resolvers = _a.resolvers, typeDefs = _a.typeDefs, fragmentMatcher = _a.fragmentMatcher;
            this.resolvers = {};
            this.cache = cache;
            if (client) {
                this.client = client;
            }
            if (resolvers) {
                this.addResolvers(resolvers);
            }
            if (typeDefs) {
                this.setTypeDefs(typeDefs);
            }
            if (fragmentMatcher) {
                this.setFragmentMatcher(fragmentMatcher);
            }
        }
        LocalState.prototype.addResolvers = function (resolvers) {
            var _this = this;
            if (Array.isArray(resolvers)) {
                resolvers.forEach(function (resolverGroup) {
                    _this.resolvers = apolloUtilities.mergeDeep(_this.resolvers, resolverGroup);
                });
            }
            else {
                this.resolvers = apolloUtilities.mergeDeep(this.resolvers, resolvers);
            }
        };
        LocalState.prototype.setResolvers = function (resolvers) {
            this.resolvers = {};
            this.addResolvers(resolvers);
        };
        LocalState.prototype.getResolvers = function () {
            return this.resolvers;
        };
        LocalState.prototype.runResolvers = function (_a) {
            var document = _a.document, remoteResult = _a.remoteResult, context = _a.context, variables = _a.variables, _b = _a.onlyRunForcedResolvers, onlyRunForcedResolvers = _b === void 0 ? false : _b;
            return tslib.__awaiter(this, void 0, void 0, function () {
                var toMerge, rootValueFromCache;
                return tslib.__generator(this, function (_c) {
                    if (document) {
                        toMerge = [];
                        rootValueFromCache = this.buildRootValueFromCache(document, variables);
                        if (rootValueFromCache) {
                            toMerge.push(rootValueFromCache);
                        }
                        if (remoteResult.data) {
                            toMerge.push(remoteResult.data);
                        }
                        return [2, this.resolveDocument(document, apolloUtilities.mergeDeepArray(toMerge), context, variables, this.fragmentMatcher, onlyRunForcedResolvers).then(function (localResult) { return (tslib.__assign({}, remoteResult, { data: localResult.result })); })];
                    }
                    return [2, remoteResult];
                });
            });
        };
        LocalState.prototype.setTypeDefs = function (typeDefs) {
            this.typeDefs = typeDefs;
        };
        LocalState.prototype.getTypeDefs = function () {
            return this.typeDefs;
        };
        LocalState.prototype.setFragmentMatcher = function (fragmentMatcher) {
            this.fragmentMatcher = fragmentMatcher;
        };
        LocalState.prototype.getFragmentMatcher = function () {
            return this.fragmentMatcher;
        };
        LocalState.prototype.clientQuery = function (document) {
            return apolloUtilities.hasDirectives(['client'], document) ? document : null;
        };
        LocalState.prototype.serverQuery = function (document) {
            return apolloUtilities.removeClientSetsFromDocument(document);
        };
        LocalState.prototype.prepareContext = function (context) {
            if (context === void 0) { context = {}; }
            var cache = this.cache;
            var schemas = [];
            if (this.typeDefs) {
                var directives = 'directive @client on FIELD';
                var definition = this.normalizeTypeDefs(this.typeDefs);
                schemas.push({ definition: definition, directives: directives });
            }
            var newContext = tslib.__assign({}, context, { cache: cache, getCacheKey: function (obj) {
                    if (cache.config) {
                        return cache.config.dataIdFromObject(obj);
                    }
                    else {
                        process.env.NODE_ENV === "production" ? tsInvariant.invariant(false) : tsInvariant.invariant(false, 'To use context.getCacheKey, you need to use a cache that has ' +
                            'a configurable dataIdFromObject, like apollo-cache-inmemory.');
                    }
                }, schemas: schemas });
            return newContext;
        };
        LocalState.prototype.addExportedVariables = function (document, variables, context) {
            if (variables === void 0) { variables = {}; }
            if (context === void 0) { context = {}; }
            return tslib.__awaiter(this, void 0, void 0, function () {
                return tslib.__generator(this, function (_a) {
                    if (document) {
                        return [2, this.resolveDocument(document, this.buildRootValueFromCache(document, variables) || {}, this.prepareContext(context), variables).then(function (data) { return (tslib.__assign({}, variables, data.exportedVariables)); })];
                    }
                    return [2, tslib.__assign({}, variables)];
                });
            });
        };
        LocalState.prototype.shouldForceResolvers = function (document) {
            var forceResolvers = false;
            visitor.visit(document, {
                Directive: {
                    enter: function (node) {
                        if (node.name.value === 'client' && node.arguments) {
                            forceResolvers = node.arguments.some(function (arg) {
                                return arg.name.value === 'always' &&
                                    arg.value.kind === 'BooleanValue' &&
                                    arg.value.value === true;
                            });
                            if (forceResolvers) {
                                return visitor.BREAK;
                            }
                        }
                    },
                },
            });
            return forceResolvers;
        };
        LocalState.prototype.shouldForceResolver = function (field) {
            return this.shouldForceResolvers(field);
        };
        LocalState.prototype.buildRootValueFromCache = function (document, variables) {
            return this.cache.diff({
                query: apolloUtilities.buildQueryFromSelectionSet(document),
                variables: variables,
                optimistic: false,
            }).result;
        };
        LocalState.prototype.normalizeTypeDefs = function (typeDefs) {
            var defs = Array.isArray(typeDefs) ? typeDefs : [typeDefs];
            return defs
                .map(function (typeDef) { return (typeof typeDef === 'string' ? typeDef : printer.print(typeDef)); })
                .map(function (str) { return str.trim(); })
                .join('\n');
        };
        LocalState.prototype.resolveDocument = function (document, rootValue, context, variables, fragmentMatcher, onlyRunForcedResolvers) {
            if (context === void 0) { context = {}; }
            if (variables === void 0) { variables = {}; }
            if (fragmentMatcher === void 0) { fragmentMatcher = function () { return true; }; }
            if (onlyRunForcedResolvers === void 0) { onlyRunForcedResolvers = false; }
            return tslib.__awaiter(this, void 0, void 0, function () {
                var mainDefinition, fragments, fragmentMap, definitionOperation, defaultOperationType, _a, cache, client, execContext;
                return tslib.__generator(this, function (_b) {
                    mainDefinition = apolloUtilities.getMainDefinition(document);
                    fragments = apolloUtilities.getFragmentDefinitions(document);
                    fragmentMap = apolloUtilities.createFragmentMap(fragments);
                    definitionOperation = mainDefinition
                        .operation;
                    defaultOperationType = definitionOperation
                        ? capitalizeFirstLetter(definitionOperation)
                        : 'Query';
                    _a = this, cache = _a.cache, client = _a.client;
                    execContext = {
                        fragmentMap: fragmentMap,
                        context: tslib.__assign({}, context, { cache: cache,
                            client: client }),
                        variables: variables,
                        fragmentMatcher: fragmentMatcher,
                        defaultOperationType: defaultOperationType,
                        exportedVariables: {},
                        onlyRunForcedResolvers: onlyRunForcedResolvers,
                    };
                    return [2, this.resolveSelectionSet(mainDefinition.selectionSet, rootValue, execContext).then(function (result) { return ({
                            result: result,
                            exportedVariables: execContext.exportedVariables,
                        }); })];
                });
            });
        };
        LocalState.prototype.resolveSelectionSet = function (selectionSet, rootValue, execContext) {
            return tslib.__awaiter(this, void 0, void 0, function () {
                var fragmentMap, context, variables, resultsToMerge, execute$$1;
                var _this = this;
                return tslib.__generator(this, function (_a) {
                    fragmentMap = execContext.fragmentMap, context = execContext.context, variables = execContext.variables;
                    resultsToMerge = [rootValue];
                    execute$$1 = function (selection) { return tslib.__awaiter(_this, void 0, void 0, function () {
                        var fragment, typeCondition;
                        return tslib.__generator(this, function (_a) {
                            if (!apolloUtilities.shouldInclude(selection, variables)) {
                                return [2];
                            }
                            if (apolloUtilities.isField(selection)) {
                                return [2, this.resolveField(selection, rootValue, execContext).then(function (fieldResult) {
                                        var _a;
                                        if (typeof fieldResult !== 'undefined') {
                                            resultsToMerge.push((_a = {},
                                                _a[apolloUtilities.resultKeyNameFromField(selection)] = fieldResult,
                                                _a));
                                        }
                                    })];
                            }
                            if (apolloUtilities.isInlineFragment(selection)) {
                                fragment = selection;
                            }
                            else {
                                fragment = fragmentMap[selection.name.value];
                                process.env.NODE_ENV === "production" ? tsInvariant.invariant(fragment) : tsInvariant.invariant(fragment, "No fragment named " + selection.name.value);
                            }
                            if (fragment && fragment.typeCondition) {
                                typeCondition = fragment.typeCondition.name.value;
                                if (execContext.fragmentMatcher(rootValue, typeCondition, context)) {
                                    return [2, this.resolveSelectionSet(fragment.selectionSet, rootValue, execContext).then(function (fragmentResult) {
                                            resultsToMerge.push(fragmentResult);
                                        })];
                                }
                            }
                            return [2];
                        });
                    }); };
                    return [2, Promise.all(selectionSet.selections.map(execute$$1)).then(function () {
                            return apolloUtilities.mergeDeepArray(resultsToMerge);
                        })];
                });
            });
        };
        LocalState.prototype.resolveField = function (field, rootValue, execContext) {
            return tslib.__awaiter(this, void 0, void 0, function () {
                var variables, fieldName, aliasedFieldName, aliasUsed, defaultResult, resultPromise, resolverType, resolverMap, resolve;
                var _this = this;
                return tslib.__generator(this, function (_a) {
                    variables = execContext.variables;
                    fieldName = field.name.value;
                    aliasedFieldName = apolloUtilities.resultKeyNameFromField(field);
                    aliasUsed = fieldName !== aliasedFieldName;
                    defaultResult = rootValue[aliasedFieldName] || rootValue[fieldName];
                    resultPromise = Promise.resolve(defaultResult);
                    if (!execContext.onlyRunForcedResolvers ||
                        this.shouldForceResolver(field)) {
                        resolverType = rootValue.__typename || execContext.defaultOperationType;
                        resolverMap = this.resolvers[resolverType];
                        if (resolverMap) {
                            resolve = resolverMap[aliasUsed ? fieldName : aliasedFieldName];
                            if (resolve) {
                                resultPromise = Promise.resolve(resolve(rootValue, apolloUtilities.argumentsObjectFromField(field, variables), execContext.context, { field: field }));
                            }
                        }
                    }
                    return [2, resultPromise.then(function (result) {
                            if (result === void 0) { result = defaultResult; }
                            if (field.directives) {
                                field.directives.forEach(function (directive) {
                                    if (directive.name.value === 'export' && directive.arguments) {
                                        directive.arguments.forEach(function (arg) {
                                            if (arg.name.value === 'as' && arg.value.kind === 'StringValue') {
                                                execContext.exportedVariables[arg.value.value] = result;
                                            }
                                        });
                                    }
                                });
                            }
                            if (!field.selectionSet) {
                                return result;
                            }
                            if (result == null) {
                                return result;
                            }
                            if (Array.isArray(result)) {
                                return _this.resolveSubSelectedArray(field, result, execContext);
                            }
                            if (field.selectionSet) {
                                return _this.resolveSelectionSet(field.selectionSet, result, execContext);
                            }
                        })];
                });
            });
        };
        LocalState.prototype.resolveSubSelectedArray = function (field, result, execContext) {
            var _this = this;
            return Promise.all(result.map(function (item) {
                if (item === null) {
                    return null;
                }
                if (Array.isArray(item)) {
                    return _this.resolveSubSelectedArray(field, item, execContext);
                }
                if (field.selectionSet) {
                    return _this.resolveSelectionSet(field.selectionSet, item, execContext);
                }
            }));
        };
        return LocalState;
    }());

    var QueryManager = (function () {
        function QueryManager(_a) {
            var link = _a.link, _b = _a.queryDeduplication, queryDeduplication = _b === void 0 ? false : _b, store = _a.store, _c = _a.onBroadcast, onBroadcast = _c === void 0 ? function () { return undefined; } : _c, _d = _a.ssrMode, ssrMode = _d === void 0 ? false : _d, _e = _a.clientAwareness, clientAwareness = _e === void 0 ? {} : _e, localState = _a.localState;
            this.mutationStore = new MutationStore();
            this.queryStore = new QueryStore();
            this.clientAwareness = {};
            this.idCounter = 1;
            this.queries = new Map();
            this.fetchQueryRejectFns = new Map();
            this.queryIdsByName = {};
            this.pollingInfoByQueryId = new Map();
            this.nextPoll = null;
            this.link = link;
            this.deduplicator = apolloLink.ApolloLink.from([new apolloLinkDedup.DedupLink(), link]);
            this.queryDeduplication = queryDeduplication;
            this.dataStore = store;
            this.onBroadcast = onBroadcast;
            this.clientAwareness = clientAwareness;
            this.localState = localState || new LocalState({ cache: store.getCache() });
            this.ssrMode = ssrMode;
        }
        QueryManager.prototype.stop = function () {
            var _this = this;
            this.queries.forEach(function (_info, queryId) {
                _this.stopQueryNoBroadcast(queryId);
            });
            this.fetchQueryRejectFns.forEach(function (reject) {
                reject(new Error('QueryManager stopped while query was in flight'));
            });
        };
        QueryManager.prototype.mutate = function (_a) {
            var mutation = _a.mutation, variables = _a.variables, optimisticResponse = _a.optimisticResponse, updateQueriesByName = _a.updateQueries, _b = _a.refetchQueries, refetchQueries = _b === void 0 ? [] : _b, _c = _a.awaitRefetchQueries, awaitRefetchQueries = _c === void 0 ? false : _c, updateWithProxyFn = _a.update, _d = _a.errorPolicy, errorPolicy = _d === void 0 ? 'none' : _d, fetchPolicy = _a.fetchPolicy, _e = _a.context, context = _e === void 0 ? {} : _e;
            return tslib.__awaiter(this, void 0, void 0, function () {
                var mutationId, cache, generateUpdateQueriesInfo, updatedVariables, _f;
                var _this = this;
                return tslib.__generator(this, function (_g) {
                    switch (_g.label) {
                        case 0:
                            process.env.NODE_ENV === "production" ? tsInvariant.invariant(mutation) : tsInvariant.invariant(mutation, 'mutation option is required. You must specify your GraphQL document in the mutation option.');
                            process.env.NODE_ENV === "production" ? tsInvariant.invariant(!fetchPolicy || fetchPolicy === 'no-cache') : tsInvariant.invariant(!fetchPolicy || fetchPolicy === 'no-cache', "fetchPolicy for mutations currently only supports the 'no-cache' policy");
                            mutationId = this.generateQueryId();
                            cache = this.dataStore.getCache();
                            (mutation = cache.transformDocument(mutation)),
                                (variables = apolloUtilities.assign({}, apolloUtilities.getDefaultValues(apolloUtilities.getMutationDefinition(mutation)), variables));
                            this.setQuery(mutationId, function () { return ({ document: mutation }); });
                            generateUpdateQueriesInfo = function () {
                                var ret = {};
                                if (updateQueriesByName) {
                                    Object.keys(updateQueriesByName).forEach(function (queryName) {
                                        return (_this.queryIdsByName[queryName] || []).forEach(function (queryId) {
                                            ret[queryId] = {
                                                updater: updateQueriesByName[queryName],
                                                query: _this.queryStore.get(queryId),
                                            };
                                        });
                                    });
                                }
                                return ret;
                            };
                            if (!apolloUtilities.hasClientExports(mutation)) return [3, 2];
                            return [4, this.localState.addExportedVariables(mutation, variables, context)];
                        case 1:
                            _f = _g.sent();
                            return [3, 3];
                        case 2:
                            _f = variables;
                            _g.label = 3;
                        case 3:
                            updatedVariables = _f;
                            this.mutationStore.initMutation(mutationId, mutation, updatedVariables);
                            this.dataStore.markMutationInit({
                                mutationId: mutationId,
                                document: mutation,
                                variables: updatedVariables || {},
                                updateQueries: generateUpdateQueriesInfo(),
                                update: updateWithProxyFn,
                                optimisticResponse: optimisticResponse,
                            });
                            this.broadcastQueries();
                            return [2, new Promise(function (resolve, reject) {
                                    var storeResult;
                                    var error;
                                    var operation = _this.buildOperationForLink(mutation, updatedVariables, tslib.__assign({}, context, { optimisticResponse: optimisticResponse }));
                                    var completeMutation = function () {
                                        if (error) {
                                            _this.mutationStore.markMutationError(mutationId, error);
                                        }
                                        _this.dataStore.markMutationComplete({
                                            mutationId: mutationId,
                                            optimisticResponse: optimisticResponse,
                                        });
                                        _this.broadcastQueries();
                                        if (error) {
                                            return Promise.reject(error);
                                        }
                                        if (typeof refetchQueries === 'function') {
                                            refetchQueries = refetchQueries(storeResult);
                                        }
                                        var refetchQueryPromises = [];
                                        for (var _i = 0, refetchQueries_1 = refetchQueries; _i < refetchQueries_1.length; _i++) {
                                            var refetchQuery = refetchQueries_1[_i];
                                            if (typeof refetchQuery === 'string') {
                                                var promise = _this.refetchQueryByName(refetchQuery);
                                                if (promise) {
                                                    refetchQueryPromises.push(promise);
                                                }
                                                continue;
                                            }
                                            var queryOptions = {
                                                query: refetchQuery.query,
                                                variables: refetchQuery.variables,
                                                fetchPolicy: 'network-only',
                                            };
                                            if (refetchQuery.context) {
                                                queryOptions.context = refetchQuery.context;
                                            }
                                            refetchQueryPromises.push(_this.query(queryOptions));
                                        }
                                        return Promise.all(awaitRefetchQueries ? refetchQueryPromises : []).then(function () {
                                            _this.setQuery(mutationId, function () { return ({ document: null }); });
                                            if (errorPolicy === 'ignore' &&
                                                storeResult &&
                                                apolloUtilities.graphQLResultHasError(storeResult)) {
                                                delete storeResult.errors;
                                            }
                                            return storeResult;
                                        });
                                    };
                                    var clientQuery = _this.localState.clientQuery(operation.query);
                                    var serverQuery = _this.localState.serverQuery(operation.query);
                                    if (serverQuery) {
                                        operation.query = serverQuery;
                                    }
                                    var obs = serverQuery
                                        ? apolloLink.execute(_this.link, operation)
                                        : Observable$1.of({
                                            data: {},
                                        });
                                    var self = _this;
                                    var complete = false;
                                    var handlingNext = false;
                                    obs.subscribe({
                                        next: function (result) { return tslib.__awaiter(_this, void 0, void 0, function () {
                                            var updatedResult, context, variables;
                                            return tslib.__generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0:
                                                        handlingNext = true;
                                                        if (apolloUtilities.graphQLResultHasError(result) && errorPolicy === 'none') {
                                                            handlingNext = false;
                                                            error = new ApolloError({
                                                                graphQLErrors: result.errors,
                                                            });
                                                            return [2];
                                                        }
                                                        self.mutationStore.markMutationResult(mutationId);
                                                        updatedResult = result;
                                                        context = operation.context, variables = operation.variables;
                                                        if (!(clientQuery && apolloUtilities.hasDirectives(['client'], clientQuery))) return [3, 2];
                                                        return [4, self.localState
                                                                .runResolvers({
                                                                document: clientQuery,
                                                                remoteResult: result,
                                                                context: context,
                                                                variables: variables,
                                                            })
                                                                .catch(function (error) {
                                                                handlingNext = false;
                                                                reject(error);
                                                                return result;
                                                            })];
                                                    case 1:
                                                        updatedResult = _a.sent();
                                                        _a.label = 2;
                                                    case 2:
                                                        if (fetchPolicy !== 'no-cache') {
                                                            self.dataStore.markMutationResult({
                                                                mutationId: mutationId,
                                                                result: updatedResult,
                                                                document: mutation,
                                                                variables: updatedVariables || {},
                                                                updateQueries: generateUpdateQueriesInfo(),
                                                                update: updateWithProxyFn,
                                                            });
                                                        }
                                                        storeResult = updatedResult;
                                                        handlingNext = false;
                                                        if (complete) {
                                                            completeMutation().then(resolve, reject);
                                                        }
                                                        return [2];
                                                }
                                            });
                                        }); },
                                        error: function (err) {
                                            self.mutationStore.markMutationError(mutationId, err);
                                            self.dataStore.markMutationComplete({
                                                mutationId: mutationId,
                                                optimisticResponse: optimisticResponse,
                                            });
                                            self.broadcastQueries();
                                            self.setQuery(mutationId, function () { return ({ document: null }); });
                                            reject(new ApolloError({
                                                networkError: err,
                                            }));
                                        },
                                        complete: function () {
                                            if (!handlingNext) {
                                                completeMutation().then(resolve, reject);
                                            }
                                            complete = true;
                                        },
                                    });
                                })];
                    }
                });
            });
        };
        QueryManager.prototype.fetchQuery = function (queryId, options, fetchType, fetchMoreForQueryId) {
            return tslib.__awaiter(this, void 0, void 0, function () {
                var _a, variables, _b, metadata, _c, fetchPolicy, _d, context, cache, query, updatedVariables, _e, updatedOptions, storeResult, needToFetch, _f, complete, result, shouldFetch, requestId, cancel, shouldDispatchClientResult, networkResult;
                var _this = this;
                return tslib.__generator(this, function (_g) {
                    switch (_g.label) {
                        case 0:
                            _a = options.variables, variables = _a === void 0 ? {} : _a, _b = options.metadata, metadata = _b === void 0 ? null : _b, _c = options.fetchPolicy, fetchPolicy = _c === void 0 ? 'cache-first' : _c, _d = options.context, context = _d === void 0 ? {} : _d;
                            cache = this.dataStore.getCache();
                            query = cache.transformDocument(options.query);
                            if (!apolloUtilities.hasClientExports(query)) return [3, 2];
                            return [4, this.localState.addExportedVariables(query, variables, context)];
                        case 1:
                            _e = _g.sent();
                            return [3, 3];
                        case 2:
                            _e = variables;
                            _g.label = 3;
                        case 3:
                            updatedVariables = _e;
                            updatedOptions = tslib.__assign({}, options, { variables: updatedVariables });
                            needToFetch = fetchPolicy === 'network-only' || fetchPolicy === 'no-cache';
                            if (fetchType !== exports.FetchType.refetch &&
                                fetchPolicy !== 'network-only' &&
                                fetchPolicy !== 'no-cache') {
                                _f = this.dataStore.getCache().diff({
                                    query: query,
                                    variables: updatedVariables,
                                    returnPartialData: true,
                                    optimistic: false,
                                }), complete = _f.complete, result = _f.result;
                                needToFetch = !complete || fetchPolicy === 'cache-and-network';
                                storeResult = result;
                            }
                            shouldFetch = needToFetch && fetchPolicy !== 'cache-only' && fetchPolicy !== 'standby';
                            if (apolloUtilities.hasDirectives(['live'], query))
                                shouldFetch = true;
                            requestId = this.generateRequestId();
                            cancel = this.updateQueryWatch(queryId, query, updatedOptions);
                            this.setQuery(queryId, function () { return ({
                                document: query,
                                lastRequestId: requestId,
                                invalidated: true,
                                cancel: cancel,
                            }); });
                            this.invalidate(true, fetchMoreForQueryId);
                            this.queryStore.initQuery({
                                queryId: queryId,
                                document: query,
                                storePreviousVariables: shouldFetch,
                                variables: updatedVariables,
                                isPoll: fetchType === exports.FetchType.poll,
                                isRefetch: fetchType === exports.FetchType.refetch,
                                metadata: metadata,
                                fetchMoreForQueryId: fetchMoreForQueryId,
                            });
                            this.broadcastQueries();
                            shouldDispatchClientResult = !shouldFetch || fetchPolicy === 'cache-and-network';
                            if (shouldDispatchClientResult) {
                                this.queryStore.markQueryResultClient(queryId, !shouldFetch);
                                this.invalidate(true, queryId, fetchMoreForQueryId);
                                this.broadcastQueries(this.localState.shouldForceResolvers(query));
                            }
                            if (shouldFetch) {
                                networkResult = this.fetchRequest({
                                    requestId: requestId,
                                    queryId: queryId,
                                    document: query,
                                    options: updatedOptions,
                                    fetchMoreForQueryId: fetchMoreForQueryId,
                                }).catch(function (error) {
                                    if (isApolloError(error)) {
                                        throw error;
                                    }
                                    else {
                                        var lastRequestId = _this.getQuery(queryId).lastRequestId;
                                        if (requestId >= (lastRequestId || 1)) {
                                            _this.queryStore.markQueryError(queryId, error, fetchMoreForQueryId);
                                            _this.invalidate(true, queryId, fetchMoreForQueryId);
                                            _this.broadcastQueries();
                                        }
                                        throw new ApolloError({ networkError: error });
                                    }
                                });
                                if (fetchPolicy !== 'cache-and-network') {
                                    return [2, networkResult];
                                }
                                else {
                                    networkResult.catch(function () { });
                                }
                            }
                            return [2, Promise.resolve({ data: storeResult })];
                    }
                });
            });
        };
        QueryManager.prototype.queryListenerForObserver = function (queryId, options, observer) {
            var _this = this;
            var previouslyHadError = false;
            return function (queryStoreValue, newData, forceResolvers) { return tslib.__awaiter(_this, void 0, void 0, function () {
                var observableQuery, fetchPolicy, errorPolicy, lastResult, lastError, shouldNotifyIfLoading, networkStatusChanged, errorStatusChanged, apolloError_1, data, isMissing, document_1, readResult, resultFromStore, query, variables, context, updatedResult, e_1, error_1;
                return tslib.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.invalidate(false, queryId);
                            if (!queryStoreValue)
                                return [2];
                            observableQuery = this.getQuery(queryId).observableQuery;
                            fetchPolicy = observableQuery
                                ? observableQuery.options.fetchPolicy
                                : options.fetchPolicy;
                            if (fetchPolicy === 'standby')
                                return [2];
                            errorPolicy = observableQuery
                                ? observableQuery.options.errorPolicy
                                : options.errorPolicy;
                            lastResult = observableQuery
                                ? observableQuery.getLastResult()
                                : null;
                            lastError = observableQuery ? observableQuery.getLastError() : null;
                            shouldNotifyIfLoading = (!newData && queryStoreValue.previousVariables != null) ||
                                fetchPolicy === 'cache-only' ||
                                fetchPolicy === 'cache-and-network';
                            networkStatusChanged = Boolean(lastResult &&
                                queryStoreValue.networkStatus !== lastResult.networkStatus);
                            errorStatusChanged = errorPolicy &&
                                (lastError && lastError.graphQLErrors) !==
                                    queryStoreValue.graphQLErrors &&
                                errorPolicy !== 'none';
                            if (!(!isNetworkRequestInFlight(queryStoreValue.networkStatus) ||
                                (networkStatusChanged && options.notifyOnNetworkStatusChange) ||
                                shouldNotifyIfLoading)) return [3, 8];
                            if (((!errorPolicy || errorPolicy === 'none') &&
                                queryStoreValue.graphQLErrors &&
                                queryStoreValue.graphQLErrors.length > 0) ||
                                queryStoreValue.networkError) {
                                apolloError_1 = new ApolloError({
                                    graphQLErrors: queryStoreValue.graphQLErrors,
                                    networkError: queryStoreValue.networkError,
                                });
                                previouslyHadError = true;
                                if (observer.error) {
                                    try {
                                        observer.error(apolloError_1);
                                    }
                                    catch (e) {
                                        setTimeout(function () {
                                            throw e;
                                        }, 0);
                                    }
                                }
                                else {
                                    setTimeout(function () {
                                        throw apolloError_1;
                                    }, 0);
                                    if (process.env.NODE_ENV !== 'production') {
                                        console.info('An unhandled error was thrown because no error handler is registered ' +
                                            'for the query ' +
                                            JSON.stringify(queryStoreValue.document));
                                    }
                                }
                                return [2];
                            }
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 7, , 8]);
                            data = void 0;
                            isMissing = void 0;
                            if (newData) {
                                if (fetchPolicy !== 'no-cache') {
                                    this.setQuery(queryId, function () { return ({ newData: null }); });
                                }
                                data = newData.result;
                                isMissing = !newData.complete || false;
                            }
                            else {
                                if (lastResult && lastResult.data && !errorStatusChanged) {
                                    data = lastResult.data;
                                    isMissing = false;
                                }
                                else {
                                    document_1 = this.getQuery(queryId).document;
                                    readResult = this.dataStore.getCache().diff({
                                        query: document_1,
                                        variables: queryStoreValue.previousVariables ||
                                            queryStoreValue.variables,
                                        optimistic: true,
                                    });
                                    data = readResult.result;
                                    isMissing = !readResult.complete;
                                }
                            }
                            resultFromStore = void 0;
                            if (isMissing && fetchPolicy !== 'cache-only') {
                                resultFromStore = {
                                    data: lastResult && lastResult.data,
                                    loading: isNetworkRequestInFlight(queryStoreValue.networkStatus),
                                    networkStatus: queryStoreValue.networkStatus,
                                    stale: true,
                                };
                            }
                            else {
                                resultFromStore = {
                                    data: data,
                                    loading: isNetworkRequestInFlight(queryStoreValue.networkStatus),
                                    networkStatus: queryStoreValue.networkStatus,
                                    stale: false,
                                };
                            }
                            if (errorPolicy === 'all' &&
                                queryStoreValue.graphQLErrors &&
                                queryStoreValue.graphQLErrors.length > 0) {
                                resultFromStore.errors = queryStoreValue.graphQLErrors;
                            }
                            if (!observer.next) return [3, 6];
                            if (!(previouslyHadError ||
                                !observableQuery ||
                                observableQuery.isDifferentFromLastResult(resultFromStore))) return [3, 6];
                            _a.label = 2;
                        case 2:
                            _a.trys.push([2, 5, , 6]);
                            if (!forceResolvers) return [3, 4];
                            query = options.query, variables = options.variables, context = options.context;
                            return [4, this.localState.runResolvers({
                                    document: query,
                                    remoteResult: resultFromStore,
                                    context: context,
                                    variables: variables,
                                    onlyRunForcedResolvers: forceResolvers,
                                })];
                        case 3:
                            updatedResult = _a.sent();
                            resultFromStore = tslib.__assign({}, resultFromStore, updatedResult);
                            _a.label = 4;
                        case 4:
                            observer.next(resultFromStore);
                            return [3, 6];
                        case 5:
                            e_1 = _a.sent();
                            setTimeout(function () {
                                throw e_1;
                            }, 0);
                            return [3, 6];
                        case 6:
                            previouslyHadError = false;
                            return [3, 8];
                        case 7:
                            error_1 = _a.sent();
                            previouslyHadError = true;
                            if (observer.error)
                                observer.error(new ApolloError({ networkError: error_1 }));
                            return [2];
                        case 8: return [2];
                    }
                });
            }); };
        };
        QueryManager.prototype.watchQuery = function (options, shouldSubscribe) {
            if (shouldSubscribe === void 0) { shouldSubscribe = true; }
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(options.fetchPolicy !== 'standby') : tsInvariant.invariant(options.fetchPolicy !== 'standby', 'client.watchQuery cannot be called with fetchPolicy set to "standby"');
            var queryDefinition = apolloUtilities.getQueryDefinition(options.query);
            if (queryDefinition.variableDefinitions &&
                queryDefinition.variableDefinitions.length) {
                var defaultValues = apolloUtilities.getDefaultValues(queryDefinition);
                options.variables = apolloUtilities.assign({}, defaultValues, options.variables);
            }
            if (typeof options.notifyOnNetworkStatusChange === 'undefined') {
                options.notifyOnNetworkStatusChange = false;
            }
            var transformedOptions = tslib.__assign({}, options);
            return new ObservableQuery({
                queryManager: this,
                options: transformedOptions,
                shouldSubscribe: shouldSubscribe,
            });
        };
        QueryManager.prototype.query = function (options) {
            var _this = this;
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(options.query) : tsInvariant.invariant(options.query, 'query option is required. You must specify your GraphQL document ' +
                'in the query option.');
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(options.query.kind === 'Document') : tsInvariant.invariant(options.query.kind === 'Document', 'You must wrap the query string in a "gql" tag.');
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(!options.returnPartialData) : tsInvariant.invariant(!options.returnPartialData, 'returnPartialData option only supported on watchQuery.');
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(!options.pollInterval) : tsInvariant.invariant(!options.pollInterval, 'pollInterval option only supported on watchQuery.');
            return new Promise(function (resolve, reject) {
                var watchedQuery = _this.watchQuery(options, false);
                _this.fetchQueryRejectFns.set("query:" + watchedQuery.queryId, reject);
                watchedQuery
                    .result()
                    .then(resolve, reject)
                    .then(function () {
                    return _this.fetchQueryRejectFns.delete("query:" + watchedQuery.queryId);
                });
            });
        };
        QueryManager.prototype.generateQueryId = function () {
            var queryId = this.idCounter.toString();
            this.idCounter++;
            return queryId;
        };
        QueryManager.prototype.stopQueryInStore = function (queryId) {
            this.stopQueryInStoreNoBroadcast(queryId);
            this.broadcastQueries();
        };
        QueryManager.prototype.stopQueryInStoreNoBroadcast = function (queryId) {
            this.stopPollingQuery(queryId);
            this.queryStore.stopQuery(queryId);
            this.invalidate(true, queryId);
        };
        QueryManager.prototype.addQueryListener = function (queryId, listener) {
            this.setQuery(queryId, function (_a) {
                var _b = _a.listeners, listeners = _b === void 0 ? [] : _b;
                return ({
                    listeners: listeners.concat([listener]),
                    invalidated: false,
                });
            });
        };
        QueryManager.prototype.updateQueryWatch = function (queryId, document, options) {
            var _this = this;
            var cancel = this.getQuery(queryId).cancel;
            if (cancel)
                cancel();
            var previousResult = function () {
                var previousResult = null;
                var observableQuery = _this.getQuery(queryId).observableQuery;
                if (observableQuery) {
                    var lastResult = observableQuery.getLastResult();
                    if (lastResult) {
                        previousResult = lastResult.data;
                    }
                }
                return previousResult;
            };
            return this.dataStore.getCache().watch({
                query: document,
                variables: options.variables,
                optimistic: true,
                previousResult: previousResult,
                callback: function (newData) {
                    _this.setQuery(queryId, function () { return ({ invalidated: true, newData: newData }); });
                },
            });
        };
        QueryManager.prototype.addObservableQuery = function (queryId, observableQuery) {
            this.setQuery(queryId, function () { return ({ observableQuery: observableQuery }); });
            var queryDef = apolloUtilities.getQueryDefinition(observableQuery.options.query);
            if (queryDef.name && queryDef.name.value) {
                var queryName = queryDef.name.value;
                this.queryIdsByName[queryName] = this.queryIdsByName[queryName] || [];
                this.queryIdsByName[queryName].push(observableQuery.queryId);
            }
        };
        QueryManager.prototype.removeObservableQuery = function (queryId) {
            var _a = this.getQuery(queryId), observableQuery = _a.observableQuery, cancel = _a.cancel;
            if (cancel)
                cancel();
            if (!observableQuery)
                return;
            var definition = apolloUtilities.getQueryDefinition(observableQuery.options.query);
            var queryName = definition.name ? definition.name.value : null;
            this.setQuery(queryId, function () { return ({ observableQuery: null }); });
            if (queryName) {
                this.queryIdsByName[queryName] = this.queryIdsByName[queryName].filter(function (val) {
                    return !(observableQuery.queryId === val);
                });
            }
        };
        QueryManager.prototype.clearStore = function () {
            this.fetchQueryRejectFns.forEach(function (reject) {
                reject(new Error('Store reset while query was in flight(not completed in link chain)'));
            });
            var resetIds = [];
            this.queries.forEach(function (_a, queryId) {
                var observableQuery = _a.observableQuery;
                if (observableQuery)
                    resetIds.push(queryId);
            });
            this.queryStore.reset(resetIds);
            this.mutationStore.reset();
            var reset = this.dataStore.reset();
            return reset;
        };
        QueryManager.prototype.resetStore = function () {
            var _this = this;
            return this.clearStore().then(function () {
                return _this.reFetchObservableQueries();
            });
        };
        QueryManager.prototype.reFetchObservableQueries = function (includeStandby) {
            var observableQueryPromises = this.getObservableQueryPromises(includeStandby);
            this.broadcastQueries();
            return Promise.all(observableQueryPromises);
        };
        QueryManager.prototype.startQuery = function (queryId, options, listener) {
            this.addQueryListener(queryId, listener);
            this.fetchQuery(queryId, options)
                .catch(function () { return undefined; });
            return queryId;
        };
        QueryManager.prototype.startGraphQLSubscription = function (options) {
            var _this = this;
            var query = options.query;
            var isCacheEnabled = !(options.fetchPolicy && options.fetchPolicy === 'no-cache');
            var cache = this.dataStore.getCache();
            var transformedDoc = cache.transformDocument(query);
            var variables = apolloUtilities.assign({}, apolloUtilities.getDefaultValues(apolloUtilities.getOperationDefinition(query)), options.variables);
            var updatedVariables = variables;
            var sub;
            var observers = [];
            var clientQuery = this.localState.clientQuery(transformedDoc);
            return new Observable$1(function (observer) {
                observers.push(observer);
                if (observers.length === 1) {
                    var activeNextCalls_1 = 0;
                    var complete_1 = false;
                    var handler_1 = {
                        next: function (result) { return tslib.__awaiter(_this, void 0, void 0, function () {
                            var updatedResult;
                            return tslib.__generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        activeNextCalls_1 += 1;
                                        updatedResult = result;
                                        if (!(clientQuery && apolloUtilities.hasDirectives(['client'], clientQuery))) return [3, 2];
                                        return [4, this.localState.runResolvers({
                                                document: clientQuery,
                                                remoteResult: result,
                                                context: {},
                                                variables: updatedVariables,
                                            })];
                                    case 1:
                                        updatedResult = _a.sent();
                                        _a.label = 2;
                                    case 2:
                                        if (isCacheEnabled) {
                                            this.dataStore.markSubscriptionResult(updatedResult, transformedDoc, updatedVariables);
                                            this.broadcastQueries();
                                        }
                                        observers.forEach(function (obs) {
                                            if (apolloUtilities.graphQLResultHasError(updatedResult) && obs.error) {
                                                obs.error(new ApolloError({
                                                    graphQLErrors: updatedResult.errors,
                                                }));
                                            }
                                            else if (obs.next) {
                                                obs.next(updatedResult);
                                            }
                                            activeNextCalls_1 -= 1;
                                        });
                                        if (activeNextCalls_1 === 0 && complete_1) {
                                            handler_1.complete();
                                        }
                                        return [2];
                                }
                            });
                        }); },
                        error: function (error) {
                            observers.forEach(function (obs) {
                                if (obs.error) {
                                    obs.error(error);
                                }
                            });
                        },
                        complete: function () {
                            if (activeNextCalls_1 === 0) {
                                observers.forEach(function (obs) {
                                    if (obs.complete) {
                                        obs.complete();
                                    }
                                });
                            }
                            complete_1 = true;
                        }
                    };
                    (function () { return tslib.__awaiter(_this, void 0, void 0, function () {
                        var updatedVariables, _a, serverQuery, operation;
                        return tslib.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (!apolloUtilities.hasClientExports(transformedDoc)) return [3, 2];
                                    return [4, this.localState.addExportedVariables(transformedDoc, variables)];
                                case 1:
                                    _a = _b.sent();
                                    return [3, 3];
                                case 2:
                                    _a = variables;
                                    _b.label = 3;
                                case 3:
                                    updatedVariables = _a;
                                    serverQuery = this.localState.serverQuery(transformedDoc);
                                    if (serverQuery) {
                                        operation = this.buildOperationForLink(serverQuery, updatedVariables);
                                        sub = apolloLink.execute(this.link, operation).subscribe(handler_1);
                                    }
                                    else {
                                        sub = Observable$1.of({ data: {} }).subscribe(handler_1);
                                    }
                                    return [2];
                            }
                        });
                    }); })();
                }
                return function () {
                    observers = observers.filter(function (obs) { return obs !== observer; });
                    if (observers.length === 0 && sub) {
                        sub.unsubscribe();
                    }
                };
            });
        };
        QueryManager.prototype.stopQuery = function (queryId) {
            this.stopQueryNoBroadcast(queryId);
            this.broadcastQueries();
        };
        QueryManager.prototype.stopQueryNoBroadcast = function (queryId) {
            this.stopQueryInStoreNoBroadcast(queryId);
            this.removeQuery(queryId);
        };
        QueryManager.prototype.removeQuery = function (queryId) {
            var subscriptions = this.getQuery(queryId).subscriptions;
            this.fetchQueryRejectFns.delete("query:" + queryId);
            this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
            subscriptions.forEach(function (x) { return x.unsubscribe(); });
            this.queries.delete(queryId);
        };
        QueryManager.prototype.getCurrentQueryResult = function (observableQuery, optimistic) {
            if (optimistic === void 0) { optimistic = true; }
            var _a = observableQuery.options, variables = _a.variables, query = _a.query;
            var lastResult = observableQuery.getLastResult();
            var newData = this.getQuery(observableQuery.queryId).newData;
            if (newData && newData.complete) {
                return { data: newData.result, partial: false };
            }
            else {
                try {
                    var data = this.dataStore.getCache().read({
                        query: query,
                        variables: variables,
                        previousResult: lastResult ? lastResult.data : undefined,
                        optimistic: optimistic,
                    }) || undefined;
                    return { data: data, partial: false };
                }
                catch (e) {
                    return { data: undefined, partial: true };
                }
            }
        };
        QueryManager.prototype.getQueryWithPreviousResult = function (queryIdOrObservable) {
            var observableQuery;
            if (typeof queryIdOrObservable === 'string') {
                var foundObserveableQuery = this.getQuery(queryIdOrObservable).observableQuery;
                process.env.NODE_ENV === "production" ? tsInvariant.invariant(foundObserveableQuery) : tsInvariant.invariant(foundObserveableQuery, "ObservableQuery with this id doesn't exist: " + queryIdOrObservable);
                observableQuery = foundObserveableQuery;
            }
            else {
                observableQuery = queryIdOrObservable;
            }
            var _a = observableQuery.options, variables = _a.variables, query = _a.query;
            var data = this.getCurrentQueryResult(observableQuery, false).data;
            return {
                previousResult: data,
                variables: variables,
                document: query,
            };
        };
        QueryManager.prototype.broadcastQueries = function (forceResolvers) {
            var _this = this;
            if (forceResolvers === void 0) { forceResolvers = false; }
            this.onBroadcast();
            this.queries.forEach(function (info, id) {
                if (!info.invalidated || !info.listeners)
                    return;
                info.listeners
                    .filter(function (x) { return !!x; })
                    .forEach(function (listener) {
                    listener(_this.queryStore.get(id), info.newData, forceResolvers);
                });
            });
        };
        QueryManager.prototype.getLocalState = function () {
            return this.localState;
        };
        QueryManager.prototype.getObservableQueryPromises = function (includeStandby) {
            var _this = this;
            var observableQueryPromises = [];
            this.queries.forEach(function (_a, queryId) {
                var observableQuery = _a.observableQuery;
                if (!observableQuery)
                    return;
                var fetchPolicy = observableQuery.options.fetchPolicy;
                observableQuery.resetLastResults();
                if (fetchPolicy !== 'cache-only' &&
                    (includeStandby || fetchPolicy !== 'standby')) {
                    observableQueryPromises.push(observableQuery.refetch());
                }
                _this.setQuery(queryId, function () { return ({ newData: null }); });
                _this.invalidate(true, queryId);
            });
            return observableQueryPromises;
        };
        QueryManager.prototype.fetchRequest = function (_a) {
            var _this = this;
            var requestId = _a.requestId, queryId = _a.queryId, document = _a.document, options = _a.options, fetchMoreForQueryId = _a.fetchMoreForQueryId;
            var variables = options.variables, context = options.context, _b = options.errorPolicy, errorPolicy = _b === void 0 ? 'none' : _b, fetchPolicy = options.fetchPolicy;
            var resultFromStore;
            var errorsFromStore;
            return new Promise(function (resolve, reject) {
                var obs;
                var updatedContext = {};
                var clientQuery = _this.localState.clientQuery(document);
                var serverQuery = _this.localState.serverQuery(document);
                if (serverQuery) {
                    var operation = _this.buildOperationForLink(serverQuery, variables, tslib.__assign({}, context, { forceFetch: !_this.queryDeduplication }));
                    updatedContext = operation.context;
                    obs = apolloLink.execute(_this.deduplicator, operation);
                }
                else {
                    updatedContext = _this.prepareContext(context);
                    obs = Observable$1.of({ data: {} });
                }
                _this.fetchQueryRejectFns.set("fetchRequest:" + queryId, reject);
                var complete = false;
                var handlingNext = true;
                var subscriber = {
                    next: function (result) { return tslib.__awaiter(_this, void 0, void 0, function () {
                        var updatedResult, lastRequestId;
                        return tslib.__generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    handlingNext = true;
                                    updatedResult = result;
                                    lastRequestId = this.getQuery(queryId).lastRequestId;
                                    if (!(requestId >= (lastRequestId || 1))) return [3, 3];
                                    if (!(clientQuery && apolloUtilities.hasDirectives(['client'], clientQuery))) return [3, 2];
                                    return [4, this.localState
                                            .runResolvers({
                                            document: clientQuery,
                                            remoteResult: result,
                                            context: updatedContext,
                                            variables: variables,
                                        })
                                            .catch(function (error) {
                                            handlingNext = false;
                                            reject(error);
                                            return result;
                                        })];
                                case 1:
                                    updatedResult = _a.sent();
                                    _a.label = 2;
                                case 2:
                                    if (fetchPolicy !== 'no-cache') {
                                        try {
                                            this.dataStore.markQueryResult(updatedResult, document, variables, fetchMoreForQueryId, errorPolicy === 'ignore' || errorPolicy === 'all');
                                        }
                                        catch (e) {
                                            handlingNext = false;
                                            reject(e);
                                            return [2];
                                        }
                                    }
                                    else {
                                        this.setQuery(queryId, function () { return ({
                                            newData: { result: updatedResult.data, complete: true },
                                        }); });
                                    }
                                    this.queryStore.markQueryResult(queryId, updatedResult, fetchMoreForQueryId);
                                    this.invalidate(true, queryId, fetchMoreForQueryId);
                                    this.broadcastQueries();
                                    _a.label = 3;
                                case 3:
                                    if (updatedResult.errors && errorPolicy === 'none') {
                                        handlingNext = false;
                                        reject(new ApolloError({
                                            graphQLErrors: updatedResult.errors,
                                        }));
                                        return [2];
                                    }
                                    else if (errorPolicy === 'all') {
                                        errorsFromStore = updatedResult.errors;
                                    }
                                    if (fetchMoreForQueryId || fetchPolicy === 'no-cache') {
                                        resultFromStore = updatedResult.data;
                                    }
                                    else {
                                        try {
                                            resultFromStore = this.dataStore.getCache().read({
                                                variables: variables,
                                                query: document,
                                                optimistic: false,
                                            });
                                        }
                                        catch (e) { }
                                    }
                                    handlingNext = false;
                                    if (complete) {
                                        subscriber.complete();
                                    }
                                    return [2];
                            }
                        });
                    }); },
                    error: function (error) {
                        _this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
                        _this.setQuery(queryId, function (_a) {
                            var subscriptions = _a.subscriptions;
                            return ({
                                subscriptions: subscriptions.filter(function (x) { return x !== subscription; }),
                            });
                        });
                        reject(error);
                    },
                    complete: function () {
                        if (!handlingNext) {
                            _this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
                            _this.setQuery(queryId, function (_a) {
                                var subscriptions = _a.subscriptions;
                                return ({
                                    subscriptions: subscriptions.filter(function (x) { return x !== subscription; }),
                                });
                            });
                            resolve({
                                data: resultFromStore,
                                errors: errorsFromStore,
                                loading: false,
                                networkStatus: exports.NetworkStatus.ready,
                                stale: false,
                            });
                        }
                        complete = true;
                    },
                };
                var subscription = obs.subscribe(subscriber);
                _this.setQuery(queryId, function (_a) {
                    var subscriptions = _a.subscriptions;
                    return ({
                        subscriptions: subscriptions.concat([subscription]),
                    });
                });
            }).catch(function (error) {
                _this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
                throw error;
            });
        };
        QueryManager.prototype.refetchQueryByName = function (queryName) {
            var _this = this;
            var refetchedQueries = this.queryIdsByName[queryName];
            if (refetchedQueries === undefined)
                return;
            return Promise.all(refetchedQueries
                .map(function (id) { return _this.getQuery(id).observableQuery; })
                .filter(function (x) { return !!x; })
                .map(function (x) { return x.refetch(); }));
        };
        QueryManager.prototype.generateRequestId = function () {
            var requestId = this.idCounter;
            this.idCounter++;
            return requestId;
        };
        QueryManager.prototype.getQuery = function (queryId) {
            return (this.queries.get(queryId) || {
                listeners: [],
                invalidated: false,
                document: null,
                newData: null,
                lastRequestId: null,
                observableQuery: null,
                subscriptions: [],
            });
        };
        QueryManager.prototype.setQuery = function (queryId, updater) {
            var prev = this.getQuery(queryId);
            var newInfo = tslib.__assign({}, prev, updater(prev));
            this.queries.set(queryId, newInfo);
        };
        QueryManager.prototype.invalidate = function (invalidated, queryId, fetchMoreForQueryId) {
            if (queryId)
                this.setQuery(queryId, function () { return ({ invalidated: invalidated }); });
            if (fetchMoreForQueryId) {
                this.setQuery(fetchMoreForQueryId, function () { return ({ invalidated: invalidated }); });
            }
        };
        QueryManager.prototype.buildOperationForLink = function (document, variables, extraContext) {
            var cache = this.dataStore.getCache();
            return {
                query: cache.transformForLink
                    ? cache.transformForLink(document)
                    : document,
                variables: variables,
                operationName: apolloUtilities.getOperationName(document) || undefined,
                context: this.prepareContext(extraContext),
            };
        };
        QueryManager.prototype.prepareContext = function (context) {
            if (context === void 0) { context = {}; }
            var newContext = this.localState.prepareContext(context);
            return tslib.__assign({}, newContext, { clientAwareness: this.clientAwareness });
        };
        QueryManager.prototype.checkInFlight = function (queryId) {
            var query = this.queryStore.get(queryId);
            return (query &&
                query.networkStatus !== exports.NetworkStatus.ready &&
                query.networkStatus !== exports.NetworkStatus.error);
        };
        QueryManager.prototype.startPollingQuery = function (options, queryId, listener) {
            var pollInterval = options.pollInterval;
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(pollInterval) : tsInvariant.invariant(pollInterval, 'Attempted to start a polling query without a polling interval.');
            if (!this.ssrMode) {
                this.pollingInfoByQueryId.set(queryId, {
                    interval: pollInterval,
                    lastPollTimeMs: Date.now() - 10,
                    options: tslib.__assign({}, options, { fetchPolicy: 'network-only' }),
                });
                if (listener) {
                    this.addQueryListener(queryId, listener);
                }
                this.schedulePoll(pollInterval);
            }
            return queryId;
        };
        QueryManager.prototype.stopPollingQuery = function (queryId) {
            this.pollingInfoByQueryId.delete(queryId);
        };
        QueryManager.prototype.schedulePoll = function (timeLimitMs) {
            var _this = this;
            var now = Date.now();
            if (this.nextPoll) {
                if (timeLimitMs < this.nextPoll.time - now) {
                    clearTimeout(this.nextPoll.timeout);
                }
                else {
                    return;
                }
            }
            this.nextPoll = {
                time: now + timeLimitMs,
                timeout: setTimeout(function () {
                    _this.nextPoll = null;
                    var nextTimeLimitMs = Infinity;
                    _this.pollingInfoByQueryId.forEach(function (info, queryId) {
                        if (info.interval < nextTimeLimitMs) {
                            nextTimeLimitMs = info.interval;
                        }
                        if (!_this.checkInFlight(queryId)) {
                            if (Date.now() - info.lastPollTimeMs >= info.interval) {
                                var updateLastPollTime = function () {
                                    info.lastPollTimeMs = Date.now();
                                };
                                _this.fetchQuery(queryId, info.options, exports.FetchType.poll).then(updateLastPollTime, updateLastPollTime);
                            }
                        }
                    });
                    if (isFinite(nextTimeLimitMs)) {
                        _this.schedulePoll(nextTimeLimitMs);
                    }
                }, timeLimitMs),
            };
        };
        return QueryManager;
    }());

    var DataStore = (function () {
        function DataStore(initialCache) {
            this.cache = initialCache;
        }
        DataStore.prototype.getCache = function () {
            return this.cache;
        };
        DataStore.prototype.markQueryResult = function (result, document, variables, fetchMoreForQueryId, ignoreErrors) {
            if (ignoreErrors === void 0) { ignoreErrors = false; }
            var writeWithErrors = !apolloUtilities.graphQLResultHasError(result);
            if (ignoreErrors && apolloUtilities.graphQLResultHasError(result) && result.data) {
                writeWithErrors = true;
            }
            if (!fetchMoreForQueryId && writeWithErrors) {
                this.cache.write({
                    result: result.data,
                    dataId: 'ROOT_QUERY',
                    query: document,
                    variables: variables,
                });
            }
        };
        DataStore.prototype.markSubscriptionResult = function (result, document, variables) {
            if (!apolloUtilities.graphQLResultHasError(result)) {
                this.cache.write({
                    result: result.data,
                    dataId: 'ROOT_SUBSCRIPTION',
                    query: document,
                    variables: variables,
                });
            }
        };
        DataStore.prototype.markMutationInit = function (mutation) {
            var _this = this;
            if (mutation.optimisticResponse) {
                var optimistic_1;
                if (typeof mutation.optimisticResponse === 'function') {
                    optimistic_1 = mutation.optimisticResponse(mutation.variables);
                }
                else {
                    optimistic_1 = mutation.optimisticResponse;
                }
                var changeFn_1 = function () {
                    _this.markMutationResult({
                        mutationId: mutation.mutationId,
                        result: { data: optimistic_1 },
                        document: mutation.document,
                        variables: mutation.variables,
                        updateQueries: mutation.updateQueries,
                        update: mutation.update,
                    });
                };
                this.cache.recordOptimisticTransaction(function (c) {
                    var orig = _this.cache;
                    _this.cache = c;
                    try {
                        changeFn_1();
                    }
                    finally {
                        _this.cache = orig;
                    }
                }, mutation.mutationId);
            }
        };
        DataStore.prototype.markMutationResult = function (mutation) {
            var _this = this;
            if (!apolloUtilities.graphQLResultHasError(mutation.result)) {
                var cacheWrites_1 = [];
                cacheWrites_1.push({
                    result: mutation.result.data,
                    dataId: 'ROOT_MUTATION',
                    query: mutation.document,
                    variables: mutation.variables,
                });
                if (mutation.updateQueries) {
                    Object.keys(mutation.updateQueries)
                        .filter(function (id) { return mutation.updateQueries[id]; })
                        .forEach(function (queryId) {
                        var _a = mutation.updateQueries[queryId], query = _a.query, updater = _a.updater;
                        var _b = _this.cache.diff({
                            query: query.document,
                            variables: query.variables,
                            returnPartialData: true,
                            optimistic: false,
                        }), currentQueryResult = _b.result, complete = _b.complete;
                        if (!complete) {
                            return;
                        }
                        var nextQueryResult = apolloUtilities.tryFunctionOrLogError(function () {
                            return updater(currentQueryResult, {
                                mutationResult: mutation.result,
                                queryName: apolloUtilities.getOperationName(query.document) || undefined,
                                queryVariables: query.variables,
                            });
                        });
                        if (nextQueryResult) {
                            cacheWrites_1.push({
                                result: nextQueryResult,
                                dataId: 'ROOT_QUERY',
                                query: query.document,
                                variables: query.variables,
                            });
                        }
                    });
                }
                this.cache.performTransaction(function (c) {
                    cacheWrites_1.forEach(function (write) { return c.write(write); });
                });
                var update_1 = mutation.update;
                if (update_1) {
                    this.cache.performTransaction(function (c) {
                        apolloUtilities.tryFunctionOrLogError(function () { return update_1(c, mutation.result); });
                    });
                }
            }
        };
        DataStore.prototype.markMutationComplete = function (_a) {
            var mutationId = _a.mutationId, optimisticResponse = _a.optimisticResponse;
            if (!optimisticResponse)
                return;
            this.cache.removeOptimistic(mutationId);
        };
        DataStore.prototype.markUpdateQueryResult = function (document, variables, newResult) {
            this.cache.write({
                result: newResult,
                dataId: 'ROOT_QUERY',
                variables: variables,
                query: document,
            });
        };
        DataStore.prototype.reset = function () {
            return this.cache.reset();
        };
        return DataStore;
    }());

    var version = "2.5.0-beta.1";

    var hasSuggestedDevtools = false;
    var ApolloClient = (function () {
        function ApolloClient(options) {
            var _this = this;
            this.defaultOptions = {};
            this.resetStoreCallbacks = [];
            this.clearStoreCallbacks = [];
            this.clientAwareness = {};
            var cache = options.cache, _a = options.ssrMode, ssrMode = _a === void 0 ? false : _a, _b = options.ssrForceFetchDelay, ssrForceFetchDelay = _b === void 0 ? 0 : _b, connectToDevTools = options.connectToDevTools, _c = options.queryDeduplication, queryDeduplication = _c === void 0 ? true : _c, defaultOptions = options.defaultOptions, resolvers = options.resolvers, typeDefs = options.typeDefs, fragmentMatcher = options.fragmentMatcher, clientAwarenessName = options.name, clientAwarenessVersion = options.version;
            var link = options.link;
            if (!link && resolvers) {
                link = apolloLink.ApolloLink.empty();
            }
            if (!link || !cache) {
                throw process.env.NODE_ENV === "production" ? new tsInvariant.InvariantError() : new tsInvariant.InvariantError("\n        In order to initialize Apollo Client, you must specify link & cache properties on the config object.\n        This is part of the required upgrade when migrating from Apollo Client 1.0 to Apollo Client 2.0.\n        For more information, please visit:\n          https://www.apollographql.com/docs/react/basics/setup.html\n        to help you get started.\n      ");
            }
            var supportedCache = new Map();
            var supportedDirectives = new apolloLink.ApolloLink(function (operation, forward) {
                var result = supportedCache.get(operation.query);
                if (!result) {
                    result = apolloUtilities.removeConnectionDirectiveFromDocument(operation.query);
                    supportedCache.set(operation.query, result);
                    supportedCache.set(result, result);
                }
                operation.query = result;
                return forward(operation);
            });
            this.link = supportedDirectives.concat(link);
            this.cache = cache;
            this.store = new DataStore(cache);
            this.disableNetworkFetches = ssrMode || ssrForceFetchDelay > 0;
            this.queryDeduplication = queryDeduplication;
            this.ssrMode = ssrMode;
            this.defaultOptions = defaultOptions || {};
            if (ssrForceFetchDelay) {
                setTimeout(function () { return (_this.disableNetworkFetches = false); }, ssrForceFetchDelay);
            }
            this.watchQuery = this.watchQuery.bind(this);
            this.query = this.query.bind(this);
            this.mutate = this.mutate.bind(this);
            this.resetStore = this.resetStore.bind(this);
            this.reFetchObservableQueries = this.reFetchObservableQueries.bind(this);
            var defaultConnectToDevTools = process.env.NODE_ENV !== 'production' &&
                typeof window !== 'undefined' &&
                !window.__APOLLO_CLIENT__;
            if (typeof connectToDevTools === 'undefined'
                ? defaultConnectToDevTools
                : connectToDevTools && typeof window !== 'undefined') {
                window.__APOLLO_CLIENT__ = this;
            }
            if (!hasSuggestedDevtools && process.env.NODE_ENV !== 'production') {
                hasSuggestedDevtools = true;
                if (typeof window !== 'undefined' &&
                    window.document &&
                    window.top === window.self) {
                    if (typeof window.__APOLLO_DEVTOOLS_GLOBAL_HOOK__ === 'undefined') {
                        if (window.navigator &&
                            window.navigator.userAgent &&
                            window.navigator.userAgent.indexOf('Chrome') > -1) {
                            console.debug('Download the Apollo DevTools ' +
                                'for a better development experience: ' +
                                'https://chrome.google.com/webstore/detail/apollo-client-developer-t/jdkknkkbebbapilgoeccciglkfbmbnfm');
                        }
                    }
                }
            }
            this.version = version;
            if (clientAwarenessName) {
                this.clientAwareness.name = clientAwarenessName;
            }
            if (clientAwarenessVersion) {
                this.clientAwareness.version = clientAwarenessVersion;
            }
            this.localState = new LocalState({
                cache: cache,
                client: this,
                resolvers: resolvers,
                typeDefs: typeDefs,
                fragmentMatcher: fragmentMatcher,
            });
        }
        ApolloClient.prototype.stop = function () {
            if (this.queryManager) {
                this.queryManager.stop();
            }
        };
        ApolloClient.prototype.watchQuery = function (options) {
            if (this.defaultOptions.watchQuery) {
                options = tslib.__assign({}, this.defaultOptions.watchQuery, options);
            }
            if (this.disableNetworkFetches &&
                (options.fetchPolicy === 'network-only' ||
                    options.fetchPolicy === 'cache-and-network')) {
                options = tslib.__assign({}, options, { fetchPolicy: 'cache-first' });
            }
            return this.initQueryManager().watchQuery(options);
        };
        ApolloClient.prototype.query = function (options) {
            if (this.defaultOptions.query) {
                options = tslib.__assign({}, this.defaultOptions.query, options);
            }
            process.env.NODE_ENV === "production" ? tsInvariant.invariant(options.fetchPolicy !== 'cache-and-network') : tsInvariant.invariant(options.fetchPolicy !== 'cache-and-network', 'cache-and-network fetchPolicy can only be used with watchQuery');
            if (this.disableNetworkFetches && options.fetchPolicy === 'network-only') {
                options = tslib.__assign({}, options, { fetchPolicy: 'cache-first' });
            }
            return this.initQueryManager().query(options);
        };
        ApolloClient.prototype.mutate = function (options) {
            if (this.defaultOptions.mutate) {
                options = tslib.__assign({}, this.defaultOptions.mutate, options);
            }
            return this.initQueryManager().mutate(options);
        };
        ApolloClient.prototype.subscribe = function (options) {
            return this.initQueryManager().startGraphQLSubscription(options);
        };
        ApolloClient.prototype.readQuery = function (options, optimistic) {
            if (optimistic === void 0) { optimistic = false; }
            return this.initProxy().readQuery(options, optimistic);
        };
        ApolloClient.prototype.readFragment = function (options, optimistic) {
            if (optimistic === void 0) { optimistic = false; }
            return this.initProxy().readFragment(options, optimistic);
        };
        ApolloClient.prototype.writeQuery = function (options) {
            var result = this.initProxy().writeQuery(options);
            this.initQueryManager().broadcastQueries();
            return result;
        };
        ApolloClient.prototype.writeFragment = function (options) {
            var result = this.initProxy().writeFragment(options);
            this.initQueryManager().broadcastQueries();
            return result;
        };
        ApolloClient.prototype.writeData = function (options) {
            var result = this.initProxy().writeData(options);
            this.initQueryManager().broadcastQueries();
            return result;
        };
        ApolloClient.prototype.__actionHookForDevTools = function (cb) {
            this.devToolsHookCb = cb;
        };
        ApolloClient.prototype.__requestRaw = function (payload) {
            return apolloLink.execute(this.link, payload);
        };
        ApolloClient.prototype.initQueryManager = function () {
            var _this = this;
            if (!this.queryManager) {
                this.queryManager = new QueryManager({
                    link: this.link,
                    store: this.store,
                    queryDeduplication: this.queryDeduplication,
                    ssrMode: this.ssrMode,
                    clientAwareness: this.clientAwareness,
                    localState: this.localState,
                    onBroadcast: function () {
                        if (_this.devToolsHookCb) {
                            _this.devToolsHookCb({
                                action: {},
                                state: {
                                    queries: _this.queryManager
                                        ? _this.queryManager.queryStore.getStore()
                                        : {},
                                    mutations: _this.queryManager
                                        ? _this.queryManager.mutationStore.getStore()
                                        : {},
                                },
                                dataWithOptimisticResults: _this.cache.extract(true),
                            });
                        }
                    },
                });
            }
            return this.queryManager;
        };
        ApolloClient.prototype.resetStore = function () {
            var _this = this;
            return Promise.resolve()
                .then(function () {
                return _this.queryManager
                    ? _this.queryManager.clearStore()
                    : Promise.resolve(null);
            })
                .then(function () { return Promise.all(_this.resetStoreCallbacks.map(function (fn) { return fn(); })); })
                .then(function () {
                return _this.queryManager && _this.queryManager.reFetchObservableQueries
                    ? _this.queryManager.reFetchObservableQueries()
                    : Promise.resolve(null);
            });
        };
        ApolloClient.prototype.clearStore = function () {
            var _this = this;
            var queryManager = this.queryManager;
            return Promise.resolve()
                .then(function () { return Promise.all(_this.clearStoreCallbacks.map(function (fn) { return fn(); })); })
                .then(function () {
                return queryManager ? queryManager.clearStore() : Promise.resolve(null);
            });
        };
        ApolloClient.prototype.onResetStore = function (cb) {
            var _this = this;
            this.resetStoreCallbacks.push(cb);
            return function () {
                _this.resetStoreCallbacks = _this.resetStoreCallbacks.filter(function (c) { return c !== cb; });
            };
        };
        ApolloClient.prototype.onClearStore = function (cb) {
            var _this = this;
            this.clearStoreCallbacks.push(cb);
            return function () {
                _this.clearStoreCallbacks = _this.clearStoreCallbacks.filter(function (c) { return c !== cb; });
            };
        };
        ApolloClient.prototype.reFetchObservableQueries = function (includeStandby) {
            return this.queryManager
                ? this.queryManager.reFetchObservableQueries(includeStandby)
                : Promise.resolve(null);
        };
        ApolloClient.prototype.extract = function (optimistic) {
            return this.initProxy().extract(optimistic);
        };
        ApolloClient.prototype.restore = function (serializedState) {
            return this.initProxy().restore(serializedState);
        };
        ApolloClient.prototype.addResolvers = function (resolvers) {
            this.localState.addResolvers(resolvers);
        };
        ApolloClient.prototype.setResolvers = function (resolvers) {
            this.localState.setResolvers(resolvers);
        };
        ApolloClient.prototype.getResolvers = function () {
            return this.localState.getResolvers();
        };
        ApolloClient.prototype.setLocalStateFragmentMatcher = function (fragmentMatcher) {
            this.localState.setFragmentMatcher(fragmentMatcher);
        };
        ApolloClient.prototype.initProxy = function () {
            if (!this.proxy) {
                this.initQueryManager();
                this.proxy = this.cache;
            }
            return this.proxy;
        };
        return ApolloClient;
    }());

    exports.default = ApolloClient;
    exports.ApolloClient = ApolloClient;
    exports.ObservableQuery = ObservableQuery;
    exports.isApolloError = isApolloError;
    exports.ApolloError = ApolloError;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=bundle.umd.js.map
